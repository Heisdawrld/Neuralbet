import { db } from './client';

async function tryExecute(sql: string) {
  try {
    await db().execute(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('duplicate column')) throw error;
  }
}

export async function ensureSchema() {
  const cx = db();
  await cx.batch([
    `CREATE TABLE IF NOT EXISTS fixtures (
      id INTEGER PRIMARY KEY,
      league_id INTEGER NOT NULL,
      league_name TEXT,
      home_team_id INTEGER NOT NULL,
      home_team TEXT NOT NULL,
      away_team_id INTEGER NOT NULL,
      away_team TEXT NOT NULL,
      kickoff_at TEXT NOT NULL,
      status TEXT NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff ON fixtures(kickoff_at)`,
    `CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status)`,
    `CREATE TABLE IF NOT EXISTS odds_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'bsd',
      odds_json TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fixture_id) REFERENCES fixtures(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_odds_fixture_time ON odds_snapshots(fixture_id, captured_at)`,
    `CREATE TABLE IF NOT EXISTS team_memory (
      team_id INTEGER PRIMARY KEY,
      team_name TEXT NOT NULL,
      league_id INTEGER,
      last_matches_json TEXT NOT NULL DEFAULT '[]',
      momentum_score REAL NOT NULL DEFAULT 0.5,
      attack_form REAL NOT NULL DEFAULT 0.5,
      defense_form REAL NOT NULL DEFAULT 0.5,
      fatigue_score REAL NOT NULL DEFAULT 0.5,
      volatility_score REAL NOT NULL DEFAULT 0.5,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id INTEGER NOT NULL,
      model_version TEXT NOT NULL,
      market TEXT NOT NULL,
      selection TEXT NOT NULL,
      probability REAL NOT NULL,
      fair_odds REAL NOT NULL,
      bookmaker_odds REAL,
      edge REAL,
      confidence TEXT NOT NULL,
      risk TEXT NOT NULL,
      stake_fraction REAL NOT NULL,
      analyst_report TEXT NOT NULL,
      features_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fixture_id) REFERENCES fixtures(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_predictions_fixture ON predictions(fixture_id)`,
    `CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at)`,
    `CREATE TABLE IF NOT EXISTS user_subscriptions (
      clerk_user_id TEXT PRIMARY KEY,
      stripe_subscription_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS user_prediction_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id TEXT NOT NULL,
      fixture_id INTEGER NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_upl_user_date ON user_prediction_log(clerk_user_id, date)`,
  ], 'write');

  await tryExecute(`ALTER TABLE team_memory ADD COLUMN volatility_score REAL NOT NULL DEFAULT 0.5`);
}
