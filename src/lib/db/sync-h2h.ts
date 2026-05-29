// ═══════════════════════════════════════════════════════════════════════
// H2H sync — populate historical_matches with the last N meetings
//                between each pair of teams in an upcoming fixture
//
// WHY THIS EXISTS
// ────────────────
// The V5 engine's xG Layer 7 (h2h-blend.ts) reads historical H2H from
// the `historical_matches` table and blends 15-28% of historic average
// goals into total xG. Before this module, that table was NEVER
// populated by any sync job — Layer 7 silently never fired for ~80%
// of fixtures.
//
// HOW IT WORKS
// ────────────
// For each upcoming fixture in the next 7 days:
//   1. Skip if we already have ≥3 fresh H2H rows for that fixture
//      (synced within the last 30 days)
//   2. Hit BSD: /teams/{homeTeamId}/fixtures/?status=finished
//      &date_from=4y_ago — returns up to 200 finished matches for
//      that home team
//   3. Filter for fixtures where the OPPONENT matches awayTeamId
//   4. Insert up to MAX_H2H_PER_FIXTURE rows into historical_matches
//      with type='h2h' and fixture_id = upcoming fixture's id
//
// IDEMPOTENT — re-running is safe. We delete-then-insert per fixture so
// stale data doesn't accumulate.
//
// CONCURRENCY-CAPPED — H2H_CONCURRENCY parallel BSD calls; respects
// BSD's rate limits.
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from './turso-client';

const BSD_API_KEY = process.env.BSD_API_KEY || '';
const BSD_BASE_URL = process.env.BSD_API_BASE_URL || 'https://sports.bzzoiro.com/api/v2/';

// ─────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────

/** Max H2H meetings to store per upcoming fixture (Layer 7 uses up to 10). */
export const MAX_H2H_PER_FIXTURE = 10;

/** How far back to look on BSD for past meetings. */
export const H2H_LOOKBACK_YEARS = 4;

/** Skip re-syncing fixtures whose H2H was synced within this many days. */
export const H2H_FRESH_DAYS = 30;

/** Engine's Layer-7 minimum sample size. We aim to populate at least this
 *  many rows when BSD has them — but happily store fewer (the engine
 *  layer is no-op for sample < 3 anyway). */
export const H2H_MIN_USEFUL_SAMPLE = 3;

/** How many BSD calls to fire in parallel. BSD caps at ~10 rps so 6 is safe. */
export const H2H_CONCURRENCY = 6;

/** Cap on fixtures to process per sync run (safety net). */
export const MAX_FIXTURES_PER_RUN = 200;

// ─────────────────────────────────────────────────────────────────────
// BSD fetcher (kept local to avoid coupling with src/lib/bsd-h2h.ts —
// that one is for runtime route fallback; this one is for sync job)
// ─────────────────────────────────────────────────────────────────────

interface BsdFixtureRow {
  id: number;
  home_team_id: number;
  away_team_id: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  event_date: string;
  status: string;
  league_id: number;
}

async function fetchTeamFinishedFixtures(teamId: number): Promise<BsdFixtureRow[]> {
  if (!BSD_API_KEY) return [];
  const dateFrom = new Date(Date.now() - H2H_LOOKBACK_YEARS * 365 * 86400000)
    .toISOString().slice(0, 10);
  const url = new URL(`teams/${teamId}/fixtures/`, BSD_BASE_URL);
  url.searchParams.set('status', 'finished');
  url.searchParams.set('date_from', `${dateFrom}T00:00:00Z`);
  url.searchParams.set('limit', '200');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${BSD_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────

export interface H2HSyncStats {
  fixturesScanned: number;
  fixturesSkippedFresh: number;
  fixturesWithoutHomeTeam: number;
  bsdCallsMade: number;
  bsdCallsFailed: number;
  h2hRowsWritten: number;
  fixturesWithH2HFound: number;
  fixturesWithNoH2H: number;
  errors: string[];
  runMs: number;
}

/** Filter a team's finished-fixture list down to meetings with the opponent. */
export function pickMeetings(
  homeTeamId: number,
  awayTeamId: number,
  fixtures: BsdFixtureRow[],
): BsdFixtureRow[] {
  return fixtures
    .filter((f) =>
      (f.home_team_id === homeTeamId && f.away_team_id === awayTeamId)
      || (f.away_team_id === homeTeamId && f.home_team_id === awayTeamId),
    )
    .filter((f) => f.home_score != null && f.away_score != null)
    .slice(0, MAX_H2H_PER_FIXTURE);
}

/**
 * Sync H2H for ONE upcoming fixture. Returns the number of rows written.
 * Returns 0 (without error) when:
 *   - BSD has no past meetings
 *   - We already have fresh H2H for this fixture (skipped)
 *   - BSD_API_KEY missing
 */
export async function syncH2HForFixture(
  fixtureId: number,
  homeTeamId: number,
  awayTeamId: number,
  options: { force?: boolean } = {},
): Promise<{ rowsWritten: number; skipped: 'fresh' | null; meetingsFound: number }> {
  const db = getTursoClient();

  // 1. Freshness check — skip if we synced within H2H_FRESH_DAYS
  if (!options.force) {
    const freshCutoff = new Date(Date.now() - H2H_FRESH_DAYS * 86400000).toISOString();
    const existing = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM historical_matches
            WHERE fixture_id = ? AND type = 'h2h' AND synced_at > ?`,
      args: [fixtureId, freshCutoff],
    });
    const count = Number(existing.rows[0]?.c || 0);
    if (count >= H2H_MIN_USEFUL_SAMPLE) {
      return { rowsWritten: 0, skipped: 'fresh', meetingsFound: count };
    }
  }

  // 2. Pull from BSD
  const allFixtures = await fetchTeamFinishedFixtures(homeTeamId);
  const meetings = pickMeetings(homeTeamId, awayTeamId, allFixtures);

  // 3. Wipe old rows for this fixture + insert fresh
  await db.execute({
    sql: `DELETE FROM historical_matches WHERE fixture_id = ? AND type = 'h2h'`,
    args: [fixtureId],
  });

  if (meetings.length === 0) return { rowsWritten: 0, skipped: null, meetingsFound: 0 };

  let rowsWritten = 0;
  for (const m of meetings) {
    try {
      await db.execute({
        sql: `INSERT INTO historical_matches (
          fixture_id, type, home_team_id, away_team_id,
          home_team, away_team, home_score, away_score,
          home_goals, away_goals, date, league_id, synced_at
        ) VALUES (?, 'h2h', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          fixtureId,
          m.home_team_id, m.away_team_id,
          m.home_team, m.away_team,
          m.home_score, m.away_score,
          m.home_score, m.away_score,
          m.event_date,
          m.league_id ?? null,
        ],
      });
      rowsWritten++;
    } catch {
      // skip individual row failures, keep going
    }
  }

  return { rowsWritten, skipped: null, meetingsFound: meetings.length };
}

