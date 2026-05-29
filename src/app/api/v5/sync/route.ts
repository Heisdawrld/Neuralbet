// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Sync + Enrichment API
//
// POST /api/v5/sync
// Body: { "date": "2026-05-28" }  // optional, defaults to today
//
// Fetches fixtures from BSD API for a date range (today-2 to today+7),
// inserts/updates events, leagues, teams, odds, standings, and lineups.
// Returns a summary of records synced.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, safeExecute } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import { bsdClient } from '@/lib/bsd-client';
import { syncH2HForUpcomingFixtures } from '@/lib/db/sync-h2h';
import { verifyAllPendingResults } from '@/lib/prediction-engine/v5/results/verify';

export const dynamic = 'force-dynamic';

let dbReady = false;

async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

interface SyncStats {
  events: number;
  leagues: number;
  teams: number;
  odds: number;
  standings: number;
  lineups: number;
  h2h: number;
  errors: string[];
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();

    const body = await request.json().catch(() => ({}));
    const targetDate = body.date || new Date().toISOString().split('T')[0];

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const db = getTursoClient();
    const stats: SyncStats = {
      events: 0,
      leagues: 0,
      teams: 0,
      odds: 0,
      standings: 0,
      lineups: 0,
      h2h: 0,
      errors: [],
    };

    // ── Compute date range: today-2 to today+7 ────────────────────
    const target = new Date(targetDate);
    const fromDate = new Date(target);
    fromDate.setDate(fromDate.getDate() - 2);
    const toDate = new Date(target);
    toDate.setDate(toDate.getDate() + 7);

    const dateFrom = fromDate.toISOString().split('T')[0];
    const dateTo = toDate.toISOString().split('T')[0];

    // ── Step 1: Fetch fixtures from BSD API ────────────────────────
    let bsdEvents: any[] = [];
    try {
      bsdEvents = await bsdClient.fetchEvents(dateFrom, dateTo);
    } catch (err: any) {
      stats.errors.push(`BSD API fetch failed: ${err.message}`);
      return NextResponse.json({
        success: false,
        date: targetDate,
        dateRange: { from: dateFrom, to: dateTo },
        stats,
        error: 'Failed to fetch from BSD API',
      }, { status: 502 });
    }

    if (bsdEvents.length === 0) {
      return NextResponse.json({
        success: true,
        date: targetDate,
        dateRange: { from: dateFrom, to: dateTo },
        stats,
        message: 'No fixtures found for the date range',
      });
    }

