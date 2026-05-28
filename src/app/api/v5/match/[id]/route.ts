// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Match Detail API
//
// GET /api/v5/match/12345
//
// Returns comprehensive match detail including event, stats, odds,
// lineups, H2H, standings, managers, referee, and prediction.
// If no prediction exists, runs the V5 engine and caches the result.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, safeExecute } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import { bsdClient } from '@/lib/bsd-client';
import { runV5Prediction } from '@/lib/prediction-engine/v5';

export const dynamic = 'force-dynamic';

let dbReady = false;

async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

/**
 * Safely parse JSON string, returning null on failure.
 */
function safeParse(val: unknown): any {
  if (!val) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();

    const { id } = await params;
    const eventId = Number(id);
    if (!eventId || isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    const db = getTursoClient();

    // ── 1. Query event from Turso ──────────────────────────────────
    const eventResult = await safeExecute(
      `SELECT e.*, l.name as league_name, l.logo_url as league_logo_url, l.country as league_country,
              v.name as venue_name, v.city as venue_city, v.capacity as venue_capacity
       FROM events e
       LEFT JOIN leagues l ON e.league_id = l.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE e.id = ?`,
      [eventId]
    );

    if (!eventResult.rows || eventResult.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventResult.rows[0];
    const leagueId = Number(event.league_id);
    const homeTeamId = Number(event.home_team_id);
    const awayTeamId = Number(event.away_team_id);

    // ── 2-7. Parallel queries for all related data ─────────────────
    const [
      statsResult, oddsResult, lineupResult,
      h2hResult, homeFormResult, awayFormResult,
      standingsResult, homeManagerResult, awayManagerResult,
      refereeResult, incidentsResult, metadataResult,
      polymarketResult, oddsMovementResult,
    ] = await Promise.all([
      // 2. Event stats
      safeExecute(`SELECT * FROM event_stats WHERE event_id = ?`, [eventId]),
      // 3. Event odds
      safeExecute(`SELECT * FROM event_odds WHERE event_id = ?`, [eventId]),
      // 4. Event lineups
      safeExecute(`SELECT * FROM event_lineups WHERE event_id = ?`, [eventId]),
      // 5. H2H historical matches
      safeExecute(
        `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = 'h2h' ORDER BY date DESC LIMIT 10`,
        [eventId]
      ).catch(() => ({ rows: [] })),
      // 6. Home form historical matches
      safeExecute(
        `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = 'home_form' ORDER BY date DESC LIMIT 10`,
        [eventId]
      ).catch(() => ({ rows: [] })),
      // 7. Away form historical matches
      safeExecute(
        `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = 'away_form' ORDER BY date DESC LIMIT 10`,
        [eventId]
      ).catch(() => ({ rows: [] })),
      // 8. Standings
      safeExecute(`SELECT * FROM standings WHERE league_id = ? ORDER BY position ASC`, [leagueId]),
      // 9. Managers
      event.home_coach_id
        ? safeExecute(`SELECT * FROM managers WHERE id = ?`, [Number(event.home_coach_id)])
        : Promise.resolve({ rows: [] }),
      event.away_coach_id
        ? safeExecute(`SELECT * FROM managers WHERE id = ?`, [Number(event.away_coach_id)])
        : Promise.resolve({ rows: [] }),
      // 10. Referee
      event.referee_id
        ? safeExecute(`SELECT * FROM referees WHERE id = ?`, [Number(event.referee_id)])
        : Promise.resolve({ rows: [] }),
      // 11. Incidents
      safeExecute(`SELECT * FROM event_incidents WHERE event_id = ? ORDER BY minute ASC`, [eventId]),
      // 12. Metadata
      safeExecute(`SELECT * FROM event_metadata WHERE event_id = ?`, [eventId]),
      // 13. Polymarket
      safeExecute(`SELECT * FROM polymarket_odds WHERE event_id = ?`, [eventId]),
      // 14. Odds movement
      safeExecute(`SELECT * FROM odds_movement WHERE event_id = ? ORDER BY market, outcome`, [eventId]),
    ]);

    // ── Fallback H2H from events table ─────────────────────────────
    let h2hData = h2hResult.rows || [];
    if (h2hData.length === 0) {
      const h2hFallback = await safeExecute(
        `SELECT home_team_id, away_team_id, home_team, away_team, home_score, away_score, event_date, status
         FROM events WHERE status = 'finished'
         AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
         AND home_score IS NOT NULL AND away_score IS NOT NULL
         ORDER BY event_date DESC LIMIT 10`,
        [homeTeamId, awayTeamId, awayTeamId, homeTeamId]
      );
      h2hData = h2hFallback.rows || [];
    }

    // ── 11. Query / generate prediction ────────────────────────────
    let prediction: any = null;
    try {
      const predResult = await safeExecute(
        `SELECT * FROM predictions_v2 WHERE event_id = ?`,
        [eventId]
      );
      const cachedPred = predResult.rows?.[0];

      if (cachedPred) {
        // Check if prediction is less than 6 hours old
        const updatedAt = new Date(cachedPred.updated_at as string);
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        if (updatedAt > sixHoursAgo) {
          prediction = {
            fixtureId: Number(cachedPred.event_id),
            homeTeam: cachedPred.home_team as string,
            awayTeam: cachedPred.away_team as string,
            expectedGoals: safeParse(cachedPred.expected_goals_json),
            bestPick: safeParse(cachedPred.best_pick_json),
            backupPicks: safeParse(cachedPred.backup_picks_json) || [],
            noSafePick: Boolean(cachedPred.no_safe_pick),
            calibratedProbs: safeParse(cachedPred.calibrated_probs_json),
            reasonCodes: safeParse(cachedPred.reason_codes_json) || [],
            dataCompleteness: Number(cachedPred.data_completeness || 0),
            engineVersion: cachedPred.engine_version as string,
            updatedAt: cachedPred.updated_at as string,
          };
        }
      }

      // If no cached prediction or expired, run V5 engine
      if (!prediction) {
        const v5Result = await runV5Prediction(eventId);
        prediction = v5Result;

        // Cache the result
        try {
          await safeExecute(
            `INSERT INTO predictions_v2 (
              event_id, home_team, away_team,
              expected_goals_json, best_pick_json, backup_picks_json,
              no_safe_pick, calibrated_probs_json, reason_codes_json,
              data_completeness, engine_version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(event_id) DO UPDATE SET
              expected_goals_json = excluded.expected_goals_json,
              best_pick_json = excluded.best_pick_json,
              backup_picks_json = excluded.backup_picks_json,
              no_safe_pick = excluded.no_safe_pick,
              calibrated_probs_json = excluded.calibrated_probs_json,
              reason_codes_json = excluded.reason_codes_json,
              data_completeness = excluded.data_completeness,
              engine_version = excluded.engine_version,
              updated_at = datetime('now')`,
            [
              eventId, event.home_team as string, event.away_team as string,
              JSON.stringify(v5Result.expectedGoals),
              v5Result.bestPick ? JSON.stringify(v5Result.bestPick) : null,
              JSON.stringify(v5Result.backupPicks),
              v5Result.noSafePick ? 1 : 0,
              JSON.stringify(v5Result.calibratedProbs),
              JSON.stringify(v5Result.reasonCodes),
              v5Result.dataCompleteness,
              v5Result.engineVersion,
            ]
          );
        } catch (cacheErr) {
          console.error(`[V5 Match] Failed to cache prediction for event ${eventId}:`, cacheErr);
        }
      }
    } catch (predErr) {
      console.error(`[V5 Match] Prediction failed for event ${eventId}:`, predErr);
    }

    // ── Build comprehensive response ───────────────────────────────
    const homeManager = homeManagerResult.rows?.[0] || null;
    const awayManager = awayManagerResult.rows?.[0] || null;
    const referee = refereeResult.rows?.[0] || null;

    const response = {
      event: {
        id: Number(event.id),
        leagueId,
        leagueName: (event.league_name as string) || `League ${leagueId}`,
        leagueLogoUrl: (event.league_logo_url as string) || bsdClient.getLeagueLogoUrl(leagueId),
        leagueCountry: (event.league_country as string) || null,
        homeTeamId,
        homeTeam: event.home_team as string,
        homeTeamLogo: bsdClient.getTeamLogoUrl(homeTeamId),
        awayTeamId,
        awayTeam: event.away_team as string,
        awayTeamLogo: bsdClient.getTeamLogoUrl(awayTeamId),
        eventDate: event.event_date as string,
        status: event.status as string,
        homeScore: event.home_score != null ? Number(event.home_score) : null,
        awayScore: event.away_score != null ? Number(event.away_score) : null,
        homeScoreHt: event.home_score_ht != null ? Number(event.home_score_ht) : null,
        awayScoreHt: event.away_score_ht != null ? Number(event.away_score_ht) : null,
        currentMinute: event.current_minute != null ? Number(event.current_minute) : null,
        period: event.period as string || null,
        roundNumber: event.round_number != null ? Number(event.round_number) : null,
        isLocalDerby: Boolean(event.is_local_derby),
        isNeutralGround: Boolean(event.is_neutral_ground),
        travelDistanceKm: Number(event.travel_distance_km || 0),
        weatherCode: event.weather_code != null ? Number(event.weather_code) : null,
        weatherDescription: event.weather_description as string || null,
        weatherWindSpeed: event.weather_wind_speed != null ? Number(event.weather_wind_speed) : null,
        weatherTemperatureC: event.weather_temperature_c != null ? Number(event.weather_temperature_c) : null,
        venue: event.venue_name ? {
          name: event.venue_name as string,
          city: event.venue_city as string,
          capacity: event.venue_capacity != null ? Number(event.venue_capacity) : null,
        } : null,
        attendance: event.attendance != null ? Number(event.attendance) : null,
      },

      stats: statsResult.rows?.[0] ? {
        homeTotalShots: Number(statsResult.rows[0].home_total_shots || 0),
        awayTotalShots: Number(statsResult.rows[0].away_total_shots || 0),
        homeShotsOnTarget: Number(statsResult.rows[0].home_shots_on_target || 0),
        awayShotsOnTarget: Number(statsResult.rows[0].away_shots_on_target || 0),
        homeBallPossession: Number(statsResult.rows[0].home_ball_possession || 0),
        awayBallPossession: Number(statsResult.rows[0].away_ball_possession || 0),
        homeXg: Number(statsResult.rows[0].home_xg || 0),
        awayXg: Number(statsResult.rows[0].away_xg || 0),
        homeCorners: Number(statsResult.rows[0].home_corners || 0),
        awayCorners: Number(statsResult.rows[0].away_corners || 0),
        homeFouls: Number(statsResult.rows[0].home_fouls || 0),
        awayFouls: Number(statsResult.rows[0].away_fouls || 0),
        homeYellowCards: Number(statsResult.rows[0].home_yellow_cards || 0),
        awayYellowCards: Number(statsResult.rows[0].away_yellow_cards || 0),
        homeRedCards: Number(statsResult.rows[0].home_red_cards || 0),
        awayRedCards: Number(statsResult.rows[0].away_red_cards || 0),
        homePassAccuracy: Number(statsResult.rows[0].home_pass_accuracy || 0),
        awayPassAccuracy: Number(statsResult.rows[0].away_pass_accuracy || 0),
      } : null,

      odds: oddsResult.rows?.[0] ? {
        homeWin: oddsResult.rows[0].home_win != null ? Number(oddsResult.rows[0].home_win) : null,
        draw: oddsResult.rows[0].draw != null ? Number(oddsResult.rows[0].draw) : null,
        awayWin: oddsResult.rows[0].away_win != null ? Number(oddsResult.rows[0].away_win) : null,
        over15: oddsResult.rows[0].over_15_goals != null ? Number(oddsResult.rows[0].over_15_goals) : null,
        over25: oddsResult.rows[0].over_25_goals != null ? Number(oddsResult.rows[0].over_25_goals) : null,
        over35: oddsResult.rows[0].over_35_goals != null ? Number(oddsResult.rows[0].over_35_goals) : null,
        under15: oddsResult.rows[0].under_15_goals != null ? Number(oddsResult.rows[0].under_15_goals) : null,
        under25: oddsResult.rows[0].under_25_goals != null ? Number(oddsResult.rows[0].under_25_goals) : null,
        under35: oddsResult.rows[0].under_35_goals != null ? Number(oddsResult.rows[0].under_35_goals) : null,
        bttsYes: oddsResult.rows[0].btts_yes != null ? Number(oddsResult.rows[0].btts_yes) : null,
        bttsNo: oddsResult.rows[0].btts_no != null ? Number(oddsResult.rows[0].btts_no) : null,
        doubleChance1x: oddsResult.rows[0].double_chance_1x != null ? Number(oddsResult.rows[0].double_chance_1x) : null,
        doubleChance12: oddsResult.rows[0].double_chance_12 != null ? Number(oddsResult.rows[0].double_chance_12) : null,
        doubleChanceX2: oddsResult.rows[0].double_chance_x2 != null ? Number(oddsResult.rows[0].double_chance_x2) : null,
        drawNoBetHome: oddsResult.rows[0].draw_no_bet_home != null ? Number(oddsResult.rows[0].draw_no_bet_home) : null,
        drawNoBetAway: oddsResult.rows[0].draw_no_bet_away != null ? Number(oddsResult.rows[0].draw_no_bet_away) : null,
      } : null,

      lineups: lineupResult.rows?.[0] ? {
        lineupStatus: lineupResult.rows[0].lineup_status as string || null,
        homeFormation: lineupResult.rows[0].home_formation as string || null,
        awayFormation: lineupResult.rows[0].away_formation as string || null,
        homeConfidence: lineupResult.rows[0].home_confidence != null ? Number(lineupResult.rows[0].home_confidence) : null,
        awayConfidence: lineupResult.rows[0].away_confidence != null ? Number(lineupResult.rows[0].away_confidence) : null,
        homePlayers: safeParse(lineupResult.rows[0].home_players_json),
        awayPlayers: safeParse(lineupResult.rows[0].away_players_json),
        homeSubstitutes: safeParse(lineupResult.rows[0].home_substitutes_json),
        awaySubstitutes: safeParse(lineupResult.rows[0].away_substitutes_json),
        homeUnavailable: safeParse(lineupResult.rows[0].home_unavailable_json),
        awayUnavailable: safeParse(lineupResult.rows[0].away_unavailable_json),
      } : null,

      h2h: h2hData.map((r: any) => ({
        homeTeamId: Number(r.home_team_id),
        awayTeamId: Number(r.away_team_id),
        homeTeam: r.home_team as string,
        awayTeam: r.away_team as string,
        homeScore: Number(r.home_score),
        awayScore: Number(r.away_score),
        date: (r.date || r.event_date) as string,
      })),

      homeForm: (homeFormResult.rows || []).map((r: any) => ({
        homeTeamId: Number(r.home_team_id),
        awayTeamId: Number(r.away_team_id),
        homeTeam: r.home_team as string,
        awayTeam: r.away_team as string,
        homeScore: Number(r.home_score),
        awayScore: Number(r.away_score),
        date: (r.date || r.event_date) as string,
      })),

      awayForm: (awayFormResult.rows || []).map((r: any) => ({
        homeTeamId: Number(r.home_team_id),
        awayTeamId: Number(r.away_team_id),
        homeTeam: r.home_team as string,
        awayTeam: r.away_team as string,
        homeScore: Number(r.home_score),
        awayScore: Number(r.away_score),
        date: (r.date || r.event_date) as string,
      })),

      standings: (standingsResult.rows || []).map((r: any) => ({
        position: Number(r.position || 0),
        teamId: Number(r.team_id),
        teamName: r.team_name as string,
        played: Number(r.played || 0),
        won: Number(r.won || 0),
        drawn: Number(r.drawn || 0),
        lost: Number(r.lost || 0),
        gf: Number(r.gf || 0),
        ga: Number(r.ga || 0),
        gd: Number(r.gd || 0),
        pts: Number(r.pts || 0),
        xgf: r.xgf != null ? Number(r.xgf) : null,
        xga: r.xga != null ? Number(r.xga) : null,
        xgd: r.xgd != null ? Number(r.xgd) : null,
        form: r.form as string || null,
      })),

      homeManager: homeManager ? {
        id: Number(homeManager.id),
        name: homeManager.name as string,
        tacticalProfile: homeManager.tactical_profile as string || null,
        preferredFormation: homeManager.preferred_formation as string || null,
        winPct: Number(homeManager.win_pct || 0),
        avgGoalsScored: Number(homeManager.avg_goals_scored || 0),
        avgGoalsConceded: Number(homeManager.avg_goals_conceded || 0),
        avgPossession: Number(homeManager.avg_possession || 0),
        cleanSheetPct: Number(homeManager.clean_sheet_pct || 0),
        bttsPct: Number(homeManager.btts_pct || 0),
        over25Pct: Number(homeManager.over_25_pct || 0),
      } : null,

      awayManager: awayManager ? {
        id: Number(awayManager.id),
        name: awayManager.name as string,
        tacticalProfile: awayManager.tactical_profile as string || null,
        preferredFormation: awayManager.preferred_formation as string || null,
        winPct: Number(awayManager.win_pct || 0),
        avgGoalsScored: Number(awayManager.avg_goals_scored || 0),
        avgGoalsConceded: Number(awayManager.avg_goals_conceded || 0),
        avgPossession: Number(awayManager.avg_possession || 0),
        cleanSheetPct: Number(awayManager.clean_sheet_pct || 0),
        bttsPct: Number(awayManager.btts_pct || 0),
        over25Pct: Number(awayManager.over_25_pct || 0),
      } : null,

      referee: referee ? {
        id: Number(referee.id),
        name: referee.name as string,
        country: referee.country as string || null,
        avgYellowPerMatch: Number(referee.avg_yellow_per_match || 0),
        avgRedPerMatch: Number(referee.avg_red_per_match || 0),
        avgGoalsPerMatch: Number(referee.avg_goals_per_match || 0),
        avgFoulsPerMatch: Number(referee.avg_fouls_per_match || 0),
        careerGames: Number(referee.career_games || 0),
      } : null,

      incidents: (incidentsResult.rows || []).map((r: any) => ({
        incidentType: r.incident_type as string,
        minute: r.minute != null ? Number(r.minute) : null,
        playerName: r.player_name as string || null,
        isHome: Boolean(r.is_home),
        cardType: r.card_type as string || null,
        playerIn: r.player_in as string || null,
        playerOut: r.player_out as string || null,
      })),

      metadata: metadataResult.rows?.[0] ? {
        funfacts: safeParse(metadataResult.rows[0].funfacts_json),
        aiPreview: metadataResult.rows[0].ai_preview_text as string || null,
      } : null,

      polymarket: polymarketResult.rows?.[0] ? {
        homeWinPrice: polymarketResult.rows[0].home_win_price != null ? Number(polymarketResult.rows[0].home_win_price) : null,
        drawPrice: polymarketResult.rows[0].draw_price != null ? Number(polymarketResult.rows[0].draw_price) : null,
        awayWinPrice: polymarketResult.rows[0].away_win_price != null ? Number(polymarketResult.rows[0].away_win_price) : null,
        over25Price: polymarketResult.rows[0].over_25_price != null ? Number(polymarketResult.rows[0].over_25_price) : null,
        under25Price: polymarketResult.rows[0].under_25_price != null ? Number(polymarketResult.rows[0].under_25_price) : null,
        bttsYesPrice: polymarketResult.rows[0].btts_yes_price != null ? Number(polymarketResult.rows[0].btts_yes_price) : null,
      } : null,

      oddsMovement: (oddsMovementResult.rows || []).map((r: any) => ({
        market: r.market as string,
        outcome: r.outcome as string,
        bookmakerName: r.bookmaker_name as string || null,
        decimalOdds: Number(r.decimal_odds),
        previousDecimalOdds: r.previous_decimal_odds != null ? Number(r.previous_decimal_odds) : null,
        movement: r.movement as string || null,
        isMaxQuote: Boolean(r.is_max_quote),
      })),

      prediction,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[V5 Match] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match details', details: error.message },
      { status: 500 }
    );
  }
}
