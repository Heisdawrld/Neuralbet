// BSD API v2 Actual Response Types

export interface ApiEvent {
  id: number;
  league_id: number;
  season_id: number | null;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  event_date: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  current_minute: number | null;
  period: string;
  round_number: number | null;
  round_name: string;
  group_name: string | null;
  is_local_derby: boolean;
  is_neutral_ground: boolean;
  live_websocket: boolean;
}

export interface ApiLeague {
  id: number;
  name: string;
  country: string;
  is_women: boolean;
  is_active: boolean;
  current_season: {
    id: number;
    name: string;
    year: number;
    start_date: string;
    end_date: string;
    is_current: boolean;
  } | null;
}

export interface ApiPrediction {
  id: number;
  created_at: string;
  event: {
    id: number;
    event_date: string;
    status: string;
    home_team_id: number;
    home_team: string;
    away_team_id: number;
    away_team: string;
    league_id: number;
    league_name: string;
  };
  markets: {
    match_result: {
      prob_home: number;
      prob_draw: number;
      prob_away: number;
      predicted: string;
    };
    expected_goals: {
      home: number;
      away: number;
    };
    over_under: {
      prob_over_15: number;
      prob_over_25: number;
      prob_over_35: number;
    };
    btts: {
      prob_yes: number;
    };
    score: {
      most_likely: string;
    };
  };
  recommendations: {
    favorite: string;
    favorite_prob: number;
    bet_favorite: boolean;
    over_15: boolean;
    over_25: boolean;
    over_35: boolean;
    btts: boolean;
    winner: boolean;
  };
  model: {
    confidence: number;
    version: string;
  };
}

export interface ApiOdds {
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
  };
}

export interface ApiStanding {
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
}

export interface ApiStandingsResponse {
  league_id: number;
  season: {
    id: number;
    name: string;
    year: number;
    start_date: string;
    end_date: string;
    is_current: boolean;
  };
  grouped: boolean;
  standings: ApiStanding[];
}

// Normalized types for use in components
export interface MatchData {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  eventDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  currentMinute: number | null;
  period: string;
}

export interface PredictionData {
  id: number;
  match: MatchData;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  predicted: string;
  homeXg: number;
  awayXg: number;
  over15Prob: number;
  over25Prob: number;
  over35Prob: number;
  bttsProb: number;
  mostLikelyScore: string;
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
}

export interface OddsData {
  eventId: number;
  homeWin: number | null;
  draw: number | null;
  awayWin: number | null;
  over15: number | null;
  over25: number | null;
  over35: number | null;
  under15: number | null;
  under25: number | null;
  under35: number | null;
  bttsYes: number | null;
  bttsNo: number | null;
}

export interface StandingData {
  position: number;
  teamId: number;
  teamName: string;
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
  form: string | null;
  live: boolean;
}

export interface ValueBetLegacy {
  match: MatchData;
  prediction: PredictionData;
  market: string;
  selection: string;
  modelProbability: number;
  impliedProbability: number;
  odds: number;
  edge: number;
  kellyStake: number;
  valueRating: number;
}

// Bankroll types
export interface BetRecord {
  id: string;
  match: string;
  selection: string;
  odds: number;
  stake: number;
  result: 'win' | 'loss' | 'pending' | 'void';
  profit: number;
  date: string;
  league?: string;
}

// Navigation
export type NavTab = 'dashboard' | 'predictions' | 'value-bets' | 'live' | 'leagues' | 'bankroll';

// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Frontend Types
// ═══════════════════════════════════════════════════════════════════════

// Model breakdown
export interface OurModelBreakdown {
  elo: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number; reliability: number };
  poisson: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number; reliability: number };
  form: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number; reliability: number };
  xg: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number; reliability: number };
  attackDefense: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number; reliability: number };
}

// Situational intelligence
type MotivationLevel = 'must-win' | 'high' | 'medium' | 'low' | 'dead-rubber';

export interface SituationalData {
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
}

// Market data
export interface MarketData {
  homeWinOdds: number | null;
  drawOdds: number | null;
  awayWinOdds: number | null;
  over25Odds: number | null;
  under25Odds: number | null;
  bttsYesOdds: number | null;
  over15Odds: number | null;
  over35Odds: number | null;
  impliedHomeWin: number | null;
  impliedDraw: number | null;
  impliedAwayWin: number | null;
  overround: number | null;
  marketConfidence: number;
}

// Risk assessment
type RiskLevel = 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | 'avoid';

export interface RiskData {
  riskLevel: RiskLevel;
  riskScore: number;
  modelDisagreement: number;
  dataReliabilityIssue: boolean;
  situationalRisk: boolean;
  marketRisk: boolean;
  riskFactors: string[];
  adjustedConfidence: number;
}