    // ── Step 2: Upsert events ──────────────────────────────────────
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
            home_score_ht = excluded.home_score_ht,
            away_score_ht = excluded.away_score_ht,
            period = excluded.period,
            current_minute = excluded.current_minute,
            weather_code = excluded.weather_code,
            weather_description = excluded.weather_description,
            weather_wind_speed = excluded.weather_wind_speed,
            weather_temperature_c = excluded.weather_temperature_c,
            attendance = excluded.attendance,
            travel_distance_km = excluded.travel_distance_km,
            pitch_condition = excluded.pitch_condition,
            synced_at = datetime('now')`,
          args: [
            e.id, e.league_id, e.home_team_id, e.home_team, e.away_team_id, e.away_team,
            e.home_coach_id ?? null, e.away_coach_id ?? null, e.referee_id ?? null, e.venue_id ?? null,
            e.event_date, e.status, e.round_number ?? null, e.period ?? null, e.current_minute ?? null,
            e.home_score ?? 0, e.away_score ?? 0, e.home_score_ht ?? null, e.away_score_ht ?? null,
            e.is_local_derby ? 1 : 0, e.is_neutral_ground ? 1 : 0, e.travel_distance_km ?? 0,
            e.weather?.code ?? null, e.weather?.description ?? null, e.weather?.wind_speed ?? null, e.weather?.temperature_c ?? null,
            e.pitch_condition ?? null, e.attendance ?? null,
          ],
        });
        stats.events++;
      } catch (err: any) {
        stats.errors.push(`Event ${e.id}: ${err.message}`);
      }
    }

    // ── Step 3: Upsert leagues ─────────────────────────────────────
    const leagueIds = [...new Set(bsdEvents.map((e: any) => Number(e.league_id)))];
    for (const leagueId of leagueIds) {
      try {
        // Find league name from events
        const eventWithLeague = bsdEvents.find((e: any) => Number(e.league_id) === leagueId);
        const leagueName = eventWithLeague?.league_name || `League ${leagueId}`;
        const leagueCountry = eventWithLeague?.league_country || null;
        const leagueLogoUrl = bsdClient.getLeagueLogoUrl(leagueId);

        await db.execute({
          sql: `INSERT INTO leagues (id, name, country, logo_url, is_active, synced_at)
                VALUES (?, ?, ?, ?, 1, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  logo_url = COALESCE(excluded.logo_url, leagues.logo_url),
                  synced_at = datetime('now')`,
          args: [leagueId, leagueName, leagueCountry, leagueLogoUrl],
        });
        stats.leagues++;
      } catch (err: any) {
        stats.errors.push(`League ${leagueId}: ${err.message}`);
      }
    }

    // ── Step 4: Upsert teams ───────────────────────────────────────
    const teamMap = new Map<number, string>();
    for (const e of bsdEvents) {
      if (e.home_team_id) teamMap.set(Number(e.home_team_id), e.home_team as string);
      if (e.away_team_id) teamMap.set(Number(e.away_team_id), e.away_team as string);
    }

    for (const [teamId, teamName] of teamMap) {
      try {
        await db.execute({
          sql: `INSERT INTO teams (id, name, synced_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  synced_at = datetime('now')`,
          args: [teamId, teamName],
        });
        stats.teams++;
      } catch (err: any) {
        stats.errors.push(`Team ${teamId}: ${err.message}`);
      }
    }

    // ── Step 5: Fetch and store odds (batched) ─────────────────────
    const upcomingEventIds = bsdEvents
      .filter((e: any) => e.status === 'notstarted')
      .map((e: any) => Number(e.id))
      .slice(0, 100); // Limit to avoid API overload

    const oddsBatchSize = 10;
    for (let i = 0; i < upcomingEventIds.length; i += oddsBatchSize) {
      const batch = upcomingEventIds.slice(i, i + oddsBatchSize);
      const oddsPromises = batch.map(async (eventId: number) => {
        try {
          const data = await bsdClient.fetchEventOdds(eventId);
          const o = data?.odds || data || {};

          await db.execute({
            sql: `INSERT INTO event_odds (
              event_id, home_win, draw, away_win,
              over_15_goals, over_25_goals, over_35_goals,
              under_15_goals, under_25_goals, under_35_goals,
              btts_yes, btts_no,
              double_chance_1x, double_chance_12, double_chance_x2,
              draw_no_bet_home, draw_no_bet_away,
              synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(event_id) DO UPDATE SET
              home_win = excluded.home_win,
              draw = excluded.draw,
              away_win = excluded.away_win,
              over_15_goals = excluded.over_15_goals,
              over_25_goals = excluded.over_25_goals,
              over_35_goals = excluded.over_35_goals,
              under_15_goals = excluded.under_15_goals,
              under_25_goals = excluded.under_25_goals,
              under_35_goals = excluded.under_35_goals,
              btts_yes = excluded.btts_yes,
              btts_no = excluded.btts_no,
              double_chance_1x = excluded.double_chance_1x,
              double_chance_12 = excluded.double_chance_12,
              double_chance_x2 = excluded.double_chance_x2,
              draw_no_bet_home = excluded.draw_no_bet_home,
              draw_no_bet_away = excluded.draw_no_bet_away,
              synced_at = datetime('now')`,
            args: [
              eventId,
              o.home_win ?? null, o.draw ?? null, o.away_win ?? null,
              o.over_15_goals ?? null, o.over_25_goals ?? null, o.over_35_goals ?? null,
              o.under_15_goals ?? null, o.under_25_goals ?? null, o.under_35_goals ?? null,
              o.btts_yes ?? null, o.btts_no ?? null,
              o.double_chance_1x ?? null, o.double_chance_12 ?? null, o.double_chance_x2 ?? null,
              o.draw_no_bet_home ?? null, o.draw_no_bet_away ?? null,
            ],
          });
          return 1;
        } catch {
          return 0;
        }
      });

      const results = await Promise.all(oddsPromises);
      stats.odds += results.reduce((sum: number, r: number) => sum + r, 0);
    }

    // ── Step 6: Fetch and store standings (per league) ─────────────
    for (const leagueId of leagueIds) {
      try {
        const standings = await bsdClient.fetchStandings(leagueId);
        for (const s of standings) {
          try {
            await db.execute({
              sql: `INSERT INTO standings (
                league_id, season_id, team_id, team_name, position,
                played, won, drawn, lost, gf, ga, gd, pts,
                xgf, xga, xgd, xg_games, form, is_live, synced_at
              ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(league_id, season_id, team_id) DO UPDATE SET
                position = excluded.position,
                played = excluded.played,
                won = excluded.won,
                drawn = excluded.drawn,
                lost = excluded.lost,
                gf = excluded.gf,
                ga = excluded.ga,
                gd = excluded.gd,
                pts = excluded.pts,
                xgf = excluded.xgf,
                xga = excluded.xga,
                xgd = excluded.xgd,
                xg_games = excluded.xg_games,
                form = excluded.form,
                is_live = excluded.is_live,
                synced_at = datetime('now')`,
              args: [
                leagueId, s.team_id, s.team_name, s.position,
                s.played, s.won, s.drawn, s.lost, s.gf, s.ga, s.gd, s.pts,
                s.xgf ?? 0, s.xga ?? 0, s.xgd ?? 0, s.xg_games ?? 0, s.form ?? '', s.live ? 1 : 0,
              ],
            });
            stats.standings++;
          } catch {
            // Skip individual standing errors
          }
        }
      } catch (err: any) {
        stats.errors.push(`Standings league ${leagueId}: ${err.message}`);
      }
    }

    // ── Step 7: Fetch and store lineups (events within 24h) ────────
    const lineupEventIds = bsdEvents
      .filter((e: any) => {
        if (e.status !== 'notstarted') return false;
        try {
          const eventDate = new Date(e.event_date);
          const now = new Date();
          const diff = eventDate.getTime() - now.getTime();
          return diff > 0 && diff < 24 * 60 * 60 * 1000; // Within 24 hours
        } catch {
          return false;
        }
      })
      .map((e: any) => Number(e.id))
      .slice(0, 30);

    for (const eventId of lineupEventIds) {
      try {
        const data = await bsdClient.fetchEventLineups(eventId);
        const lineups = data?.lineups || data || {};

        await db.execute({
          sql: `INSERT INTO event_lineups (
            event_id, lineup_status, home_formation, away_formation,
            home_confidence, away_confidence,
            home_players_json, away_players_json,
            home_substitutes_json, away_substitutes_json,
            home_unavailable_json, away_unavailable_json,
            updated_at, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(event_id) DO UPDATE SET
            lineup_status = excluded.lineup_status,
            home_formation = excluded.home_formation,
            away_formation = excluded.away_formation,
            home_confidence = excluded.home_confidence,
            away_confidence = excluded.away_confidence,
            home_players_json = excluded.home_players_json,
            away_players_json = excluded.away_players_json,
            home_substitutes_json = excluded.home_substitutes_json,
            away_substitutes_json = excluded.away_substitutes_json,
            home_unavailable_json = excluded.home_unavailable_json,
            away_unavailable_json = excluded.away_unavailable_json,
            updated_at = excluded.updated_at,
            synced_at = datetime('now')`,
          args: [
            eventId,
            data.lineup_status || lineups.lineup_status || 'unavailable',
            lineups?.home?.formation ?? null, lineups?.away?.formation ?? null,
            lineups?.home?.confidence ?? null, lineups?.away?.confidence ?? null,
            JSON.stringify(lineups?.home?.players ?? []),
            JSON.stringify(lineups?.away?.players ?? []),
            JSON.stringify(lineups?.home?.substitutes ?? []),
            JSON.stringify(lineups?.away?.substitutes ?? []),
            JSON.stringify(data?.unavailable_players?.home ?? []),
            JSON.stringify(data?.unavailable_players?.away ?? []),
            data?.updated_at ?? null,
          ],
        });
        stats.lineups++;
      } catch {
        // Lineup data may not be available for all events
      }
    }

    // ── Step 8: Sync H2H for upcoming fixtures (background-style) ─
    // Pulls last 10 meetings from BSD for each upcoming fixture that
    // lacks fresh H2H data. Idempotent and concurrency-capped.
    try {
      const h2hStats = await syncH2HForUpcomingFixtures(7);
      stats.h2h = h2hStats.h2hRowsWritten;
      if (h2hStats.errors.length > 0) {
        stats.errors.push(...h2hStats.errors.slice(0, 5));
      }
    } catch (err: any) {
      stats.errors.push(`H2H sync failed: ${err?.message ?? err}`);
    }

    // ── Step 9: Verify finished match results ──────────────────
    // Scores finished matches against predictions for accuracy tracking.
    let verifyStats = { verified: 0, hitRate: 0, avgBrier: 0 };
    try {
      const vResult = await verifyAllPendingResults();
      verifyStats = {
        verified: vResult.verified,
        hitRate: vResult.accuracy.hitRate,
        avgBrier: vResult.accuracy.avgBrier,
      };
    } catch (err: any) {
      stats.errors.push(`Verify failed: ${err?.message ?? err}`);
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      dateRange: { from: dateFrom, to: dateTo },
      stats,
      verification: verifyStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[V5 Sync] Error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    );
  }
}
