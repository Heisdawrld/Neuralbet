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
  bttsYes: number | null;
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

export interface ValueBetData {
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

// Our custom prediction engine types
export interface OurModelBreakdown {
  elo: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number };
  poisson: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number };
  form: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number };
  xg: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number };
  attackDefense: { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number };
}

export interface OurPredictionData {
  id: number; // eventId
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
  // Engine-specific fields
  models: OurModelBreakdown;
  weights: { elo: number; poisson: number; form: number; xg: number; attackDefense: number };
  engineVersion: string;
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
  valueRating: number;
}
