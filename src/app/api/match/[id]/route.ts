import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import { runV5Prediction } from '@/lib/prediction-engine/v5';
import { adaptV5ToPunterTip } from '@/lib/prediction-engine/v5/adapters/punter-tip';
import { fetchH2HFromBSD } from '@/lib/bsd-h2h';

export const dynamic = 'force-dynamic';

let dbReady = false;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);
    if (!eventId || isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    const db = getTursoClient();
    if (!dbReady) {
      await initializeDatabase();
      dbReady = true;
    }

    // ── Event Details ──────────────────────────────────────────────────
    const eventResult = await db.execute({
      sql: `SELECT e.*, v.name as venue_name, v.city as venue_city, v.capacity as venue_capacity
            FROM events e
            LEFT JOIN venues v ON e.venue_id = v.id
            WHERE e.id = ?`,
      args: [eventId],
    });

    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventResult.rows[0];
    const leagueId = Number(event.league_id);
    const homeTeamId = Number(event.home_team_id);
    const awayTeamId = Number(event.away_team_id);

    // ── League Info ────────────────────────────────────────────────────
    const leagueResult = await db.execute({
      sql: `SELECT * FROM leagues WHERE id = ?`,
      args: [leagueId],
    });
    const league = leagueResult.rows[0] || null;

    // ── Event Odds ─────────────────────────────────────────────────────
    const oddsResult = await db.execute({
      sql: `SELECT * FROM event_odds WHERE event_id = ?`,
      args: [eventId],
    });

    // ── Event Lineups ──────────────────────────────────────────────────
    const lineupResult = await db.execute({
      sql: `SELECT * FROM event_lineups WHERE event_id = ?`,
      args: [eventId],
    });

    // ── Event Stats ────────────────────────────────────────────────────
    const statsResult = await db.execute({
      sql: `SELECT * FROM event_stats WHERE event_id = ?`,
      args: [eventId],
    });

    // ── H2H Data (last 10 meetings) ────────────────────────────────────
    // Prefer the local events table when populated. When the BSD sync's
    // forward window doesn't include past meetings (typical for newly-
    // tracked fixtures or international friendlies), fall back to a
    // direct BSD lookup so the H2H tab isn't empty.
    let h2hRows: any[] = [];
    try {
      const h2hResult = await db.execute({
        sql: `SELECT home_team_id, away_team_id, home_team, away_team, home_score, away_score, event_date, status
              FROM events WHERE status = 'finished'
              AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
              AND home_score IS NOT NULL AND away_score IS NOT NULL
              ORDER BY event_date DESC LIMIT 10`,
        args: [homeTeamId, awayTeamId, awayTeamId, homeTeamId],
      });
      h2hRows = h2hResult.rows || [];
    } catch (err) {
      console.warn('[Match API] H2H query failed:', err);
    }

    if (h2hRows.length === 0) {
      const bsdH2H = await fetchH2HFromBSD(homeTeamId, awayTeamId);
      h2hRows = bsdH2H.map((m) => ({
        home_team_id: m.homeTeamId,
        away_team_id: m.awayTeamId,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        home_score: m.homeScore,
        away_score: m.awayScore,
        event_date: m.eventDate,
        status: m.status,
      }));
    }

    // Compatibility shim so the existing .rows.map(...) call below still works.
    const h2hResult = { rows: h2hRows };

    // ── Standings for both teams ───────────────────────────────────────
    // BUG FIX (Phase 2.x): filter by latest season_id to prevent multi-season
    // duplicate rows (e.g. international qualifier 'leagues' that span many
    // editions/groups would otherwise return 469 rows with massive
    // team-name duplication).
    // Standings query: tries (in order)
    //   1. Rows for the latest non-null season_id in this league
    //   2. If none, fall back to ALL rows for this league
    // Then dedupe in TS by team_id, keeping the row with the most matches
    // played (most recent / most authoritative for that team).
    let standingsResult = await db.execute({
      sql: `SELECT s.* FROM standings s
            WHERE s.league_id = ?
              AND s.season_id = (
                SELECT MAX(season_id) FROM standings
                WHERE league_id = ? AND season_id IS NOT NULL
              )
            ORDER BY s.position ASC`,
      args: [leagueId, leagueId],
    });
    if (!standingsResult.rows || standingsResult.rows.length === 0) {
      standingsResult = await db.execute({
        sql: `SELECT * FROM standings WHERE league_id = ? ORDER BY position ASC`,
        args: [leagueId],
      });
    }
    // Dedupe by team_id (keep highest played, then highest pts) to defend
    // against the multi-season pollution observed in international leagues.
    {
      const byTeam = new Map<number, any>();
      for (const row of standingsResult.rows || []) {
        const tid = Number(row.team_id);
        if (!Number.isFinite(tid)) continue;
        const existing = byTeam.get(tid);
        if (!existing) { byTeam.set(tid, row); continue; }
        const ePlayed = Number(existing.played || 0);
        const rPlayed = Number(row.played || 0);
        if (rPlayed > ePlayed || (rPlayed === ePlayed && Number(row.pts || 0) > Number(existing.pts || 0))) {
          byTeam.set(tid, row);
        }
      }
      const deduped = Array.from(byTeam.values())
        .sort((a, b) => Number(a.position || 999) - Number(b.position || 999));
      standingsResult = { ...standingsResult, rows: deduped } as any;
    }

    // ── Managers ───────────────────────────────────────────────────────
    const homeCoachId = event.home_coach_id ? Number(event.home_coach_id) : null;
    const awayCoachId = event.away_coach_id ? Number(event.away_coach_id) : null;

    let homeManager = null;
    let awayManager = null;
    if (homeCoachId) {
      const mgrResult = await db.execute({ sql: `SELECT * FROM managers WHERE id = ?`, args: [homeCoachId] });
      homeManager = mgrResult.rows[0] || null;
    }
    if (awayCoachId) {
      const mgrResult = await db.execute({ sql: `SELECT * FROM managers WHERE id = ?`, args: [awayCoachId] });
      awayManager = mgrResult.rows[0] || null;
    }

    // ── Referee ────────────────────────────────────────────────────────
    let referee = null;
    const refereeId = event.referee_id ? Number(event.referee_id) : null;
    if (refereeId) {
      const refResult = await db.execute({ sql: `SELECT * FROM referees WHERE id = ?`, args: [refereeId] });
      referee = refResult.rows[0] || null;
    }

    // ── Polymarket Odds ────────────────────────────────────────────────
    const polymarketResult = await db.execute({
      sql: `SELECT * FROM polymarket_odds WHERE event_id = ?`,
      args: [eventId],
    });

    // ── Odds Movement ──────────────────────────────────────────────────
    const oddsMovementResult = await db.execute({
      sql: `SELECT * FROM odds_movement WHERE event_id = ? ORDER BY market, outcome`,
      args: [eventId],
    });

    // ── Event Incidents ────────────────────────────────────────────────
    const incidentsResult = await db.execute({
      sql: `SELECT * FROM event_incidents WHERE event_id = ? ORDER BY minute ASC`,
      args: [eventId],
    });

    // ── Event Metadata ─────────────────────────────────────────────────
    const metadataResult = await db.execute({
      sql: `SELECT * FROM event_metadata WHERE event_id = ?`,
      args: [eventId],
    });

    // ── Engine Prediction (V5 engine, adapted to v4 PunterTip shape for frontend compat) ────────
    let enginePrediction = null;
    try {
      const v5Result = await runV5Prediction(eventId);
      enginePrediction = adaptV5ToPunterTip(v5Result, {
        leagueId,
        leagueName: (league?.name as string) || `League ${leagueId}`,
        homeTeamId,
        awayTeamId,
        eventDate: event.event_date as string,
        status: event.status as string,
      });
    } catch (err) {
      console.error(`[Match API] V5 engine prediction failed for event ${eventId}:`, err);
    }

    // ── Build Home/Away Team Stats from Standings ──────────────────────
    const homeStanding = standingsResult.rows.find(r => Number(r.team_id) === homeTeamId) || null;
    const awayStanding = standingsResult.rows.find(r => Number(r.team_id) === awayTeamId) || null;

    // Helper to safely parse JSON
    const safeParse = (val: unknown): any => {
      if (!val) return null;
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return null; }
      }
      return val;
    };

    // ── Compose Response ───────────────────────────────────────────────
    const response = {
      event: {
        id: Number(event.id),
        leagueId,
        leagueName: (league?.name as string) || `League ${leagueId}`,
        leagueCountry: (league?.country as string) || null,
        homeTeamId,
        homeTeam: event.home_team as string,
        awayTeamId,
        awayTeam: event.away_team as string,
        eventDate: event.event_date as string,
        status: event.status as string,
        homeScore: event.home_score != null ? Number(event.home_score) : null,
        awayScore: event.away_score != null ? Number(event.away_score) : null,
        homeScoreHt: event.home_score_ht != null ? Number(event.home_score_ht) : null,
        awayScoreHt: event.away_score_ht != null ? Number(event.away_score_ht) : null,
        currentMinute: event.current_minute != null ? Number(event.current_minute) : null,
        period: event.period as string,
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

      odds: oddsResult.rows[0] ? {
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

      lineup: lineupResult.rows[0] ? {
        lineupStatus: lineupResult.rows[0].lineup_status as string,
        homeFormation: lineupResult.rows[0].home_formation as string || null,
        awayFormation: lineupResult.rows[0].away_formation as string || null,
        homeConfidence: lineupResult.rows[0].home_confidence != null ? Number(lineupResult.rows[0].home_confidence) : null,
        awayConfidence: lineupResult.rows[0].away_confidence != null ? Number(lineupResult.rows[0].away_confidence) : null,
        homePlayers: safeParse(lineupResult.rows[0].home_players_json),
        awayPlayers: safeParse(lineupResult.rows[0].away_players_json),
        homeUnavailable: safeParse(lineupResult.rows[0].home_unavailable_json),
        awayUnavailable: safeParse(lineupResult.rows[0].away_unavailable_json),
      } : null,

      stats: statsResult.rows[0] ? {
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

      h2h: h2hResult.rows.map(r => ({
        homeTeamId: Number(r.home_team_id),
        awayTeamId: Number(r.away_team_id),
        homeTeam: r.home_team as string,
        awayTeam: r.away_team as string,
        homeScore: Number(r.home_score),
        awayScore: Number(r.away_score),
        eventDate: r.event_date as string,
      })),

      standings: standingsResult.rows.map(r => ({
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
        xgGames: r.xg_games != null ? Number(r.xg_games) : null,
        form: r.form as string || null,
        isLive: Boolean(r.is_live),
      })),

      homeTeamStanding: homeStanding ? {
        position: Number(homeStanding.position || 0),
        teamId: Number(homeStanding.team_id),
        teamName: homeStanding.team_name as string,
        played: Number(homeStanding.played || 0),
        won: Number(homeStanding.won || 0),
        drawn: Number(homeStanding.drawn || 0),
        lost: Number(homeStanding.lost || 0),
        gf: Number(homeStanding.gf || 0),
        ga: Number(homeStanding.ga || 0),
        gd: Number(homeStanding.gd || 0),
        pts: Number(homeStanding.pts || 0),
        xgf: homeStanding.xgf != null ? Number(homeStanding.xgf) : null,
        xga: homeStanding.xga != null ? Number(homeStanding.xga) : null,
        xgd: homeStanding.xgd != null ? Number(homeStanding.xgd) : null,
        form: homeStanding.form as string || null,
      } : null,

      awayTeamStanding: awayStanding ? {
        position: Number(awayStanding.position || 0),
        teamId: Number(awayStanding.team_id),
        teamName: awayStanding.team_name as string,
        played: Number(awayStanding.played || 0),
        won: Number(awayStanding.won || 0),
        drawn: Number(awayStanding.drawn || 0),
        lost: Number(awayStanding.lost || 0),
        gf: Number(awayStanding.gf || 0),
        ga: Number(awayStanding.ga || 0),
        gd: Number(awayStanding.gd || 0),
        pts: Number(awayStanding.pts || 0),
        xgf: awayStanding.xgf != null ? Number(awayStanding.xgf) : null,
        xga: awayStanding.xga != null ? Number(awayStanding.xga) : null,
        xgd: awayStanding.xgd != null ? Number(awayStanding.xgd) : null,
        form: awayStanding.form as string || null,
      } : null,

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

      polymarket: polymarketResult.rows[0] ? {
        homeWinPrice: polymarketResult.rows[0].home_win_price != null ? Number(polymarketResult.rows[0].home_win_price) : null,
        drawPrice: polymarketResult.rows[0].draw_price != null ? Number(polymarketResult.rows[0].draw_price) : null,
        awayWinPrice: polymarketResult.rows[0].away_win_price != null ? Number(polymarketResult.rows[0].away_win_price) : null,
        over25Price: polymarketResult.rows[0].over_25_price != null ? Number(polymarketResult.rows[0].over_25_price) : null,
        under25Price: polymarketResult.rows[0].under_25_price != null ? Number(polymarketResult.rows[0].under_25_price) : null,
        bttsYesPrice: polymarketResult.rows[0].btts_yes_price != null ? Number(polymarketResult.rows[0].btts_yes_price) : null,
      } : null,

      oddsMovement: oddsMovementResult.rows.map(r => ({
        market: r.market as string,
        outcome: r.outcome as string,
        bookmakerName: r.bookmaker_name as string || null,
        decimalOdds: Number(r.decimal_odds),
        previousDecimalOdds: r.previous_decimal_odds != null ? Number(r.previous_decimal_odds) : null,
        movement: r.movement as string || null,
        isMaxQuote: Boolean(r.is_max_quote),
      })),

      incidents: incidentsResult.rows.map(r => ({
        incidentType: r.incident_type as string,
        minute: r.minute != null ? Number(r.minute) : null,
        playerName: r.player_name as string || null,
        isHome: Boolean(r.is_home),
        cardType: r.card_type as string || null,
        playerIn: r.player_in as string || null,
        playerOut: r.player_out as string || null,
      })),

      metadata: metadataResult.rows[0] ? {
        funfacts: safeParse(metadataResult.rows[0].funfacts_json),
        aiPreview: metadataResult.rows[0].ai_preview_text as string || null,
      } : null,

      enginePrediction,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Match Detail API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match details' },
      { status: 500 }
    );
  }
}
