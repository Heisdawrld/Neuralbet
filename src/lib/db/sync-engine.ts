// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — BSD API → Turso Sync Engine
//
// Fetches ALL data from BSD API and stores to our Turso database.
// The prediction engine reads from Turso, never from the API directly.
//
// Sync schedule:
// - events:        every 5 min  (upcoming + live)
// - standings:     every 30 min (league tables + xG)
// - odds:          every 3 min  (consensus + movement)
// - lineups:       every 10 min (close to kickoff → more frequent)
// - managers:      every 24 hrs (rarely changes)
// - referees:      every 24 hrs
// - player-stats:  every 60 min (for finished matches)
// - polymarket:    every 5 min
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from './turso-client';

const BSD_API_KEY = process.env.BSD_API_KEY || '';
const BSD_BASE_URL = process.env.BSD_API_BASE_URL || 'https://sports.bzzoiro.com/api/v2/';

// ── BSD API Fetcher ───────────────────────────────────────────────
async function fetchBSD<T>(path: string): Promise<T> {
  const url = `${BSD_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${BSD_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`BSD API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Sync Tracker ──────────────────────────────────────────────────
async function updateSyncTracker(
  syncType: string,
  recordsSynced: number,
  status: string = 'success',
  errorMessage?: string
): Promise<void> {
  const db = getTursoClient();
  await db.execute({
    sql: `INSERT INTO sync_tracker (sync_type, last_sync_at, records_synced, status, error_message)
          VALUES (?, datetime('now'), ?, ?, ?)
          ON CONFLICT(sync_type) DO UPDATE SET
            last_sync_at = datetime('now'),
            records_synced = ?,
            status = ?,
            error_message = ?`,
    args: [syncType, recordsSynced, status, errorMessage ?? null, recordsSynced, status, errorMessage ?? null],
  });
}

// ══════════════════════════════════════════════════════════════════
// SYNC 1: Events (upcoming + finished for Elo)
// ══════════════════════════════════════════════════════════════════

interface BsdEvent {
  id: number;
  league_id: number;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  home_coach_id?: number;
  away_coach_id?: number;
  referee_id?: number;
  venue_id?: number;
  event_date: string;
  status: string;
  round_number?: number;
  period?: string;
  current_minute?: number;
  home_score: number | null;
  away_score: number | null;
  home_score_ht?: number | null;
  away_score_ht?: number | null;
  is_local_derby?: boolean;
  is_neutral_ground?: boolean;
  travel_distance_km?: number;
  weather?: { code?: number; description?: string; wind_speed?: number; temperature_c?: number };
  pitch_condition?: number;
  attendance?: number | null;
}

export async function syncEvents(status: string = 'notstarted', limit: number = 200): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let path = `events/?status=${status}&limit=${limit}&date_from=${today}&date_to=${nextWeek}`;
    const data = await fetchBSD<{ results?: BsdEvent[]; count?: number }>(path);
    const events = data.results || [];

    for (const e of events) {
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
        synced++;
      } catch (err) {
        // Skip individual event errors
      }
    }

    await updateSyncTracker(`events_${status}`, synced);
  } catch (err: any) {
    await updateSyncTracker(`events_${status}`, 0, 'error', err.message);
  }

  return synced;
}

