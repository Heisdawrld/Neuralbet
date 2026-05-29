// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Database Schema
//
// Every BSD API data source mapped to a table.
// The engine reads from these tables, never from the API directly.
// Sync jobs populate these tables on schedule.
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from './turso-client';

export async function initializeDatabase(): Promise<void> {
  const db = getTursoClient();

  // ── CORE: Events ─────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      league_id INTEGER NOT NULL,
      home_team_id INTEGER NOT NULL,
      home_team TEXT NOT NULL,
      away_team_id INTEGER NOT NULL,
      away_team TEXT NOT NULL,
      home_coach_id INTEGER,
      away_coach_id INTEGER,
      referee_id INTEGER,
      venue_id INTEGER,
      event_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'notstarted',
      round_number INTEGER,
      period TEXT,
      current_minute INTEGER,
      home_score INTEGER DEFAULT 0,
      away_score INTEGER DEFAULT 0,
      home_score_ht INTEGER,
      away_score_ht INTEGER,
      is_local_derby INTEGER DEFAULT 0,
      is_neutral_ground INTEGER DEFAULT 0,
      travel_distance_km INTEGER DEFAULT 0,
      weather_code INTEGER,
      weather_description TEXT,
      weather_wind_speed REAL,
      weather_temperature_c REAL,
      pitch_condition INTEGER,
      attendance INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(id)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_league ON events(league_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_home_team ON events(home_team_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_away_team ON events(away_team_id)`);

  // ── V5: Add enrichment columns to events ──────────────────────────
  const eventAlterations = [
    `ALTER TABLE events ADD COLUMN home_team_logo TEXT DEFAULT ''`,
    `ALTER TABLE events ADD COLUMN away_team_logo TEXT DEFAULT ''`,
    `ALTER TABLE events ADD COLUMN league_name TEXT DEFAULT ''`,
    `ALTER TABLE events ADD COLUMN enrichment_status TEXT DEFAULT 'none'`,
    `ALTER TABLE events ADD COLUMN data_quality TEXT DEFAULT 'unknown'`,
    `ALTER TABLE events ADD COLUMN meta TEXT`,
  ];
  for (const sql of eventAlterations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  // ── EVENT STATS (xG, shots, possession per match) ────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_stats (
      event_id INTEGER PRIMARY KEY,
      home_total_shots INTEGER DEFAULT 0,
      away_total_shots INTEGER DEFAULT 0,
      home_ball_possession INTEGER DEFAULT 0,
      away_ball_possession INTEGER DEFAULT 0,
      home_pass_accuracy REAL DEFAULT 0,
      away_pass_accuracy REAL DEFAULT 0,
      home_xg REAL DEFAULT 0,
      away_xg REAL DEFAULT 0,
      home_attacks INTEGER DEFAULT 0,
      away_attacks INTEGER DEFAULT 0,
      home_dangerous_attacks INTEGER DEFAULT 0,
      away_dangerous_attacks INTEGER DEFAULT 0,
      home_corners INTEGER DEFAULT 0,
      away_corners INTEGER DEFAULT 0,
      home_fouls INTEGER DEFAULT 0,
      away_fouls INTEGER DEFAULT 0,
      home_offsides INTEGER DEFAULT 0,
      away_offsides INTEGER DEFAULT 0,
      home_yellow_cards INTEGER DEFAULT 0,
      away_yellow_cards INTEGER DEFAULT 0,
      home_red_cards INTEGER DEFAULT 0,
      away_red_cards INTEGER DEFAULT 0,
      home_shots_on_target INTEGER DEFAULT 0,
      away_shots_on_target INTEGER DEFAULT 0,
      home_shots_inside_box INTEGER DEFAULT 0,
      away_shots_inside_box INTEGER DEFAULT 0,
      home_shots_outside_box INTEGER DEFAULT 0,
      away_shots_outside_box INTEGER DEFAULT 0,
      shotmap_json TEXT,
      momentum_json TEXT,
      xg_per_minute_json TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  // ── EVENT ODDS (consensus) ──────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_odds (
      event_id INTEGER PRIMARY KEY,
      home_win REAL,
      draw REAL,
      away_win REAL,
      over_15_goals REAL,
      over_25_goals REAL,
      over_35_goals REAL,
      under_15_goals REAL,
      under_25_goals REAL,
      under_35_goals REAL,
      btts_yes REAL,
      btts_no REAL,
      double_chance_1x REAL,
      double_chance_12 REAL,
      double_chance_x2 REAL,
      draw_no_bet_home REAL,
      draw_no_bet_away REAL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  // ── ODDS MOVEMENT (multi-bookmaker, for steam detection) ────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS odds_movement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      market TEXT NOT NULL,
      outcome TEXT NOT NULL,
      bookmaker_slug TEXT,
      bookmaker_name TEXT,
      decimal_odds REAL NOT NULL,
      previous_decimal_odds REAL,
      implied_probability REAL,
      movement TEXT,
      is_max_quote INTEGER DEFAULT 0,
      updated_at TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_odds_movement_event ON odds_movement(event_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_odds_movement_market ON odds_movement(event_id, market)`);

  // ── POLYMARKET ODDS (prediction market) ─────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS polymarket_odds (
      event_id INTEGER PRIMARY KEY,
      home_win_price REAL,
      draw_price REAL,
      away_win_price REAL,
      over_25_price REAL,
      under_25_price REAL,
      btts_yes_price REAL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  // ── EVENT LINEUPS ───────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_lineups (
      event_id INTEGER PRIMARY KEY,
      lineup_status TEXT,
      home_formation TEXT,
      away_formation TEXT,
      home_confidence REAL,
      away_confidence REAL,
      home_players_json TEXT,
      away_players_json TEXT,
      home_substitutes_json TEXT,
      away_substitutes_json TEXT,
      home_unavailable_json TEXT,
      away_unavailable_json TEXT,
      updated_at TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  // ── PLAYER MATCH STATS ──────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_match_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      minutes_played INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      goals INTEGER DEFAULT 0,
      goal_assist INTEGER DEFAULT 0,
      expected_goals REAL DEFAULT 0,
      expected_assists REAL DEFAULT 0,
      total_shots INTEGER DEFAULT 0,
      shots_on_target INTEGER DEFAULT 0,
      total_pass INTEGER DEFAULT 0,
      accurate_pass INTEGER DEFAULT 0,
      key_pass INTEGER DEFAULT 0,
      total_tackle INTEGER DEFAULT 0,
      interception INTEGER DEFAULT 0,
      yellow_card INTEGER DEFAULT 0,
      red_card INTEGER DEFAULT 0,
      saves INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(event_id, player_id),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pms_event ON player_match_stats(event_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pms_player ON player_match_stats(player_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pms_team ON player_match_stats(team_id)`);

  // ── EVENT INCIDENTS ─────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      incident_type TEXT NOT NULL,
      minute INTEGER,
      player_name TEXT,
      player_id INTEGER,
      is_home INTEGER DEFAULT 0,
      card_type TEXT,
      player_in TEXT,
      player_out TEXT,
      player_in_id INTEGER,
      player_out_id INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_incidents_event ON event_incidents(event_id)`);

  // ── EVENT METADATA (fun facts, AI preview) ──────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_metadata (
      event_id INTEGER PRIMARY KEY,
      funfacts_json TEXT,
      ai_preview_text TEXT,
      ai_preview_generated_at TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  // ── LEAGUES ─────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT,
      is_women INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      current_season_id INTEGER,
      current_season_name TEXT,
      current_season_year TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── V5: Add enrichment columns to leagues ─────────────────────────
  const leagueAlterations = [
    `ALTER TABLE leagues ADD COLUMN logo_url TEXT DEFAULT ''`,
    `ALTER TABLE leagues ADD COLUMN over_25_rate REAL DEFAULT 0.50`,
    `ALTER TABLE leagues ADD COLUMN over_35_rate REAL DEFAULT 0.30`,
    `ALTER TABLE leagues ADD COLUMN avg_goals_per_team REAL DEFAULT 1.35`,
  ];
  for (const sql of leagueAlterations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  // ── STANDINGS (with xG) ────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS standings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      season_id INTEGER,
      team_id INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      position INTEGER,
      played INTEGER DEFAULT 0,
      won INTEGER DEFAULT 0,
      drawn INTEGER DEFAULT 0,
      lost INTEGER DEFAULT 0,
      gf INTEGER DEFAULT 0,
      ga INTEGER DEFAULT 0,
      gd INTEGER DEFAULT 0,
      pts INTEGER DEFAULT 0,
      xgf REAL DEFAULT 0,
      xga REAL DEFAULT 0,
      xgd REAL DEFAULT 0,
      xg_games INTEGER DEFAULT 0,
      form TEXT,
      is_live INTEGER DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(league_id, season_id, team_id)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_standings_league ON standings(league_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_standings_team ON standings(team_id)`);

  // ── TEAMS ───────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT,
      country TEXT,
      country_code TEXT,
      venue_id INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── V5: Add enrichment columns to teams ────────────────────────────
  const teamAlterations = [
    `ALTER TABLE teams ADD COLUMN logo_url TEXT DEFAULT ''`,
    `ALTER TABLE teams ADD COLUMN avg_goals_scored REAL`,
    `ALTER TABLE teams ADD COLUMN avg_goals_conceded REAL`,
    `ALTER TABLE teams ADD COLUMN win_rate REAL`,
    `ALTER TABLE teams ADD COLUMN btts_rate REAL`,
    `ALTER TABLE teams ADD COLUMN over_25_rate REAL`,
    `ALTER TABLE teams ADD COLUMN home_avg_scored REAL`,
    `ALTER TABLE teams ADD COLUMN home_avg_conceded REAL`,
    `ALTER TABLE teams ADD COLUMN away_avg_scored REAL`,
    `ALTER TABLE teams ADD COLUMN away_avg_conceded REAL`,
  ];
  for (const sql of teamAlterations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  // ── TEAM SQUADS ─────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS team_squads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      short_name TEXT,
      position TEXT,
      jersey_number INTEGER,
      nationality TEXT,
      date_of_birth TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(team_id, player_id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )
  `);

  // ── PLAYERS ─────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT,
      position TEXT,
      specific_position TEXT,
      jersey_number INTEGER,
      date_of_birth TEXT,
      height_cm REAL,
      weight_kg REAL,
      preferred_foot TEXT,
      nationality TEXT,
      current_team_id INTEGER,
      market_value_eur INTEGER,
      contract_until TEXT,
      availability TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── PLAYER CAREER (season aggregates) ───────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_career (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      season_id INTEGER,
      league_id INTEGER,
      team_id INTEGER,
      matches INTEGER DEFAULT 0,
      minutes INTEGER DEFAULT 0,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      avg_rating REAL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(player_id, season_id, team_id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  // ── MANAGERS ────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT,
      country TEXT,
      tactical_profile TEXT,
      preferred_formation TEXT,
      current_team_id INTEGER,
      matches_total INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      win_pct REAL DEFAULT 0,
      avg_goals_scored REAL DEFAULT 0,
      avg_goals_conceded REAL DEFAULT 0,
      avg_possession REAL DEFAULT 0,
      clean_sheet_pct REAL DEFAULT 0,
      btts_pct REAL DEFAULT 0,
      over_25_pct REAL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── MANAGER CAREER (per-tenure record) ─────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS manager_career (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL,
      team_id INTEGER,
      team_name TEXT,
      date_from TEXT,
      date_to TEXT,
      matches INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      win_pct REAL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (manager_id) REFERENCES managers(id)
    )
  `);

  // ── REFEREES ────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS referees (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT,
      birthdate TEXT,
      matches INTEGER DEFAULT 0,
      total_yellow_cards INTEGER DEFAULT 0,
      total_red_cards INTEGER DEFAULT 0,
      avg_yellow_per_match REAL DEFAULT 0,
      avg_red_per_match REAL DEFAULT 0,
      avg_goals_per_match REAL DEFAULT 0,
      avg_fouls_per_match REAL DEFAULT 0,
      career_games INTEGER DEFAULT 0,
      career_yellow_cards INTEGER DEFAULT 0,
      career_red_cards INTEGER DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── VENUES ──────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      country TEXT,
      country_code TEXT,
      capacity INTEGER,
      latitude REAL,
      longitude REAL,
      pitch_length_m REAL,
      pitch_width_m REAL,
      built_year INTEGER,
      home_team_id INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── SYNC TRACKER (what was synced and when) ─────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      last_sync_at TEXT NOT NULL,
      records_synced INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      UNIQUE(sync_type)
    )
  `);

  // ── ENGINE PREDICTIONS (output of our engine, stored) ───────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS engine_predictions (
      event_id INTEGER PRIMARY KEY,
      home_win_prob REAL NOT NULL,
      draw_prob REAL NOT NULL,
      away_win_prob REAL NOT NULL,
      predicted TEXT NOT NULL,
      home_expected_goals REAL,
      away_expected_goals REAL,
      over_05_prob REAL,
      over_15_prob REAL,
      over_25_prob REAL,
      over_35_prob REAL,
      over_45_prob REAL,
      under_05_prob REAL,
      under_15_prob REAL,
      under_25_prob REAL,
      under_35_prob REAL,
      under_45_prob REAL,
      btts_yes_prob REAL,
      btts_no_prob REAL,
      double_chance_1x_prob REAL,
      double_chance_12_prob REAL,
      double_chance_x2_prob REAL,
      draw_no_bet_home_prob REAL,
      draw_no_bet_away_prob REAL,
      asian_handicap_json TEXT,
      correct_scores_json TEXT,
      most_likely_score TEXT,
      confidence REAL,
      risk_level TEXT,
      risk_score REAL,
      decision_action TEXT,
      decision_reasoning TEXT,
      decision_risk_reward REAL,
      is_contranian INTEGER DEFAULT 0,
      is_safe_play INTEGER DEFAULT 0,
      engine_version TEXT NOT NULL,
      models_json TEXT,
      weights_json TEXT,
      situational_json TEXT,
      market_json TEXT,
      value_bets_json TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_engine_predictions_date ON engine_predictions(event_id)`);

  // ══════════════════════════════════════════════════════════════════
  //  V5: New tables for Phantom Engine
  // ══════════════════════════════════════════════════════════════════

  // ── HISTORICAL MATCHES (H2H, form, per-fixture context) ──────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS historical_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      home_team_id INTEGER,
      away_team_id INTEGER,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      home_goals INTEGER,
      away_goals INTEGER,
      home_xg REAL,
      away_xg REAL,
      date TEXT NOT NULL,
      league_id INTEGER,
      season TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fixture_id) REFERENCES events(id)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_hist_matches_fixture_type ON historical_matches(fixture_id, type)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_hist_matches_date ON historical_matches(date)`);

  // Add missing columns if historical_matches already existed with old schema
  const histMatchAlterations = [
    `ALTER TABLE historical_matches ADD COLUMN home_team_id INTEGER`,
    `ALTER TABLE historical_matches ADD COLUMN away_team_id INTEGER`,
    `ALTER TABLE historical_matches ADD COLUMN home_score INTEGER`,
    `ALTER TABLE historical_matches ADD COLUMN away_score INTEGER`,
  ];
  for (const sql of histMatchAlterations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  // ── PREDICTIONS V2 (V5 Phantom Engine output) ────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS predictions_v2 (
      event_id INTEGER PRIMARY KEY,
      home_team TEXT NOT NULL DEFAULT '',
      away_team TEXT NOT NULL DEFAULT '',
      expected_goals_json TEXT,
      best_pick_json TEXT,
      backup_picks_json TEXT DEFAULT '[]',
      no_safe_pick INTEGER DEFAULT 0,
      calibrated_probs_json TEXT,
      reason_codes_json TEXT DEFAULT '[]',
      data_completeness REAL DEFAULT 0,
      engine_version TEXT NOT NULL DEFAULT '5.0.0',
      prediction_json TEXT,
      model_version TEXT DEFAULT '5.0.0',
      best_pick_market TEXT,
      best_pick_selection TEXT,
      best_pick_probability REAL,
      best_pick_edge REAL,
      best_pick_score REAL,
      advisor_status TEXT,
      no_safe_pick_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  // Add missing columns if table already existed with old schema
  const predV2Alterations = [
    `ALTER TABLE predictions_v2 ADD COLUMN home_team TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE predictions_v2 ADD COLUMN away_team TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE predictions_v2 ADD COLUMN expected_goals_json TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN best_pick_json TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN backup_picks_json TEXT DEFAULT '[]'`,
    `ALTER TABLE predictions_v2 ADD COLUMN calibrated_probs_json TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN reason_codes_json TEXT DEFAULT '[]'`,
    `ALTER TABLE predictions_v2 ADD COLUMN data_completeness REAL DEFAULT 0`,
    `ALTER TABLE predictions_v2 ADD COLUMN engine_version TEXT NOT NULL DEFAULT '5.0.0'`,
    `ALTER TABLE predictions_v2 ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))`,
    `ALTER TABLE predictions_v2 ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`,
  ];
  for (const sql of predV2Alterations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_predictions_v2_status ON predictions_v2(advisor_status)`);

  // ── PREDICTION RESULTS (verified outcomes — feedback loop) ───────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS prediction_results (
      event_id INTEGER PRIMARY KEY,
      home_team TEXT NOT NULL DEFAULT '',
      away_team TEXT NOT NULL DEFAULT '',
      predicted_market TEXT,
      predicted_selection TEXT,
      predicted_probability REAL,
      predicted_edge REAL,
      actual_home_score INTEGER,
      actual_away_score INTEGER,
      outcome TEXT NOT NULL DEFAULT 'pending',
      brier_score REAL,
      verified_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pred_results_outcome ON prediction_results(outcome)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pred_results_verified ON prediction_results(verified_at)`);

  // ── PREDICTION PICKS (individual market picks per fixture) ───────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS prediction_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      market TEXT NOT NULL,
      selection TEXT NOT NULL,
      odds REAL,
      probability REAL,
      edge REAL,
      material_signature TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_prediction_picks_event ON prediction_picks(event_id)`);

  console.log('[DB] Schema initialized — all tables ready (V5)');
}