// Punter decision
type DecisionAction = 'strong-bet' | 'bet' | 'small-bet' | 'watch' | 'pass';

export interface PunterDecisionData {
  action: DecisionAction;
  reasoning: string;
  primaryRecommendation: string | null;
  decisionConfidence: number;
  isContrarian: boolean;
  isSafePlay: boolean;
  riskRewardScore: number;
}

// Value bet
export type ValueBetData = {
  market: string;
  selection: string;
  modelProbability: number;
  impliedProbability: number;
  odds: number;
  edge: number;
  kellyStake: number;
  adjustedKelly: number;
  valueRating: number;
  isActionable: boolean;
};

// Full prediction from Punter Brain v2
export interface OurPredictionData {
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  eventDate: string;
  status: string;

  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  predicted: 'H' | 'D' | 'A';
  homeExpectedGoals: number;
  awayExpectedGoals: number;

  over15Prob: number;
  over25Prob: number;
  over35Prob: number;
  bttsProb: number;
  mostLikelyScore: string;

  models: OurModelBreakdown;
  weights: { elo: number; poisson: number; xg: number; form: number; attackDefense: number };

  // Punter Brain v2 intelligence layers
  situational: SituationalData;
  market: MarketData;
  risk: RiskData;
  decision: PunterDecisionData;
  valueBets: ValueBetData[];

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

// Compat: id for legacy code
export interface OurPredictionDataWithId extends OurPredictionData {
  id: number;
  match: MatchData;
  homeXg: number;
  awayXg: number;
}

export interface OurValueBetData {
  match: MatchData;
  prediction: OurPredictionData;
  market: string;
  selection: string;
  modelProbability: number;
  impliedProbability: number;
  odds: number;
  edge: number;
  kellyStake: number;
  adjustedKelly: number;
  valueRating: number;
  isActionable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v4 — Frontend Types
//
// PHILOSOPHY: Study everything. Pick ONE. Or walk away.
// ═══════════════════════════════════════════════════════════════════════

export type TipQuality = 'gold' | 'silver' | 'bronze' | 'skip';

export interface TheTipData {
  selection: string;
  market: string;
  odds: number | null;
  confidence: number;
  edge: number;
  kellyStake: number;
  quality: TipQuality;
  reasoning: string;
  riskLevel: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
  isContrarian: boolean;
  isSafePlay: boolean;
  riskRewardScore: number;
  marketsEvaluated: number;
  rank: 1;
}

export interface H2HSummaryData {
  homeWins: number;
  draws: number;
  awayWins: number;
  totalMeetings: number;
  avgGoals: number;
  over25Rate: number;
  bttsRate: number;
  note: string;
}

export interface TeamLast5Data {
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  form: string;
  cleanSheets: number;
  failedToScore: number;
}

export interface FormSummaryData {
  homeFormScore: number;
  awayFormScore: number;
  homeTrend: 'rising' | 'stable' | 'declining';
  awayTrend: 'rising' | 'stable' | 'declining';
  note: string;
}

export interface ManagerSummaryData {
  homeManager: string | null;
  awayManager: string | null;
  homeStyle: string;
  awayStyle: string;
  tacticalMatchup: string;
  goalExpectationModifier: number;
  bttsModifier: number;
}

export interface GameplaySummaryData {
  expectedStyle: 'open' | 'defensive' | 'asymmetric' | 'balanced';
  expectedGoals: number;
  expectedCards: 'low' | 'average' | 'high';
  possessionExpectation: 'home-dominant' | 'balanced' | 'away-dominant';
  note: string;
}

export interface LeagueContextData {
  leagueId: number;
  leagueName: string;
  avgGoalsPerMatch: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  over25Rate: number;
  bttsRate: number;
  competitiveness: 'high' | 'medium' | 'low';
}

export interface SituationalSummaryData {
  isDerby: boolean;
  homeMotivation: string;
  awayMotivation: string;
  weatherNote: string | null;
  fatigueNote: string | null;
  travelNote: string | null;
  keyAbsences: string[];
}

export interface MatchAnalysisData {
  h2h: H2HSummaryData;
  last5: { home: TeamLast5Data; away: TeamLast5Data };
  form: FormSummaryData;
  manager: ManagerSummaryData;
  gameplay: GameplaySummaryData;
  league: LeagueContextData;
  situation: SituationalSummaryData;
  dataQuality: number;
}

export interface PunterTipV4Data {
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  eventDate: string;
  status: string;
  tip: TheTipData | null;
  skipReason: string | null;
  analysis: MatchAnalysisData;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    homeXg: number;
    awayXg: number;
    over25: number;
    bttsYes: number;
  };
  modelAgreement: number;
  engineVersion: string;
}