/**
 * Sync H2H for every upcoming fixture in the next N days that lacks fresh
 * H2H data. Concurrency-capped, idempotent.
 */
export async function syncH2HForUpcomingFixtures(daysAhead: number = 7): Promise<H2HSyncStats> {
  const startedAt = Date.now();
  const stats: H2HSyncStats = {
    fixturesScanned: 0,
    fixturesSkippedFresh: 0,
    fixturesWithoutHomeTeam: 0,
    bsdCallsMade: 0,
    bsdCallsFailed: 0,
    h2hRowsWritten: 0,
    fixturesWithH2HFound: 0,
    fixturesWithNoH2H: 0,
    errors: [],
    runMs: 0,
  };

  const db = getTursoClient();
  const today = new Date().toISOString().slice(0, 10);
  const ahead = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

  let fixtures: any[] = [];
  try {
    const r = await db.execute({
      sql: `SELECT id, home_team_id, away_team_id
            FROM events
            WHERE status = 'notstarted'
              AND event_date >= ? AND event_date <= ?
              AND home_team_id IS NOT NULL AND away_team_id IS NOT NULL
            ORDER BY event_date ASC
            LIMIT ?`,
      args: [`${today}T00:00:00Z`, `${ahead}T23:59:59Z`, MAX_FIXTURES_PER_RUN],
    });
    fixtures = r.rows || [];
  } catch (err: any) {
    stats.errors.push(`Fixture query failed: ${err?.message ?? err}`);
    stats.runMs = Date.now() - startedAt;
    return stats;
  }

  stats.fixturesScanned = fixtures.length;

  // Run in concurrency-capped batches
  for (let i = 0; i < fixtures.length; i += H2H_CONCURRENCY) {
    const batch = fixtures.slice(i, i + H2H_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (row) => {
        const fixtureId = Number(row.id);
        const homeTeamId = Number(row.home_team_id);
        const awayTeamId = Number(row.away_team_id);
        if (!fixtureId || !homeTeamId || !awayTeamId) {
          return { skipped: true as const, reason: 'no_team' as const };
        }
        try {
          // syncH2HForFixture returns { rowsWritten, skipped: 'fresh'|null, meetingsFound }
          return await syncH2HForFixture(fixtureId, homeTeamId, awayTeamId);
        } catch (err: any) {
          const msg = err?.message || err?.toString?.() || JSON.stringify(err) || 'no error info';
          const name = err?.constructor?.name || 'unknown';
          return { skipped: true as const, reason: 'error' as const, message: `${name}: ${msg}` };
        }
      }),
    );
    for (const r of results) {
      // Branch 1: outer-skip (no team data or error before sync ran)
      if ((r as any).skipped === true) {
        if ((r as any).reason === 'no_team') stats.fixturesWithoutHomeTeam++;
        else stats.errors.push(`H2H sync error: ${(r as any).message ?? 'unknown'}`);
        continue;
      }
      // Branch 2: sync ran. r has shape { skipped: 'fresh' | null, rowsWritten, meetingsFound }
      const sub = r as { skipped: 'fresh' | null; rowsWritten: number; meetingsFound: number };
      if (sub.skipped === 'fresh') {
        stats.fixturesSkippedFresh++;
        continue;
      }
      // BSD was actually called
      stats.bsdCallsMade++;
      if (sub.rowsWritten > 0) {
        stats.fixturesWithH2HFound++;
        stats.h2hRowsWritten += sub.rowsWritten;
      } else {
        stats.fixturesWithNoH2H++;
      }
    }
  }

  stats.runMs = Date.now() - startedAt;
  return stats;
}
