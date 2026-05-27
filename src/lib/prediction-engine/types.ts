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

export interface ModelPrediction {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
}

export interface LeagueAvgData {
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  avgXgf: number;
  avgXga: number;
}

export interface EnsemblePrediction {
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
  models: {
    elo: ModelPrediction;
    poisson: ModelPrediction;
    form: ModelPrediction;
    xg: ModelPrediction;
    attackDefense: ModelPrediction;
  };
  weights: {
    elo: number;
    poisson: number;
    form: number;
    xg: number;
    attackDefense: number;
  };
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