// Also sync finished events (for Elo ratings)
export async function syncFinishedEvents(days: number = 30): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];

    const data = await fetchBSD<{ results?: BsdEvent[] }>(
      `events/?status=finished&date_from=${from}&date_to=${to}&limit=500`
    );
    const events = data.results || [];

    for (const e of events) {
      try {
        await db.execute({
          sql: `INSERT INTO events (
            id, league_id, home_team_id, home_team, away_team_id, away_team,
            home_coach_id, away_coach_id, referee_id, venue_id,
            event_date, status, home_score, away_score, home_score_ht, away_score_ht,
            is_local_derby, is_neutral_ground, travel_distance_km,
            weather_code, weather_description, weather_wind_speed, weather_temperature_c,
            pitch_condition, attendance, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            home_score = excluded.home_score,
            away_score = excluded.away_score,
            home_score_ht = excluded.home_score_ht,
            away_score_ht = excluded.away_score_ht,
            synced_at = datetime('now')`,
          args: [
            e.id, e.league_id, e.home_team_id, e.home_team, e.away_team_id, e.away_team,
            e.home_coach_id ?? null, e.away_coach_id ?? null, e.referee_id ?? null, e.venue_id ?? null,
            e.event_date, e.status, e.home_score ?? 0, e.away_score ?? 0,
            e.home_score_ht ?? null, e.away_score_ht ?? null,
            e.is_local_derby ? 1 : 0, e.is_neutral_ground ? 1 : 0, e.travel_distance_km ?? 0,
            e.weather?.code ?? null, e.weather?.description ?? null, e.weather?.wind_speed ?? null, e.weather?.temperature_c ?? null,
            e.pitch_condition ?? null, e.attendance ?? null,
          ],
        });
        synced++;
      } catch (err) {
        // Skip individual errors
      }
    }

    await updateSyncTracker('events_finished', synced);
  } catch (err: any) {
    await updateSyncTracker('events_finished', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 2: Standings (league tables with xG)
// ══════════════════════════════════════════════════════════════════

export async function syncStandings(leagueIds?: number[]): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    // If no league IDs provided, get all active leagues from our events table
    if (!leagueIds || leagueIds.length === 0) {
      const result = await db.execute(
        `SELECT DISTINCT league_id FROM events WHERE status = 'notstarted'`
      );
      leagueIds = result.rows.map((r) => Number(r.league_id));
    }

    for (const leagueId of leagueIds) {
      try {
        const data = await fetchBSD<{
          league_id: number;
          standings: Array<{
            position: number;
            team_id: number;
            team_name: string;
            played: number;
            won: number;
            drawn: number;
            lost: number;
            gf: number;
            ga: number;
            gd: number;
            pts: number;
            xgf: number | null;
            xga: number | null;
            xgd: number | null;
            xg_games: number | null;
            form: string | null;
            live: boolean;
          }>;
        }>(`leagues/${leagueId}/standings/`);

        for (const s of data.standings || []) {
          await db.execute({
            sql: `INSERT INTO standings (
              league_id, season_id, team_id, team_name, position,
              played, won, drawn, lost, gf, ga, gd, pts,
              xgf, xga, xgd, xg_games, form, is_live, synced_at
            ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
          synced++;
        }
      } catch (err) {
        // Skip individual league errors
      }
    }

    await updateSyncTracker('standings', synced);
  } catch (err: any) {
    await updateSyncTracker('standings', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 3: Odds (consensus per event)
// ══════════════════════════════════════════════════════════════════

export async function syncOdds(eventIds?: number[]): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    if (!eventIds || eventIds.length === 0) {
      const result = await db.execute(
        `SELECT id FROM events WHERE status = 'notstarted' ORDER BY event_date ASC LIMIT 150`
      );
      eventIds = result.rows.map((r) => Number(r.id));
    }

    // Fetch odds in batches
    const batchSize = 10;
    for (let i = 0; i < eventIds.length; i += batchSize) {
      const batch = eventIds.slice(i, i + batchSize);
      const promises = batch.map(async (eventId) => {
        try {
          const data = await fetchBSD<{
            event_id: number;
            odds: {
              home_win: number | null;
              draw: number | null;
              away_win: number | null;
              over_15_goals: number | null;
              over_25_goals: number | null;
              over_35_goals: number | null;
              under_15_goals: number | null;
              under_25_goals: number | null;
              under_35_goals: number | null;
              btts_yes: number | null;
              btts_no: number | null;
              double_chance_1x?: number | null;
              double_chance_12?: number | null;
              double_chance_x2?: number | null;
              draw_no_bet_home?: number | null;
              draw_no_bet_away?: number | null;
            };
          }>(`events/${eventId}/odds/`);

          const o = data.odds;
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
              eventId, o.home_win, o.draw, o.away_win,
              o.over_15_goals, o.over_25_goals, o.over_35_goals,
              o.under_15_goals, o.under_25_goals, o.under_35_goals,
              o.btts_yes, o.btts_no,
              (o as any).double_chance_1x ?? null, (o as any).double_chance_12 ?? null, (o as any).double_chance_x2 ?? null,
              (o as any).draw_no_bet_home ?? null, (o as any).draw_no_bet_away ?? null,
            ],
          });
          return 1;
        } catch {
          return 0;
        }
      });

      const results = await Promise.all(promises);
      synced += results.reduce((s: number, r: number) => s + r, 0);
    }

    await updateSyncTracker('odds', synced);
  } catch (err: any) {
    await updateSyncTracker('odds', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 4: Lineups
// ══════════════════════════════════════════════════════════════════

export async function syncLineups(eventIds?: number[]): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    if (!eventIds || eventIds.length === 0) {
      const result = await db.execute(
        `SELECT id FROM events WHERE status = 'notstarted'
         AND event_date <= datetime('now', '+24 hours')
         ORDER BY event_date ASC LIMIT 50`
      );
      eventIds = result.rows.map((r) => Number(r.id));
    }

    for (const eventId of eventIds) {
      try {
        const data = await fetchBSD<{
          event_id: number;
          lineup_status: string;
          lineups: {
            home: { formation?: string; confidence?: number; players?: any[]; substitutes?: any[] };
            away: { formation?: string; confidence?: number; players?: any[]; substitutes?: any[] };
          };
          unavailable_players?: { home?: any[]; away?: any[] };
          updated_at?: string;
        }>(`events/${eventId}/lineups/`);

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
            eventId, data.lineup_status,
            data.lineups?.home?.formation ?? null, data.lineups?.away?.formation ?? null,
            data.lineups?.home?.confidence ?? null, data.lineups?.away?.confidence ?? null,
            JSON.stringify(data.lineups?.home?.players ?? []),
            JSON.stringify(data.lineups?.away?.players ?? []),
            JSON.stringify(data.lineups?.home?.substitutes ?? []),
            JSON.stringify(data.lineups?.away?.substitutes ?? []),
            JSON.stringify(data.unavailable_players?.home ?? []),
            JSON.stringify(data.unavailable_players?.away ?? []),
            data.updated_at ?? null,
          ],
        });
        synced++;
      } catch {
        // Skip individual event errors
      }
    }

    await updateSyncTracker('lineups', synced);
  } catch (err: any) {
    await updateSyncTracker('lineups', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 5: Event Stats (xG, shots, possession)
// ══════════════════════════════════════════════════════════════════

export async function syncEventStats(eventIds?: number[]): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    if (!eventIds || eventIds.length === 0) {
      // Get finished events that don't have stats yet
      const result = await db.execute(
        `SELECT e.id FROM events e
         LEFT JOIN event_stats es ON e.id = es.event_id
         WHERE e.status = 'finished' AND es.event_id IS NULL
         ORDER BY e.event_date DESC LIMIT 100`
      );
      eventIds = result.rows.map((r) => Number(r.id));
    }

    const batchSize = 5;
    for (let i = 0; i < eventIds.length; i += batchSize) {
      const batch = eventIds.slice(i, i + batchSize);
      const promises = batch.map(async (eventId) => {
        try {
          const data = await fetchBSD<any>(`events/${eventId}/stats/`);
          const stats = data.stats || {};
          const home = stats.home || {};
          const away = stats.away || {};

          await db.execute({
            sql: `INSERT INTO event_stats (
              event_id,
              home_total_shots, away_total_shots,
              home_ball_possession, away_ball_possession,
              home_pass_accuracy, away_pass_accuracy,
              home_xg, away_xg,
              home_attacks, away_attacks,
              home_dangerous_attacks, away_dangerous_attacks,
              home_corners, away_corners,
              home_fouls, away_fouls,
              home_offsides, away_offsides,
              home_yellow_cards, away_yellow_cards,
              home_red_cards, away_red_cards,
              home_shots_on_target, away_shots_on_target,
              home_shots_inside_box, away_shots_inside_box,
              home_shots_outside_box, away_shots_outside_box,
              shotmap_json, momentum_json, xg_per_minute_json,
              synced_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
            )
            ON CONFLICT(event_id) DO UPDATE SET
              home_total_shots = excluded.home_total_shots,
              away_total_shots = excluded.away_total_shots,
              home_xg = excluded.home_xg,
              away_xg = excluded.away_xg,
              home_ball_possession = excluded.home_ball_possession,
              away_ball_possession = excluded.away_ball_possession,
              shotmap_json = excluded.shotmap_json,
              momentum_json = excluded.momentum_json,
              synced_at = datetime('now')`,
            args: [
              eventId,
              home.total_shots ?? 0, away.total_shots ?? 0,
              home.ball_possession ?? 0, away.ball_possession ?? 0,
              home.pass_accuracy_pct ?? 0, away.pass_accuracy_pct ?? 0,
              home.xg?.actual ?? 0, away.xg?.actual ?? 0,
              home.attack ?? 0, away.attack ?? 0,
              home.dangerous_attack ?? 0, away.dangerous_attack ?? 0,
              home.corners ?? 0, away.corners ?? 0,
              home.fouls ?? 0, away.fouls ?? 0,
              home.offsides ?? 0, away.offsides ?? 0,
              home.yellow_cards ?? 0, away.yellow_cards ?? 0,
              home.red_cards ?? 0, away.red_cards ?? 0,
              home.shots_on_target ?? 0, away.shots_on_target ?? 0,
              home.shots_inside_box ?? 0, away.shots_inside_box ?? 0,
              home.shots_outside_box ?? 0, away.shots_outside_box ?? 0,
              JSON.stringify(data.shotmap ?? []),
              JSON.stringify(data.momentum ?? []),
              JSON.stringify(data.xg_per_minute ?? []),
            ],
          });
          return 1;
        } catch {
          return 0;
        }
      });

      const results = await Promise.all(promises);
      synced += results.reduce((s: number, r: number) => s + r, 0);
    }

    await updateSyncTracker('event_stats', synced);
  } catch (err: any) {
    await updateSyncTracker('event_stats', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 6: Managers
// ══════════════════════════════════════════════════════════════════

export async function syncManagers(): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    // Get manager IDs from upcoming events
    const result = await db.execute(
      `SELECT DISTINCT home_coach_id as manager_id FROM events WHERE home_coach_id IS NOT NULL
       UNION
       SELECT DISTINCT away_coach_id FROM events WHERE away_coach_id IS NOT NULL`
    );
    const managerIds = result.rows.map((r) => Number(r.manager_id)).filter((id) => id > 0);

    for (const managerId of managerIds) {
      try {
        const data = await fetchBSD<any>(`managers/${managerId}/`);

        await db.execute({
          sql: `INSERT INTO managers (
            id, name, short_name, country, tactical_profile, preferred_formation,
            current_team_id, matches_total, wins, draws, losses, win_pct,
            avg_goals_scored, avg_goals_conceded, avg_possession,
            clean_sheet_pct, btts_pct, over_25_pct, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            tactical_profile = excluded.tactical_profile,
            preferred_formation = excluded.preferred_formation,
            matches_total = excluded.matches_total,
            wins = excluded.wins,
            losses = excluded.losses,
            win_pct = excluded.win_pct,
            avg_goals_scored = excluded.avg_goals_scored,
            avg_goals_conceded = excluded.avg_goals_conceded,
            avg_possession = excluded.avg_possession,
            clean_sheet_pct = excluded.clean_sheet_pct,
            btts_pct = excluded.btts_pct,
            over_25_pct = excluded.over_25_pct,
            synced_at = datetime('now')`,
          args: [
            data.id, data.name, data.short_name, data.country,
            data.tactical_profile, data.preferred_formation,
            data.current_team_id, data.matches_total, data.wins, data.draws, data.losses,
            data.win_pct, data.avg_goals_scored, data.avg_goals_conceded, data.avg_possession,
            data.clean_sheet_pct, data.btts_pct, data.over_25_pct,
          ],
        });
        synced++;
      } catch {
        // Skip individual errors
      }
    }

    await updateSyncTracker('managers', synced);
  } catch (err: any) {
    await updateSyncTracker('managers', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 7: Referees
// ══════════════════════════════════════════════════════════════════

export async function syncReferees(): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    const result = await db.execute(
      `SELECT DISTINCT referee_id FROM events WHERE referee_id IS NOT NULL`
    );
    const refereeIds = result.rows.map((r) => Number(r.referee_id)).filter((id) => id > 0);

    for (const refereeId of refereeIds) {
      try {
        const data = await fetchBSD<any>(`referees/${refereeId}/`);

        await db.execute({
          sql: `INSERT INTO referees (
            id, name, country, birthdate, matches,
            total_yellow_cards, total_red_cards,
            avg_yellow_per_match, avg_red_per_match,
            avg_goals_per_match, avg_fouls_per_match,
            career_games, career_yellow_cards, career_red_cards, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            matches = excluded.matches,
            avg_yellow_per_match = excluded.avg_yellow_per_match,
            avg_goals_per_match = excluded.avg_goals_per_match,
            avg_fouls_per_match = excluded.avg_fouls_per_match,
            career_games = excluded.career_games,
            synced_at = datetime('now')`,
          args: [
            data.id, data.name, data.country, data.birthdate, data.matches,
            data.total_yellow_cards, data.total_red_cards,
            data.avg_yellow_per_match, data.avg_red_per_match,
            data.avg_goals_per_match, data.avg_fouls_per_match,
            data.career_games, data.career_yellow_cards, data.career_red_cards,
          ],
        });
        synced++;
      } catch {
        // Skip individual errors
      }
    }

    await updateSyncTracker('referees', synced);
  } catch (err: any) {
    await updateSyncTracker('referees', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 8: Polymarket
// ══════════════════════════════════════════════════════════════════

export async function syncPolymarket(eventIds?: number[]): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    if (!eventIds || eventIds.length === 0) {
      const result = await db.execute(
        `SELECT id FROM events WHERE status = 'notstarted' ORDER BY event_date ASC LIMIT 50`
      );
      eventIds = result.rows.map((r) => Number(r.id));
    }

    for (const eventId of eventIds) {
      try {
        const data = await fetchBSD<any>(`events/${eventId}/polymarket/`);
        if (data && data.markets) {
          const prices: Record<string, number> = {};
          for (const m of data.markets) {
            if (m.outcome && m.price) {
              prices[m.outcome] = m.price;
            }
          }

          await db.execute({
            sql: `INSERT INTO polymarket_odds (event_id, home_win_price, draw_price, away_win_price, over_25_price, under_25_price, btts_yes_price, synced_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                  ON CONFLICT(event_id) DO UPDATE SET
                    home_win_price = excluded.home_win_price,
                    draw_price = excluded.draw_price,
                    away_win_price = excluded.away_win_price,
                    over_25_price = excluded.over_25_price,
                    under_25_price = excluded.under_25_price,
                    btts_yes_price = excluded.btts_yes_price,
                    synced_at = datetime('now')`,
            args: [
              eventId,
              prices['Home'] ?? prices['home'] ?? null,
              prices['Draw'] ?? prices['draw'] ?? null,
              prices['Away'] ?? prices['away'] ?? null,
              prices['Over 2.5'] ?? prices['over_25'] ?? null,
              prices['Under 2.5'] ?? prices['under_25'] ?? null,
              prices['BTTS Yes'] ?? prices['btts_yes'] ?? null,
            ],
          });
          synced++;
        }
      } catch {
        // Polymarket data may not be available for all events
      }
    }

    await updateSyncTracker('polymarket', synced);
  } catch (err: any) {
    await updateSyncTracker('polymarket', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 9: Leagues
// ══════════════════════════════════════════════════════════════════

export async function syncLeagues(): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    const data = await fetchBSD<{
      results?: Array<{
        id: number;
        name: string;
        country: string;
        is_women: boolean;
        is_active: boolean;
        current_season?: { id: number; name: string; year: string };
      }>;
    }>('leagues/?is_active=true&limit=200');

    for (const l of data.results || []) {
      try {
        await db.execute({
          sql: `INSERT INTO leagues (id, name, country, is_women, is_active, current_season_id, current_season_name, current_season_year, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  is_active = excluded.is_active,
                  current_season_id = excluded.current_season_id,
                  current_season_name = excluded.current_season_name,
                  current_season_year = excluded.current_season_year,
                  synced_at = datetime('now')`,
          args: [
            l.id, l.name, l.country,
            l.is_women ? 1 : 0, l.is_active ? 1 : 0,
            l.current_season?.id ?? null,
            l.current_season?.name ?? null,
            l.current_season?.year ?? null,
          ],
        });
        synced++;
      } catch {
        // Skip individual errors
      }
    }

    await updateSyncTracker('leagues', synced);
  } catch (err: any) {
    await updateSyncTracker('leagues', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 10: Odds Movement (multi-bookmaker for steam detection)
// ══════════════════════════════════════════════════════════════════

export async function syncOddsMovement(eventIds?: number[]): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    if (!eventIds || eventIds.length === 0) {
      const result = await db.execute(
        `SELECT id FROM events WHERE status = 'notstarted' ORDER BY event_date ASC LIMIT 50`
      );
      eventIds = result.rows.map((r) => Number(r.id));
    }

    for (const eventId of eventIds) {
      try {
        // Fetch multi-bookmaker odds with movement data
        const data = await fetchBSD<{
          event_id: number;
          markets?: Array<{
            market: string;
            outcome: string;
            bookmaker_slug?: string;
            bookmaker_name?: string;
            decimal_odds?: number;
            previous_decimal_odds?: number | null;
            implied_probability?: number;
            movement?: string;
            is_max_quote?: boolean;
            updated_at?: string;
          }>;
        }>(`events/${eventId}/odds/movement/`);

        if (data?.markets && Array.isArray(data.markets)) {
          // Clear old movement data for this event and insert fresh
          await db.execute({
            sql: `DELETE FROM odds_movement WHERE event_id = ?`,
            args: [eventId],
          });

          for (const m of data.markets) {
            if (m.decimal_odds && m.market && m.outcome) {
              await db.execute({
                sql: `INSERT INTO odds_movement (
                  event_id, market, outcome, bookmaker_slug, bookmaker_name,
                  decimal_odds, previous_decimal_odds, implied_probability,
                  movement, is_max_quote, updated_at, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                args: [
                  eventId,
                  m.market,
                  m.outcome,
                  m.bookmaker_slug ?? null,
                  m.bookmaker_name ?? null,
                  m.decimal_odds,
                  m.previous_decimal_odds ?? null,
                  m.implied_probability ?? null,
                  m.movement ?? null,
                  m.is_max_quote ? 1 : 0,
                  m.updated_at ?? null,
                ],
              });
              synced++;
            }
          }
        }
      } catch {
        // Odds movement data may not be available for all events
      }
    }

    await updateSyncTracker('odds_movement', synced);
  } catch (err: any) {
    await updateSyncTracker('odds_movement', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 11: In-Play Events (live matches for the live page)
// ══════════════════════════════════════════════════════════════════

export async function syncInPlayEvents(): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    const data = await fetchBSD<{ results?: BsdEvent[] }>(
      `events/?status=in&limit=200`
    );
    const events = data.results || [];

    for (const e of events) {
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
            attendance = excluded.attendance,
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
        synced++;
      } catch {
        // Skip individual errors
      }
    }

    await updateSyncTracker('events_inplay', synced);
  } catch (err: any) {
    await updateSyncTracker('events_inplay', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// SYNC 12: Incidents (goals, cards, substitutions for match detail)
// ══════════════════════════════════════════════════════════════════

export async function syncIncidents(eventIds?: number[]): Promise<number> {
  const db = getTursoClient();
  let synced = 0;

  try {
    if (!eventIds || eventIds.length === 0) {
      // Get events that are in-play or recently finished
      const result = await db.execute(
        `SELECT id FROM events WHERE status IN ('in', 'finished')
         ORDER BY event_date DESC LIMIT 50`
      );
      eventIds = result.rows.map((r) => Number(r.id));
    }

    for (const eventId of eventIds) {
      try {
        const data = await fetchBSD<{
          event_id: number;
          incidents?: Array<{
            incident_type: string;
            minute?: number;
            player_name?: string;
            player_id?: number;
            is_home?: boolean;
            card_type?: string;
            player_in?: string;
            player_out?: string;
            player_in_id?: number;
            player_out_id?: number;
          }>;
        }>(`events/${eventId}/incidents/`);

        if (data?.incidents && Array.isArray(data.incidents)) {
          // Clear old incidents and insert fresh
          await db.execute({
            sql: `DELETE FROM event_incidents WHERE event_id = ?`,
            args: [eventId],
          });

          for (const inc of data.incidents) {
            await db.execute({
              sql: `INSERT INTO event_incidents (
                event_id, incident_type, minute, player_name, player_id,
                is_home, card_type, player_in, player_out, player_in_id, player_out_id,
                synced_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
              args: [
                eventId,
                inc.incident_type,
                inc.minute ?? null,
                inc.player_name ?? null,
                inc.player_id ?? null,
                inc.is_home ? 1 : 0,
                inc.card_type ?? null,
                inc.player_in ?? null,
                inc.player_out ?? null,
                inc.player_in_id ?? null,
                inc.player_out_id ?? null,
              ],
            });
            synced++;
          }
        }
      } catch {
        // Incidents may not be available for all events
      }
    }

    await updateSyncTracker('incidents', synced);
  } catch (err: any) {
    await updateSyncTracker('incidents', 0, 'error', err.message);
  }

  return synced;
}

// ══════════════════════════════════════════════════════════════════
// MASTER SYNC — Run all syncs in order
// ══════════════════════════════════════════════════════════════════

export async function runFullSync(): Promise<{
  events: number;
  finishedEvents: number;
  standings: number;
  odds: number;
  lineups: number;
  managers: number;
  referees: number;
  leagues: number;
  oddsMovement: number;
}> {
  console.log('[SYNC] Starting full sync...');

  // Phase 1: Core data
  const leagues = await syncLeagues();
  console.log(`[SYNC] Leagues: ${leagues}`);
  const events = await syncEvents('notstarted');
  console.log(`[SYNC] Upcoming events: ${events}`);
  const finishedEvents = await syncFinishedEvents(30);
  console.log(`[SYNC] Finished events: ${finishedEvents}`);

  // Phase 2: Dependent data
  const standings = await syncStandings();
  console.log(`[SYNC] Standings: ${standings}`);

  // Phase 3: Market data (async-friendly)
  const [odds, lineups, managers, referees] = await Promise.all([
    syncOdds(),
    syncLineups(),
    syncManagers(),
    syncReferees(),
  ]);

  console.log(`[SYNC] Odds: ${odds}, Lineups: ${lineups}, Managers: ${managers}, Referees: ${referees}`);

  // Phase 4: Deep stats + odds movement (slower, less critical)
  const oddsMovement = await syncOddsMovement();
  console.log(`[SYNC] Odds movement: ${oddsMovement}`);
  syncEventStats().then((n) => console.log(`[SYNC] Event stats: ${n}`));
  syncPolymarket().then((n) => console.log(`[SYNC] Polymarket: ${n}`));
  syncIncidents().then((n) => console.log(`[SYNC] Incidents: ${n}`));

  return { events, finishedEvents, standings, odds, lineups, managers, referees, leagues, oddsMovement };
}

// Quick sync for frequently changing data (called every few minutes)
export async function runQuickSync(): Promise<{
  events: number;
  odds: number;
  lineups: number;
  inPlay: number;
}> {
  const [events, odds, lineups, inPlay] = await Promise.all([
    syncEvents('notstarted'),
    syncOdds(),
    syncLineups(),
    syncInPlayEvents(),
  ]);

  return { events, odds, lineups, inPlay };
}
