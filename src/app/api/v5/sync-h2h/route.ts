// ═══════════════════════════════════════════════════════════════════════
// /api/v5/sync-h2h
//
// Standalone H2H sync — pulls past meetings between team pairs from BSD
// and stores them in historical_matches.
//
// USAGE
//   GET  /api/v5/sync-h2h?days=7              # default — 7 days ahead, skip fresh
//   GET  /api/v5/sync-h2h?days=30&force=1     # 30 days ahead, force re-sync
//   POST /api/v5/sync-h2h
//     body: { fixtureId: 9456 }               # sync ONE fixture's H2H
//
// Use this for:
//   - One-time backfill (curl ?days=30)
//   - On-demand refresh from the match panel UI (POST {fixtureId})
//   - Smoke-testing the H2H pipeline
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db/schema';
import { getTursoClient } from '@/lib/db/turso-client';
import {
  syncH2HForUpcomingFixtures,
  syncH2HForFixture,
} from '@/lib/db/sync-h2h';

export const dynamic = 'force-dynamic';

let dbReady = false;
async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days')) || 7;
    // Reserved for future: ?force=1 to bypass freshness check.
    // syncH2HForUpcomingFixtures doesn't accept force yet — we'd need to
    // thread it through. Today the freshness check is always honored.
    const stats = await syncH2HForUpcomingFixtures(days);
    return NextResponse.json({ success: true, days, stats });
  } catch (err: any) {
    console.error('[V5 H2H Sync] Error:', err);
    return NextResponse.json(
      { error: 'H2H sync failed', details: err?.message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const body = await request.json().catch(() => ({}));
    const fixtureId = Number(body?.fixtureId);
    const force = body?.force === true;

    if (!fixtureId) {
      return NextResponse.json(
        { error: 'Missing fixtureId in request body' },
        { status: 400 },
      );
    }

    // Look up the fixture's team IDs
    const db = getTursoClient();
    const r = await db.execute({
      sql: `SELECT home_team_id, away_team_id, home_team, away_team
            FROM events WHERE id = ? LIMIT 1`,
      args: [fixtureId],
    });
    const row = r.rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
    }

    const result = await syncH2HForFixture(
      fixtureId,
      Number(row.home_team_id),
      Number(row.away_team_id),
      { force },
    );

    return NextResponse.json({
      success: true,
      fixtureId,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      ...result,
    });
  } catch (err: any) {
    console.error('[V5 H2H Sync POST] Error:', err);
    return NextResponse.json(
      { error: 'H2H sync failed', details: err?.message },
      { status: 500 },
    );
  }
}
