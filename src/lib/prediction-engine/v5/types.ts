// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Prediction Engine Types
//
// The V5 engine is a calibrated, feature-driven prediction system.
// It reads a FeatureVector from Turso, runs calibrated probability
// models, and outputs a structured prediction with best/backup picks.
// ═══════════════════════════════════════════════════════════════════════

export const V5_ENGINE_VERSION = '5.0.0';

// ── Feature Vector (input to the engine) ─────────────────────────────

export interface FeatureVector {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
  leagueId: number;
  leagueName: string;

  // Form features (weighted recent averages)
  homeAvgGoalsScored: number;
  homeAvgGoalsConceded: number;
  awayAvgGoalsScored: number;
  awayAvgGoalsConceded: number;

  // Venue-specific splits
  homeHomeGoalsScored: number;  // home team at home
  homeHomeGoalsConceded: number;
  awayAwayGoalsScored: number;  // away team away
  awayAwayGoalsConceded: number;

  // Form momentum (last 5 weighted)
  homeFormScore: number;  // 0-1
  awayFormScore: number;  // 0-1
  homeFormTrend: 'rising' | 'stable' | 'declining';
  awayFormTrend: 'rising' | 'stable' | 'declining';

  // Win/draw/loss rates
  homeWinRate: number;
  homeDrawRate: number;
  homeLossRate: number;
  awayWinRate: number;
  awayDrawRate: number;
  awayLossRate: number;

  // H2H features
  h2hTotalMeetings: number;
  h2hHomeWins: number;
  h2hDraws: number;
  h2hAwayWins: number;
  h2hAvgGoals: number;
  h2hOver25Rate: number;
  h2hBttsRate: number;

  // Standings features
  homePosition: number;
  awayPosition: number;
  homePoints: number;
  awayPoints: number;
  homeXgd: number;
  awayXgd: number;
  homeXgfPerGame: number;
  awayXgfPerGame: number;

  // Implied odds probabilities
  impliedHomeWin: number | null;
  impliedDraw: number | null;
  impliedAwayWin: number | null;
  impliedOver25: number | null;
  impliedBttsYes: number | null;

  // Lineup certainty
  lineupCertaintyScore: number;  // 0-1 (0 = no lineup data, 1 = confirmed)
  homeFormationKnown: boolean;
  awayFormationKnown: boolean;

  // Manager tactical profile
  homeManagerWinPct: number | null;
  homeManagerOver25Pct: number | null;
  awayManagerWinPct: number | null;
  awayManagerOver25Pct: number | null;

  // Referee profile
  refereeAvgGoals: number | null;
  refereeAvgCards: number | null;

  // Data completeness
  dataCompleteness: number;  // 0-1
  hasStatsData: boolean;
  hasXgData: boolean;
  hasOddsData: boolean;
  hasH2HData: boolean;
  hasStandingsData: boolean;
  hasLineupData: boolean;
  hasManagerData: boolean;
  hasRefereeData: boolean;
}

// ── Prediction Output ────────────────────────────────────────────────

export type RiskLevel = 'VERY_LOW' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
export type AdvisorStatus = 'STRONG_BET' | 'BET' | 'SMALL_BET' | 'WATCH' | 'SKIP';

export interface MarketPick {
  marketKey: string;
  selection: string;
  modelProbability: number;
  edge: number;
  finalScore: number;
  riskLevel: RiskLevel;
  advisorStatus: AdvisorStatus;
}

export interface V5Prediction {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  expectedGoals: {
    home: number;
    away: number;
    total: number;
  };
  bestPick: MarketPick | null;
  backupPicks: MarketPick[];
  noSafePick: boolean;
  calibratedProbs: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    under25: number;
    bttsYes: number;
    over15: number;
    over35: number;
  };
  reasonCodes: string[];
  dataCompleteness: number;
  engineVersion: string;
  updatedAt: string;
}

// ── Historical Match Record (for DB reads) ───────────────────────────

export interface HistoricalMatch {
  id: number;
  fixtureId: number;
  type: 'h2h' | 'home_form' | 'away_form';
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  leagueId: number;
  season?: string;
}

// ── Predictions V2 Record (for DB cache) ─────────────────────────────

export interface PredictionV2Record {
  id?: number;
  event_id: number;
  home_team: string;
  away_team: string;
  expected_goals_json: string;   // JSON: { home, away, total }
  best_pick_json: string | null; // JSON: MarketPick
  backup_picks_json: string;     // JSON: MarketPick[]
  no_safe_pick: number;          // 0 or 1
  calibrated_probs_json: string; // JSON: calibratedProbs
  reason_codes_json: string;     // JSON: string[]
  data_completeness: number;
  engine_version: string;
  created_at: string;
  updated_at: string;
}

// ── Script classification output ─────────────────────────────────────
//
// The match-script classifier categorises a fixture into one of several
// game-state archetypes. Each archetype unlocks a different set of
// downstream calibration nudges and market preferences.
//
// Primaries:
//   dominant_home_pressure — home heavily favoured to control + score
//   dominant_away_pressure — away heavily favoured (rare in real football)
//   open_end_to_end        — both teams attack; goals expectation high
//   tight_low_event        — both teams defence-first; goals expectation low
//   chaotic_unreliable     — data quality too low or signals contradict;
//                            engine is humble and dampens any high prob

export type ScriptPrimary =
  | 'dominant_home_pressure'
  | 'dominant_away_pressure'
  | 'open_end_to_end'
  | 'tight_low_event'
  | 'chaotic_unreliable'
  | string;  // allow forward-compat tags

export interface ScriptOutput {
  primary: ScriptPrimary;
  secondary: string | null;
  confidence: number;          // 0-1: how certain the classifier is
  homeControlScore: number;    // 0-1
  awayControlScore: number;    // 0-1
  eventLevelScore: number;     // 0-1: how "eventful" the match is expected to be
  volatilityScore: number;     // 0-1: how unreliable the call is
  _scores?: Record<string, number>;
}
