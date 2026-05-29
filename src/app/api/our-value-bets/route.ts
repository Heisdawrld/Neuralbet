// ═══════════════════════════════════════════════════════════════════════
// /api/our-value-bets
//
// LEGACY URL — kept alive for frontend compatibility (value-bets.tsx).
// Now backed by the V5 engine via the value-bet adapter.
//
// Returns a flat list of qualifying value bets across upcoming fixtures
// in the configured window, sorted by edge descending.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import { runV5Prediction } from '@/lib/prediction-engine/v5';
import {
  adaptV5ToValueBets,
  type ValueBet,
  type ValueBetMatch,
} from '@/lib/prediction-engine/v5/adapters/value-bet';

export const revalidate = 300; // 5 minutes

let dbReady = false;
async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

export async function GET() {
  try {
    await ensureDb();
    const db = getTursoClient();

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    // Pull upcoming fixtures in the window (cap at 100 to keep response time sane)
    const fixtures = await db.execute({
      sql: `SELECT e.id, e.event_date, e.status,
                   e.home_team, e.away_team, e.home_team_id, e.away_team_id,
                   e.league_id, l.name AS league_name
            FROM events e
            LEFT JOIN leagues l ON e.league_id = l.id
            WHERE e.event_date >= ? AND e.event_date <= ?
              AND e.status = 'notstarted'
            ORDER BY e.event_date ASC
            LIMIT 100`,
      args: [`${today}T00:00:00Z`, `${nextWeek}T23:59:59Z`],
    });

    // Run V5 per-fixture in concurrency-capped batches
    const CONCURRENCY = 6;
    const allBets: ValueBet[] = [];

    for (let i = 0; i < fixtures.rows.length; i += CONCURRENCY) {
      const batch = fixtures.rows.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (row) => {
          const match: ValueBetMatch = {
            id: Number(row.id),
            homeTeam: row.home_team as string,
            awayTeam: row.away_team as string,
            homeTeamId: Number(row.home_team_id) || 0,
            awayTeamId: Number(row.away_team_id) || 0,
            leagueId: Number(row.league_id) || 0,
            leagueName: (row.league_name as string) || `League ${row.league_id}`,
            eventDate: row.event_date as string,
            status: (row.status as string) || 'notstarted',
            homeScore: null, awayScore: null,
            currentMinute: null, period: '',
          };
          try {
            const v5 = await runV5Prediction(match.id);
            return adaptV5ToValueBets(v5, { match });
          } catch (err) {
            console.error(`[value-bets] V5 failed for event ${match.id}:`, err);
            return [];
          }
        }),
      );
      for (const r of results) allBets.push(...r);
    }

    // Final sort by edge desc (we sort per-fixture in the adapter but
    // need to re-sort the merged list)
    const sorted = allBets.sort((a, b) => b.edge - a.edge);

    return NextResponse.json({
      results: sorted,
      count: sorted.length,
    });
  } catch (error) {
    console.error('V5-backed value-bets API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate value bets' },
      { status: 500 },
    );
  }
}
