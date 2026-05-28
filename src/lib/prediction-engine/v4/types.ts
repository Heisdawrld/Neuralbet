// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Punter Brain v4 Types
//
// PHILOSOPHY: Study everything. Pick ONE. Or walk away.
//
// v3 was a shotgun — 8 models, 15 markets, 20 value bets per match.
// v4 is a sniper — same 8 models, same 15 markets computed internally,
// but the output is ONE TIP. The best tip. Or nothing.
//
// A real punter doesn't bet 20 things on one match.
// They study the board, find the ONE edge, and go all in.
// If there's no edge, they walk. That's v4.
// ═══════════════════════════════════════════════════════════════════════

export const ENGINE_VERSION = '4.2.0';

// ── The One Tip ───────────────────────────────────────────────────────

export type TipQuality = 'gold' | 'silver' | 'bronze' | 'skip';

export interface TheTip {
  /** What to bet on — e.g. "Over 2.5 Goals", "Home Win", "BTTS Yes" */
  selection: string;
  /** Which market — e.g. "Over/Under 2.5", "1X2", "BTTS" */
  market: string;
  /** The odds for this selection */
  odds: number | null;
  /** How confident the engine is (0-1) */
  confidence: number;
  /** Model's probability vs market's implied probability */
  edge: number;
  /** Kelly stake (fractional, already adjusted for risk) */
  kellyStake: number;
  /** Quality tier: gold = bet big, silver = bet, bronze = small bet, skip = walk away */
  quality: TipQuality;
  /** One-line reasoning in human language */
  reasoning: string;
  /** Risk level for this specific tip */
  riskLevel: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
  /** Is this a contrarian play (model vs market disagreement)? */
  isContrarian: boolean;
  /** Is this a safe play (model & market aligned, low risk)? */
  isSafePlay: boolean;
  /** Risk-reward composite score (0-1) */
  riskRewardScore: number;
  /** How many markets were evaluated to find this one */
  marketsEvaluated: number;
  /** The rank of this tip among all evaluated (always 1 since it's the best) */
  rank: 1;
}

// ── Match Analysis (internal — what the engine studied) ───────────────

export interface MatchAnalysis {
  /** Head-to-head summary */
  h2h: H2HSummary;
  /** Last 5 matches for each team */
  last5: Last5Summary;
  /** Form/momentum */
  form: FormSummary;
  /** Manager tactical styles */
  manager: ManagerSummary;
  /** Expected gameplay style */
  gameplay: GameplaySummary;
  /** League context */
  league: LeagueContext;
  /** Situational factors (derby, weather, motivation, fatigue) */
  situation: SituationalSummary;
  /** Data quality score (0-1) */
  dataQuality: number;
}

export interface H2HSummary {
  homeWins: number;
  draws: number;
  awayWins: number;
  totalMeetings: number;
  avgGoals: number;
  over25Rate: number;
  bttsRate: number;
  note: string;
}

export interface Last5Summary {
  home: TeamLast5;
  away: TeamLast5;
}

export interface TeamLast5 {
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  form: string; // e.g. "WWDLW"
  cleanSheets: number;
  failedToScore: number;
}

export interface FormSummary {
  homeFormScore: number;   // 0-1 (1 = red hot)
  awayFormScore: number;   // 0-1
  homeTrend: 'rising' | 'stable' | 'declining';
  awayTrend: 'rising' | 'stable' | 'declining';
  note: string;
}

export interface ManagerSummary {
  homeManager: string | null;
  awayManager: string | null;
  homeStyle: string;   // e.g. "Attacking, possession-based"
  awayStyle: string;
  tacticalMatchup: string; // e.g. "Open game expected — both attack"
  goalExpectationModifier: number; // -0.3 to +0.3
  bttsModifier: number; // -0.2 to +0.2
}

export interface GameplaySummary {
  expectedStyle: 'open' | 'defensive' | 'asymmetric' | 'balanced';
  expectedGoals: number;
  expectedCards: 'low' | 'average' | 'high';
  possessionExpectation: 'home-dominant' | 'balanced' | 'away-dominant';
  note: string;
}

export interface LeagueContext {
  leagueId: number;
  leagueName: string;
  avgGoalsPerMatch: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  over25Rate: number;
  bttsRate: number;
  competitiveness: 'high' | 'medium' | 'low'; // top vs mid vs bottom gap
}

export interface SituationalSummary {
  isDerby: boolean;
  homeMotivation: 'must-win' | 'high' | 'medium' | 'low' | 'dead-rubber';
  awayMotivation: 'must-win' | 'high' | 'medium' | 'low' | 'dead-rubber';
  weatherNote: string | null;
  fatigueNote: string | null;
  travelNote: string | null;
  keyAbsences: string[];
}

// ── The Final Output: One Match = One Tip ─────────────────────────────

export interface PunterTipV4 {
  /** Match identity */
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  eventDate: string;
  status: string;

  /** The one tip (null if SKIP — no value found) */
  tip: TheTip | null;

  /** When tip is null, this explains why we're skipping */
  skipReason: string | null;

  /** Internal analysis summary (for expandable details) */
  analysis: MatchAnalysis;

  /** Base probabilities the engine computed */
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    homeXg: number;
    awayXg: number;
    over25: number;
    bttsYes: number;
  };

  /** Model agreement score (0-1) — how much the 8 models agree */
  modelAgreement: number;

  /** Engine version */
  engineVersion: string;
}

// ── Internal types (used during computation, not exposed) ──────────────

export interface CandidateBet {
  market: string;
  selection: string;
  modelProb: number;
  impliedProb: number | null;
  odds: number | null;
  edge: number;
  kelly: number;
  confidence: number;
  riskLevel: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
  isContrarian: boolean;
  isSafePlay: boolean;
  riskRewardScore: number;
  reasoning: string;
  marketType: 'primary' | 'secondary' | 'exotic';
  safetyClass: 'safe' | 'moderate' | 'risky' | 'avoid';
}

// Re-export types from v3 that v4 reuses internally
export type {
  FullMarketProbs, AsianHandicapLine, CorrectScore,
  ModelPrediction, ModelWeights,
  ManagerProfile, TacticalMatchup, RefereeProfile,
  WeatherImpact, MotivationLevel,
  MarketDataV3, RiskAssessmentV3, PunterDecisionV3, ValueBetV3,
  SituationalFactorsV3, ManagerIntel, RefereeIntel, LineupIntel,
  OddsMovement, PolymarketPrices,
} from '../v3/types';
