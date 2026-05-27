// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Type System
// Built like a human punter, not a spreadsheet
// ═══════════════════════════════════════════════════════════════════════

// ── Raw Data Types ────────────────────────────────────────────────────

export interface TeamStats {
  teamId: number;
  teamName: string;
  matchesPlayed: number;
  goalsScored: number;
  goalsConceded: number;
  xgf: number;
  xga: number;
  wins: number;
  draws: number;
  losses: number;
  form: string;
  homeMatches: number;
  homeGoalsScored: number;
  homeGoalsConceded: number;
  homeWins: number;
  homeDraws: number;
  homeLosses: number;
  awayMatches: number;
  awayGoalsScored: number;
  awayGoalsConceded: number;
  awayWins: number;
  awayDraws: number;
  awayLosses: number;
  leaguePosition: number;
  leagueId: number;
  leagueName: string;
  points: number;
  xgd: number;
}

export interface EloRating {
  teamId: number;
  rating: number;
  matches: number;
}

export interface LeagueAvgData {
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  avgXgf: number;
  avgXga: number;
}

// ── Model Output Types ────────────────────────────────────────────────

export interface ModelPrediction {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  /** How much we trust this model's output for this particular match (0-1) */
  reliability: number;
}

// ── Situational Intelligence Types ────────────────────────────────────

export type MotivationLevel = 'must-win' | 'high' | 'medium' | 'low' | 'dead-rubber';

export interface SituationalFactors {
  /** Is this a derby match? Derbies are wild — form goes out the window */
  isDerby: boolean;
  /** Is this played on neutral ground? Reduces home advantage */
  isNeutralGround: boolean;
  /** Home team motivation level (relegation battle, title race, mid-table) */
  homeMotivation: MotivationLevel;
  /** Away team motivation level */
  awayMotivation: MotivationLevel;
  /** How motivated is each team? Derived from league position and context */
  motivationGap: number; // -1 to 1, positive = home more motivated
  /** Estimated fatigue for home team (0 = fresh, 1 = exhausted) */
  homeFatigue: number;
  /** Estimated fatigue for away team */
  awayFatigue: number;
  /** Travel distance factor (0 = local, 1 = long haul) */
  travelFactor: number;
  /** Data quality score — how much do we actually know about these teams? */
  dataQuality: number; // 0-1
  /** Sample size warning — are we working with enough data? */
  sampleSizeWarning: boolean;
  /** Contextual notes — human-readable reasons for adjustments */
  notes: string[];
}

// ── Market Intelligence Types ─────────────────────────────────────────

export interface MarketData {
  /** Best available home win odds */
  homeWinOdds: number | null;
  /** Best available draw odds */
  drawOdds: number | null;
  /** Best available away win odds */
  awayWinOdds: number | null;
  /** Best available over 2.5 odds */
  over25Odds: number | null;
  /** Best available under 2.5 odds */
  under25Odds: number | null;
  /** Best available BTTS yes odds */
  bttsYesOdds: number | null;
  /** Best available over 1.5 odds */
  over15Odds: number | null;
  /** Best available over 3.5 odds */
  over35Odds: number | null;
  /** Implied probability from home win odds */
  impliedHomeWin: number | null;
  /** Implied probability from draw odds */
  impliedDraw: number | null;
  /** Implied probability from away win odds */
  impliedAwayWin: number | null;
  /** Implied overround (bookmaker margin) — lower = more efficient market */
  overround: number | null;
  /** Market confidence — how tight are the odds? (0-1) */
  marketConfidence: number;
}

// ── Risk Assessment Types ─────────────────────────────────────────────

export type RiskLevel = 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | 'avoid';

export interface RiskAssessment {
  /** Overall risk level */
  riskLevel: RiskLevel;
  /** Risk score 0-1 (0 = safe, 1 = dangerous) */
  riskScore: number;
  /** How much do the models disagree? (0 = total agreement, 1 = chaos) */
  modelDisagreement: number;
  /** Is the data too thin to trust? */
  dataReliabilityIssue: boolean;
  /** Are there situational red flags? */
  situationalRisk: boolean;
  /** Is the market telling us something we're missing? */
  marketRisk: boolean;
  /** Specific risk factors listed */
  riskFactors: string[];
  /** Adjusted confidence after accounting for risk */
  adjustedConfidence: number;
}

// ── Value Detection Types ─────────────────────────────────────────────

export interface ValueBet {
  market: string;
  selection: string;
  modelProbability: number;
  impliedProbability: number;
  odds: number;
  edge: number;
  /** Kelly criterion stake (fractional) */
  kellyStake: number;
  /** Kelly adjusted by confidence and risk — the ACTUAL bet size */
  adjustedKelly: number;
  /** How many stars? Based on edge × confidence */
  valueRating: number; // 1-5
  /** Is this actually worth betting? After risk assessment */
  isActionable: boolean;
}

// ── Punter Decision Types ─────────────────────────────────────────────

export type DecisionAction = 'strong-bet' | 'bet' | 'small-bet' | 'watch' | 'pass';

export interface PunterDecision {
  /** What does the punter do? */
  action: DecisionAction;
  /** Human-readable reasoning */
  reasoning: string;
  /** The primary recommendation (if any) */
  primaryRecommendation: string | null;
  /** Confidence in the decision itself (not the prediction) */
  decisionConfidence: number; // 0-1
  /** Is this a contrarian play? (Going against the market) */
  isContrarian: boolean;
  /** Is this a safe play? (Going with the market + our model) */
  isSafePlay: boolean;
  /** Risk-reward score — how good is the risk-reward ratio? */
  riskRewardScore: number; // 0-1
}

// ── Full Prediction Output ────────────────────────────────────────────

export interface PunterPrediction {
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  eventDate: string;
  status: string;

  // Core probabilities
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  predicted: 'H' | 'D' | 'A';
  homeExpectedGoals: number;
  awayExpectedGoals: number;

  // Derived markets
  over15Prob: number;
  over25Prob: number;
  over35Prob: number;
  bttsProb: number;
  mostLikelyScore: string;

  // Model breakdown
  models: {
    elo: ModelPrediction;
    poisson: ModelPrediction;
    xg: ModelPrediction;
    form: ModelPrediction;
    attackDefense: ModelPrediction;
  };
  weights: {
    elo: number;
    poisson: number;
    xg: number;
    form: number;
    attackDefense: number;
  };

  // Intelligence layers
  situational: SituationalFactors;
  market: MarketData;
  risk: RiskAssessment;

  // Punter brain output
  decision: PunterDecision;
  valueBets: ValueBet[];

  // Legacy compatibility
  confidence: number;
  recommendations: {
    favorite: string;
    favoriteProb: number;
    betFavorite: boolean;
    over15: boolean;
    over25: boolean;
    over35: boolean;
    btts: boolean;
    winner: boolean;
  };
  isRecommended: boolean;
  engineVersion: string;
}
