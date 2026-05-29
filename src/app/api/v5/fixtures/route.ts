// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Fixtures API
//
// GET /api/v5/fixtures?date=2026-05-28
//
// Returns fixtures for a given date, with team logos, league info,
// and any cached predictions.
//
// If Turso has no events for that date, falls back to BSD API,
// normalizes and inserts into Turso, then returns the results.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, safeExecute } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import { bsdClient } from '@/lib/bsd-client';

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
    const date = searchParams.get('date');

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date parameter. Use format: YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const db = getTursoClient();

    // ── Step 1: Query Turso for events on that date ────────────────
    const eventsResult = await safeExecute(
      `SELECT e.*, l.name as league_name, l.logo_url as league_logo_url
       FROM events e
       LEFT JOIN leagues l ON e.league_id = l.id
       WHERE e.event_date LIKE ?
       ORDER BY e.event_date ASC`,
      [`${date}%`]
    );

    let events = eventsResult.rows || [];

    // ── Step 2: Fall back to BSD API if no events found ────────────
    if (events.length === 0) {
      try {
        const bsdEvents = await bsdClient.fetchEvents(date, date);

        if (bsdEvents.length > 0) {
          // Normalize and insert into Turso
          for (const e of bsdEvents) {
            try {
              await db.execute({
                sql: `INSERT INTO events (
                  id, league_id, home_team_id, home_team, away_team_id, away_team,
                  home_coach_id, away_coach_id, referee_id, venue_id,
                  event_date, status, round_number, period, current_minute,
                  home_score, away_score, home_score_ht, away_score_ht,
                  is_local_derby, is_neutral_ground, travel_distance_km,
                  weather_code, weather_description, weather_wind_speed, weather_temperature_c,
                  pitch_condition, attendance, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  status = excluded.status,
                  home_score = excluded.home_score,
                  away_score = excluded.away_score,
                  period = excluded.period,
                  current_minute = excluded.current_minute,
                  synced_at = datetime('now')`,
                args: [
                  e.id, e.league_id, e.home_team_id, e.home_team, e.away_team_id, e.away_team,
                  e.home_coach_id ?? null, e.away_coach_id ?? null, e.referee_id ?? null, e.venue_id ?? null,
                  e.event_date, e.status, e.round_number ?? null, e.period ?? null, e.current_minute ?? null,
                  e.home_score ?? null, e.away_score ?? null, e.home_score_ht ?? null, e.away_score_ht ?? null,
                  e.is_local_derby ? 1 : 0, e.is_neutral_ground ? 1 : 0, e.travel_distance_km ?? 0,
                  e.weather?.code ?? null, e.weather?.description ?? null, e.weather?.wind_speed ?? null, e.weather?.temperature_c ?? null,
                  e.pitch_condition ?? null, e.attendance ?? null,
                ],
              });

              // Also upsert league
              if (e.league_id && e.league_name) {
                await db.execute({
                  sql: `INSERT INTO leagues (id, name, country, logo_url, is_active, synced_at)
                        VALUES (?, ?, ?, ?, 1, datetime('now'))
                        ON CONFLICT(id) DO UPDATE SET
                          name = CASE WHEN excluded.name NOT LIKE 'League %' THEN excluded.name ELSE leagues.name END,
                          logo_url = COALESCE(excluded.logo_url, leagues.logo_url),
                          synced_at = datetime('now')`,
                  args: [e.league_id, e.league_name || `League ${e.league_id}`, e.league_country ?? null, bsdClient.getLeagueLogoUrl(e.league_id)],
                }).catch(() => {});
              }
            } catch (err) {
              // Skip individual insert errors
              console.error(`[V5 Fixtures] Error inserting event ${e.id}:`, err);
            }
          }

          // Re-query after insert
          const requery = await safeExecute(
            `SELECT e.*, l.name as league_name, l.logo_url as league_logo_url
             FROM events e
             LEFT JOIN leagues l ON e.league_id = l.id
             WHERE e.event_date LIKE ?
             ORDER BY e.event_date ASC`,
            [`${date}%`]
          );
          events = requery.rows || [];
        }
      } catch (bsdErr) {
        console.error('[V5 Fixtures] BSD API fallback failed:', bsdErr);
      }
    }

    // ── Step 3: Fetch cached predictions ───────────────────────────
    const eventIds = events.map((e: any) => Number(e.id)).filter(Boolean);
    const predictionsMap = new Map<number, any>();

    if (eventIds.length > 0) {
      try {
        const placeholders = eventIds.map(() => '?').join(',');
        const predResult = await safeExecute(
          `SELECT * FROM predictions_v2 WHERE event_id IN (${placeholders})`,
          eventIds
        );
        for (const row of predResult.rows || []) {
          predictionsMap.set(Number(row.event_id), row);
        }
      } catch {
        // predictions_v2 table may not exist yet
      }
    }

    // ── Step 4: Build response ─────────────────────────────────────
    const fixtures = events.map((e: any) => {
      const homeTeamId = Number(e.home_team_id);
      const awayTeamId = Number(e.away_team_id);
      const leagueId = Number(e.league_id);
      const eventId = Number(e.id);

      // Parse prediction from cache
      let prediction: any = null;
      const cachedPred = predictionsMap.get(eventId);
      if (cachedPred) {
        const safeParse = (val: unknown): any => {
          if (!val) return null;
          if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
          return val;
        };
        prediction = {
          bestPick: safeParse(cachedPred.best_pick_json),
          calibratedProbs: safeParse(cachedPred.calibrated_probs_json),
          expectedGoals: safeParse(cachedPred.expected_goals_json),
          noSafePick: Boolean(cachedPred.no_safe_pick),
          reasonCodes: safeParse(cachedPred.reason_codes_json) || [],
          engineVersion: cachedPred.engine_version as string,
        };
      }

      return {
        id: eventId,
        homeTeam: e.home_team as string,
        awayTeam: e.away_team as string,
        homeTeamId,
        awayTeamId,
        homeTeamLogo: bsdClient.getTeamLogoUrl(homeTeamId),
        awayTeamLogo: bsdClient.getTeamLogoUrl(awayTeamId),
        leagueId,
        leagueName: (e.league_name as string) || `League ${leagueId}`,
        leagueLogoUrl: (e.league_logo_url as string) || bsdClient.getLeagueLogoUrl(leagueId),
        status: e.status as string,
        homeScore: e.home_score != null ? Number(e.home_score) : null,
        awayScore: e.away_score != null ? Number(e.away_score) : null,
        kickoffTime: e.event_date as string,
        currentMinute: e.current_minute != null ? Number(e.current_minute) : null,
        prediction,
      };
    });

    // ── Fix league names: lookup from BSD if still showing 'League {id}' ──
    const leagueIdsToFix = new Set<number>();
    for (const f of fixtures) {
      if (f.leagueName.startsWith('League ') && /^League \d+$/.test(f.leagueName)) {
        leagueIdsToFix.add(f.leagueId);
      }
    }
    if (leagueIdsToFix.size > 0) {
      for (const lid of leagueIdsToFix) {
        try {
          const bsdLeague = await bsdClient.fetchWithRetryPublic<any>(`leagues/${lid}/`);
          if (bsdLeague?.name) {
            // Update all fixtures with this league
            for (const f of fixtures) {
              if (f.leagueId === lid) f.leagueName = bsdLeague.name;
            }
            // Store in DB for future
            await db.execute({
              sql: `UPDATE leagues SET name = ? WHERE id = ? AND (name IS NULL OR name LIKE 'League %')`,
              args: [bsdLeague.name, lid],
            }).catch(() => {});
          }
        } catch {}
      }
    }

    return NextResponse.json({
      date,
      fixtures,
    });
  } catch (error: any) {
    console.error('[V5 Fixtures] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fixtures', details: error.message },
      { status: 500 }
    );
  }
}
