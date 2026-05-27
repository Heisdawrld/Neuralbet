import type {
  TeamStats,
  EloRating,
  ModelPrediction,
  LeagueAvgData,
  EnsemblePrediction,
} from './types';
import { calculateEloPrediction } from './elo';
import { calculatePoissonPrediction, buildGoalMatrix, calculateDerivedMarkets } from './poisson';
import { calculateFormPrediction } from './form';
import { calculateXgPrediction } from './xg-model';
import { calculateAttackDefensePrediction } from './attack-defense';

const ENGINE_VERSION = '1.0.0';

// Default ensemble weights
const DEFAULT_WEIGHTS = {
  elo: 0.25,
  poisson: 0.25,
  xg: 0.20,
  form: 0.15,
  attackDefense: 0.15,
};

interface EventInput {
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  eventDate: string;
  status: string;
}

/**
 * Generate the full ensemble prediction for a single match.
 */
export function generateEnsemblePrediction(
  event: EventInput,
  homeStats: TeamStats | null,
  awayStats: TeamStats | null,
  eloRatings: Map<number, EloRating>,
  leagueAvgData: LeagueAvgData | null
): EnsemblePrediction | null {
  // Need at least some data to make a prediction
  if (!homeStats && !awayStats && !leagueAvgData) {
    return null;
  }

  // Create default stats when data is missing
  const defaultStats: TeamStats = {
    teamId: 0,
    teamName: '',
    matchesPlayed: 0,
    goalsScored: 0,
    goalsConceded: 0,
    xgf: 0,
    xga: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    form: '',
    homeMatches: 0,
    homeGoalsScored: 0,
    homeGoalsConceded: 0,
    homeWins: 0,
    homeDraws: 0,
    homeLosses: 0,
    awayMatches: 0,
    awayGoalsScored: 0,
    awayGoalsConceded: 0,
    awayWins: 0,
    awayDraws: 0,
    awayLosses: 0,
    leaguePosition: 0,
    leagueId: event.leagueId,
    leagueName: event.leagueName,
    points: 0,
    xgd: 0,
  };

  const hStats = homeStats ?? { ...defaultStats, teamId: event.homeTeamId, teamName: event.homeTeam };
  const aStats = awayStats ?? { ...defaultStats, teamId: event.awayTeamId, teamName: event.awayTeam };

  const defaultLeagueAvg: LeagueAvgData = {
    avgHomeGoals: 1.35,
    avgAwayGoals: 1.15,
    avgGoalsScored: 1.25,
    avgGoalsConceded: 1.25,
    avgXgf: 1.25,
    avgXga: 1.25,
  };
  const leagueAvg = leagueAvgData ?? defaultLeagueAvg;

  // Run all 5 models
  const homeElo = eloRatings.get(event.homeTeamId);
  const awayElo = eloRatings.get(event.awayTeamId);

  const eloPred = calculateEloPrediction(homeElo, awayElo);

  const hasStatsData = hStats.matchesPlayed > 0 && aStats.matchesPlayed > 0;
  const poissonPred = hasStatsData
    ? calculatePoissonPrediction(hStats, aStats, leagueAvg)
    : neutralPrediction();

  const formPred = calculateFormPrediction(
    {
      homeForm: hStats.form || '',
      awayForm: aStats.form || '',
      homeGoalForm: hStats.matchesPlayed > 0 ? hStats.goalsScored / hStats.matchesPlayed : 1.2,
      awayGoalForm: aStats.matchesPlayed > 0 ? aStats.goalsScored / aStats.matchesPlayed : 1.0,
    },
    {
      homeForm: aStats.form ? aStats.form.split('').reverse().join('') : '', // away form from away perspective
      awayForm: hStats.form ? hStats.form.split('').reverse().join('') : '',
      homeGoalForm: aStats.matchesPlayed > 0 ? aStats.awayGoalsScored / Math.max(1, aStats.awayMatches) : 1.0,
      awayGoalForm: hStats.matchesPlayed > 0 ? hStats.homeGoalsScored / Math.max(1, hStats.homeMatches) : 1.2,
    }
  );

  const hasXgData =
    hStats.xgf > 0 && aStats.xgf > 0 && leagueAvg.avgXgf > 0;
  const xgPred = hasXgData
    ? calculateXgPrediction(hStats, aStats, leagueAvg)
    : neutralPrediction();

  const attackDefensePred = hasStatsData
    ? calculateAttackDefensePrediction(hStats, aStats, leagueAvg)
    : neutralPrediction();

  // Calculate dynamic weights
  const weights = calculateDynamicWeights(
    hasStatsData,
    hasXgData,
    hStats.form?.length ?? 0,
    aStats.form?.length ?? 0,
    homeElo !== undefined,
    awayElo !== undefined
  );

  // Weighted average of model predictions
  const finalHomeWinProb =
    weights.elo * eloPred.homeWinProb +
    weights.poisson * poissonPred.homeWinProb +
    weights.xg * xgPred.homeWinProb +
    weights.form * formPred.homeWinProb +
    weights.attackDefense * attackDefensePred.homeWinProb;

  const finalDrawProb =
    weights.elo * eloPred.drawProb +
    weights.poisson * poissonPred.drawProb +
    weights.xg * xgPred.drawProb +
    weights.form * formPred.drawProb +
    weights.attackDefense * attackDefensePred.drawProb;

  const finalAwayWinProb =
    weights.elo * eloPred.awayWinProb +
    weights.poisson * poissonPred.awayWinProb +
    weights.xg * xgPred.awayWinProb +
    weights.form * formPred.awayWinProb +
    weights.attackDefense * attackDefensePred.awayWinProb;

  // Normalize final probabilities
  const totalProb = finalHomeWinProb + finalDrawProb + finalAwayWinProb;
  const normHomeWin = totalProb > 0 ? finalHomeWinProb / totalProb : 0.4;
  const normDraw = totalProb > 0 ? finalDrawProb / totalProb : 0.3;
  const normAwayWin = totalProb > 0 ? finalAwayWinProb / totalProb : 0.3;

  // Ensemble expected goals (weighted average)
  const homeExpectedGoals =
    weights.elo * eloPred.homeExpectedGoals +
    weights.poisson * poissonPred.homeExpectedGoals +
    weights.xg * xgPred.homeExpectedGoals +
    weights.form * formPred.homeExpectedGoals +
    weights.attackDefense * attackDefensePred.homeExpectedGoals;

  const awayExpectedGoals =
    weights.elo * eloPred.awayExpectedGoals +
    weights.poisson * poissonPred.awayExpectedGoals +
    weights.xg * xgPred.awayExpectedGoals +
    weights.form * formPred.awayExpectedGoals +
    weights.attackDefense * attackDefensePred.awayExpectedGoals;

  // Build goal matrix for derived markets using ensemble expected goals
  const goalMatrix = buildGoalMatrix(
    Math.max(0.3, homeExpectedGoals),
    Math.max(0.2, awayExpectedGoals)
  );
  const derivedMarkets = calculateDerivedMarkets(goalMatrix);

  // Determine predicted outcome
  let predicted: 'H' | 'D' | 'A';
  if (normHomeWin >= normDraw && normHomeWin >= normAwayWin) {
    predicted = 'H';
  } else if (normAwayWin >= normDraw && normAwayWin >= normHomeWin) {
    predicted = 'A';
  } else {
    predicted = 'D';
  }

  // Calculate confidence based on model agreement
  const confidence = calculateConfidence(
    [eloPred, poissonPred, xgPred, formPred, attackDefensePred],
    [weights.elo, weights.poisson, weights.xg, weights.form, weights.attackDefense]
  );

  // Generate recommendations
  const favorite =
    normHomeWin > normAwayWin ? event.homeTeam : event.awayTeam;
  const favoriteProb = Math.max(normHomeWin, normAwayWin);

  const recommendations = {
    favorite,
    favoriteProb,
    betFavorite: confidence > 0.55 && favoriteProb > 0.45,
    over15: derivedMarkets.over15Prob > 0.55,
    over25: derivedMarkets.over25Prob > 0.55,
    over35: derivedMarkets.over35Prob > 0.55,
    btts: derivedMarkets.bttsProb > 0.55,
    winner: confidence > 0.65 && favoriteProb > 0.5,
  };

  const isRecommended =
    recommendations.betFavorite ||
    recommendations.over25 ||
    recommendations.btts ||
    recommendations.winner;

  return {
    eventId: event.eventId,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    homeTeamId: event.homeTeamId,
    awayTeamId: event.awayTeamId,
    leagueId: event.leagueId,
    leagueName: event.leagueName,
    eventDate: event.eventDate,
    status: event.status,
    homeWinProb: Math.round(normHomeWin * 10000) / 10000,
    drawProb: Math.round(normDraw * 10000) / 10000,
    awayWinProb: Math.round(normAwayWin * 10000) / 10000,
    predicted,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    over15Prob: Math.round(derivedMarkets.over15Prob * 10000) / 10000,
    over25Prob: Math.round(derivedMarkets.over25Prob * 10000) / 10000,
    over35Prob: Math.round(derivedMarkets.over35Prob * 10000) / 10000,
    bttsProb: Math.round(derivedMarkets.bttsProb * 10000) / 10000,
    mostLikelyScore: derivedMarkets.mostLikelyScore,
    models: {
      elo: eloPred,
      poisson: poissonPred,
      form: formPred,
      xg: xgPred,
      attackDefense: attackDefensePred,
    },
    weights,
    confidence: Math.round(confidence * 10000) / 10000,
    recommendations,
    isRecommended,
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * Calculate dynamic weights based on available data quality.
 */
function calculateDynamicWeights(
  hasStatsData: boolean,
  hasXgData: boolean,
  homeFormLength: number,
  awayFormLength: number,
  hasHomeElo: boolean,
  hasAwayElo: boolean
): { elo: number; poisson: number; xg: number; form: number; attackDefense: number } {
  let weights = { ...DEFAULT_WEIGHTS };

  // If xG data is available, boost xg weight
  if (hasXgData) {
    weights.xg = 0.25;
    weights.poisson = 0.20;
  } else {
    weights.xg = 0.10;
    weights.poisson = 0.30;
  }

  // If form data is limited, reduce form weight
  const minFormLength = Math.min(homeFormLength, awayFormLength);
  if (minFormLength < 3) {
    weights.form = 0.08;
    // Redistribute to other models
    const redistributed = 0.15 - 0.08;
    weights.elo += redistributed * 0.4;
    weights.poisson += redistributed * 0.3;
    weights.xg += redistributed * 0.3;
  }

  // If no Elo data, reduce elo weight
  if (!hasHomeElo || !hasAwayElo) {
    weights.elo = 0.10;
    const redistributed = 0.25 - 0.10;
    weights.poisson += redistributed * 0.4;
    weights.xg += redistributed * 0.3;
    weights.attackDefense += redistributed * 0.3;
  }

  // If no stats data, rely more on Elo and form
  if (!hasStatsData) {
    weights.poisson = 0.10;
    weights.attackDefense = 0.10;
    weights.elo = 0.35;
    weights.form = 0.25;
    weights.xg = 0.05;
  }

  // Normalize weights to sum to 1
  const total = weights.elo + weights.poisson + weights.xg + weights.form + weights.attackDefense;
  if (total > 0) {
    weights.elo /= total;
    weights.poisson /= total;
    weights.xg /= total;
    weights.form /= total;
    weights.attackDefense /= total;
  }

  // Round weights
  return {
    elo: Math.round(weights.elo * 1000) / 1000,
    poisson: Math.round(weights.poisson * 1000) / 1000,
    xg: Math.round(weights.xg * 1000) / 1000,
    form: Math.round(weights.form * 1000) / 1000,
    attackDefense: Math.round(weights.attackDefense * 1000) / 1000,
  };
}

/**
 * Calculate confidence based on how closely the models agree.
 *
 * confidence = 1 - (weighted stddev of probabilities) * 3
 * When models agree, confidence is high. When they disagree, it's low.
 */
function calculateConfidence(
  modelPredictions: ModelPrediction[],
  modelWeights: number[]
): number {
  const totalWeight = modelWeights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return 0.3;

  // Calculate weighted mean for each outcome
  let meanHome = 0;
  let meanDraw = 0;
  let meanAway = 0;
  for (let i = 0; i < modelPredictions.length; i++) {
    const w = modelWeights[i] / totalWeight;
    meanHome += w * modelPredictions[i].homeWinProb;
    meanDraw += w * modelPredictions[i].drawProb;
    meanAway += w * modelPredictions[i].awayWinProb;
  }

  // Calculate weighted variance for home win probability
  let variance = 0;
  for (let i = 0; i < modelPredictions.length; i++) {
    const w = modelWeights[i] / totalWeight;
    variance += w * Math.pow(modelPredictions[i].homeWinProb - meanHome, 2);
  }

  const stddev = Math.sqrt(variance);
  const confidence = 1 - stddev * 3;

  return Math.max(0.1, Math.min(1, confidence));
}

/**
 * Returns a neutral prediction when insufficient data is available.
 */
function neutralPrediction(): ModelPrediction {
  return {
    homeWinProb: 0.42,
    drawProb: 0.28,
    awayWinProb: 0.30,
    homeExpectedGoals: 1.35,
    awayExpectedGoals: 1.15,
  };
}
