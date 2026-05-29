// ═══════════════════════════════════════════════════════════════════════
// /api/v4/predictions
//
// LEGACY URL — kept alive for frontend compatibility. The route now uses
// the V5 engine internally and adapts results to the v4 PunterTipV4 shape.
//
// Frontend consumers (predictions.tsx, lib/api.ts#fetchV4Tips) need no
// changes. When all frontend code has been migrated to a v5-native shape,
// this route can be deleted and v4 along with it.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import { runV5Prediction } from '@/lib/prediction-engine/v5';
import {
  adaptV5ToPunterTip,
  type PunterTipV4,
  type PunterTipQuality,
} from '@/lib/prediction-engine/v5/adapters/punter-tip';

export const dynamic = 'force-dynamic';

let dbReady = false;
async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

const QUALITY_ORDER: Record<PunterTipQuality, number> = {
  gold: 4, silver: 3, bronze: 2, skip: 1,
};

function meetsMinQuality(tip: PunterTipV4, minQuality: PunterTipQuality): boolean {
  const tipQuality: PunterTipQuality = tip.tip?.quality ?? 'skip';
  return QUALITY_ORDER[tipQuality] >= QUALITY_ORDER[minQuality];
}

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const db = getTursoClient();

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;
    const leagueId = searchParams.get('league_id') ? Number(searchParams.get('league_id')) : undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100;
    const minQuality = (searchParams.get('min_quality') as PunterTipQuality | null) ?? undefined;

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const from = dateFrom ?? today;
    const to = dateTo ?? nextWeek;

    // Load the fixture list directly (V5 engine works per-fixture)
    let sql = `SELECT e.id, e.event_date, e.status, e.league_id, e.home_team_id, e.away_team_id,
                      l.name AS league_name
               FROM events e
               LEFT JOIN leagues l ON e.league_id = l.id
               WHERE e.event_date >= ? AND e.event_date <= ?`;
    const args: any[] = [`${from}T00:00:00Z`, `${to}T23:59:59Z`];
    if (leagueId) { sql += ' AND e.league_id = ?'; args.push(leagueId); }
    sql += ' ORDER BY e.event_date ASC LIMIT ?';
    args.push(Math.max(1, Math.min(500, limit)));

    const fixtureRows = await db.execute({ sql, args });

    // Run V5 for each fixture in parallel (capped concurrency to avoid Turso overload)
    const CONCURRENCY = 6;
    const tips: PunterTipV4[] = [];
    for (let i = 0; i < fixtureRows.rows.length; i += CONCURRENCY) {
      const batch = fixtureRows.rows.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (row) => {
          try {
            const v5 = await runV5Prediction(Number(row.id));
            return adaptV5ToPunterTip(v5, {
              leagueId: Number(row.league_id) || 0,
              leagueName: (row.league_name as string) || `League ${row.league_id}`,
              homeTeamId: Number(row.home_team_id) || 0,
              awayTeamId: Number(row.away_team_id) || 0,
              eventDate: row.event_date as string,
              status: row.status as string,
            });
          } catch (err) {
            console.error(`[V4-compat] Failed for event ${row.id}:`, err);
            return null;
          }
        }),
      );
      tips.push(...results.filter((t): t is PunterTipV4 => t !== null));
    }

    const filtered = minQuality ? tips.filter((t) => meetsMinQuality(t, minQuality)) : tips;

    const gold = filtered.filter((t) => t.tip?.quality === 'gold').length;
    const silver = filtered.filter((t) => t.tip?.quality === 'silver').length;
    const bronze = filtered.filter((t) => t.tip?.quality === 'bronze').length;
    const skipped = filtered.filter((t) => t.tip === null).length;

    return NextResponse.json({
      results: filtered,
      count: filtered.length,
      stats: { gold, silver, bronze, skipped, withTip: gold + silver + bronze },
      // We expose v5 as the engine version since that's now what's powering this route.
      // The PunterTipV4 SHAPE is preserved — only the engine version string changes.
      engineVersion: '5.0.0-via-v4-compat',
    });
  } catch (error) {
    console.error('V4-compat Predictions API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate predictions' },
      { status: 500 },
    );
  }
}
