// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Punter Brain v3 Types
//
// v2 predicted 1X2, O/U 1.5/2.5/3.5, BTTS.
// v3 predicts EVERYTHING a punter would bet on.
// Safety first, but odds observant.
// ═══════════════════════════════════════════════════════════════════════

export const ENGINE_VERSION = '3.0.0';

// ── Core Probability Output ───────────────────────────────────────

export interface FullMarketProbs {
  // 1X2
  homeWin: number;
  draw: number;
  awayWin: number;

  // Over/Under (all lines)
  over05: number;  under05: number;
  over15: number;  under15: number;
  over25: number;  under25: number;
  over35: number;  under35: number;
  over45: number;  under45: number;

  // BTTS
  bttsYes: number;
  bttsNo: number;

  // Double Chance
  doubleChance1X: number;  // Home or Draw
  doubleChance12: number;  // Home or Away
  doubleChanceX2: number;  // Draw or Away

  // Draw No Bet
  dnbHome: number;
  dnbAway: number;

  // Asian Handicap (key lines)
  asianHandicap: AsianHandicapLine[];

  // Correct Scores (top 10)
  correctScores: CorrectScore[];

  // Expected Goals
  homeXg: number;
  awayXg: number;
  totalXg: number;

  // Most likely score
  mostLikelyScore: string;
}

export interface AsianHandicapLine {
  line: number;     // e.g. -0.5, -1.0, -1.5
  homeProb: number; // Probability home covers
  awayProb: number; // Probability away covers
}

export interface CorrectScore {
  score: string;
  prob: number;
}

// ── Intelligence Layer Types (v3 expanded) ────────────────────────

export type MotivationLevel = 'must-win' | 'high' | 'medium' | 'low' | 'dead-rubber';

export interface SituationalFactorsV3 {
  isDerby: boolean;
  isNeutralGround: boolean;
  homeMotivation: MotivationLevel;
  awayMotivation: MotivationLevel;
  motivationGap: number;
  homeFatigue: number;
  awayFatigue: number;
  travelFactor: number;
  dataQuality: number;
  sampleSizeWarning: boolean;
  notes: string[];
  weatherImpact: WeatherImpact | null;
  altitudeFactor: number;
  fixtureCongestion: { home: number; away: number };
}

export interface WeatherImpact {
  code: number;
  description: string;
  windSpeed: number;
  temperature: number;
  goalReduction: number;
  bttsReduction: number;
}

export interface ManagerIntel {
  homeManager: ManagerProfile | null;
  awayManager: ManagerProfile | null;
  tacticalMatchup: TacticalMatchup | null;
}

export interface ManagerProfile {
  id: number;
  name: string;
  tacticalProfile: string;
  preferredFormation: string;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  avgPossession: number;
  cleanSheetPct: number;
  bttsPct: number;
  over25Pct: number;
  winPct: number;
}

export interface TacticalMatchup {
  description: string;
  expectedStyle: 'open' | 'defensive' | 'asymmetric' | 'balanced';
  goalExpectationModifier: number;
  bttsModifier: number;
}

export interface RefereeIntel {
  referee: RefereeProfile | null;
  cardExpectation: 'low' | 'average' | 'high';
  goalExpectation: 'low' | 'average' | 'high';
  bttsModifier: number;
  over25Modifier: number;
}

export interface RefereeProfile {
  id: number;
  name: string;
  avgYellowPerMatch: number;
  avgGoalsPerMatch: number;
  avgFoulsPerMatch: number;
  careerGames: number;
}

export interface LineupIntel {
  lineupStatus: string;
  homeFormation: string | null;
  awayFormation: string | null;
  homeKeyAbsences: string[];
  awayKeyAbsences: string[];
  formationMatchup: string;
  homeSquadStrength: number;
  awaySquadStrength: number;
}

export interface MarketDataV3 {
  homeWinOdds: number | null;
  drawOdds: number | null;
  awayWinOdds: number | null;
  over15Odds: number | null;
  over25Odds: number | null;
  over35Odds: number | null;
  under25Odds: number | null;
  bttsYesOdds: number | null;
  doubleChance1XOdds: number | null;
  doubleChance12Odds: number | null;
  doubleChanceX2Odds: number | null;
  dnbHomeOdds: number | null;
  dnbAwayOdds: number | null;
  impliedHomeWin: number | null;
  impliedDraw: number | null;
  impliedAwayWin: number | null;
  overround: number | null;
  marketConfidence: number;
  oddsMovement: OddsMovement | null;
  polymarketPrices: PolymarketPrices | null;
}

export interface OddsMovement {
  homeDirection: 'shortening' | 'drifting' | 'stable' | 'unknown';
  awayDirection: 'shortening' | 'drifting' | 'stable' | 'unknown';
  steamDetected: boolean;
  steamDirection: 'home' | 'away' | 'none';
  movementConfidence: number;
}

export interface PolymarketPrices {
  homeWin: number | null;
  draw: number | null;
  awayWin: number | null;
  over25: number | null;
  bttsYes: number | null;
}

export type RiskLevel = 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | 'avoid';

export interface RiskAssessmentV3 {
  riskLevel: RiskLevel;
  riskScore: number;
  modelDisagreement: number;
  dataReliabilityIssue: boolean;
  situationalRisk: boolean;
  marketRisk: boolean;
  riskFactors: string[];
  adjustedConfidence: number;
  lineupRisk: boolean;
  weatherRisk: boolean;
  refereeRisk: boolean;
  managerUncertainty: boolean;
}

export type DecisionAction = 'strong-bet' | 'bet' | 'small-bet' | 'watch' | 'pass';

export interface PunterDecisionV3 {
  action: DecisionAction;
  reasoning: string;
  primaryRecommendation: string | null;
  decisionConfidence: number;
  isContrarian: boolean;
  isSafePlay: boolean;
  riskRewardScore: number;
  bestMarket: string | null;
  bestSelection: string | null;
  bestOdds: number | null;
}

export interface ValueBetV3 {
  market: string;
  selection: string;
  modelProbability: number;
  impliedProbability: number | null;
  odds: number | null;
  edge: number | null;
  kellyStake: number;
  adjustedKelly: number;
  valueRating: number;
  isActionable: boolean;
  marketType: 'primary' | 'secondary' | 'exotic';
  safetyClass: 'safe' | 'moderate' | 'risky' | 'avoid';
}

export interface ModelPrediction {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  reliability: number;
}

export interface ModelWeights {
  elo: number;
  poisson: number;
  xg: number;
  form: number;
  attackDefense: number;
  manager: number;
  referee: number;
  lineup: number;
}

export interface PunterPredictionV3 {
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  eventDate: string;
  status: string;

  markets: FullMarketProbs;
  predicted: 'H' | 'D' | 'A';

  models: {
    elo: ModelPrediction;
    poisson: ModelPrediction;
    xg: ModelPrediction;
    form: ModelPrediction;
    attackDefense: ModelPrediction;
    manager: ModelPrediction;
    referee: ModelPrediction;
    lineup: ModelPrediction;
  };
  weights: ModelWeights;

  situational: SituationalFactorsV3;
  managerIntel: ManagerIntel;
  refereeIntel: RefereeIntel;
  lineupIntel: LineupIntel;
  market: MarketDataV3;

  risk: RiskAssessmentV3;
  decision: PunterDecisionV3;
  valueBets: ValueBetV3[];

  confidence: number;
  isRecommended: boolean;
  engineVersion: string;
}
