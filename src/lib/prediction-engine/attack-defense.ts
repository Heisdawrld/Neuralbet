import type { TeamStats, ModelPrediction, LeagueAvgData } from './types';

/**
 * Attack/Defense Strength Model
 *
 * Classic model that compares each team's goal scoring and conceding
 * rates against the league average.
 *
 * Attack strength = goals scored / league average goals scored
 * Defense strength = goals conceded / league average goals conceded
 *
 * Separate home/away strengths are calculated for more precision.
 */
export function calculateAttackDefensePrediction(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: LeagueAvgData
): ModelPrediction {
  if (
    leagueAvg.avgGoalsScored <= 0 ||
    leagueAvg.avgGoalsConceded <= 0 ||
    homeStats.matchesPlayed === 0 ||
    awayStats.matchesPlayed === 0
  ) {
    return {
      homeWinProb: 0.42,
      drawProb: 0.28,
      awayWinProb: 0.30,
      homeExpectedGoals: 1.35,
      awayExpectedGoals: 1.15,
    };
  }

  // Home team attack strength (using home-specific data when available)
  const homeAttackStrength =
    homeStats.homeMatches > 0
      ? (homeStats.homeGoalsScored / homeStats.homeMatches) /
        leagueAvg.avgHomeGoals
      : (homeStats.goalsScored / homeStats.matchesPlayed) /
        leagueAvg.avgGoalsScored;

  // Away team defense weakness (how many goals they concede away)
  const awayDefenseWeakness =
    awayStats.awayMatches > 0
      ? (awayStats.awayGoalsConceded / awayStats.awayMatches) /
        leagueAvg.avgAwayGoals
      : (awayStats.goalsConceded / awayStats.matchesPlayed) /
        leagueAvg.avgGoalsConceded;

  // Away team attack strength
  const awayAttackStrength =
    awayStats.awayMatches > 0
      ? (awayStats.awayGoalsScored / awayStats.awayMatches) /
        leagueAvg.avgAwayGoals
      : (awayStats.goalsScored / awayStats.matchesPlayed) /
        leagueAvg.avgGoalsScored;

  // Home team defense weakness
  const homeDefenseWeakness =
    homeStats.homeMatches > 0
      ? (homeStats.homeGoalsConceded / homeStats.homeMatches) /
        leagueAvg.avgHomeGoals
      : (homeStats.goalsConceded / homeStats.matchesPlayed) /
        leagueAvg.avgGoalsConceded;

  // Expected goals
  const homeExpectedGoals =
    homeAttackStrength * awayDefenseWeakness * leagueAvg.avgHomeGoals;
  const awayExpectedGoals =
    awayAttackStrength * homeDefenseWeakness * leagueAvg.avgAwayGoals;

  // Use Poisson for match outcome probabilities
  const homeLambda = Math.max(0.3, homeExpectedGoals);
  const awayLambda = Math.max(0.2, awayExpectedGoals);

  const { homeWinProb, drawProb, awayWinProb } = poissonMatchOdds(
    homeLambda,
    awayLambda
  );

  return {
    homeWinProb,
    drawProb,
    awayWinProb,
    homeExpectedGoals: Math.round(homeLambda * 100) / 100,
    awayExpectedGoals: Math.round(awayLambda * 100) / 100,
  };
}

function poissonMatchOdds(
  homeLambda: number,
  awayLambda: number
): { homeWinProb: number; drawProb: number; awayWinProb: number } {
  const maxGoals = 7;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = poissonProb(homeLambda, h) * poissonProb(awayLambda, a);
      if (h > a) homeWin += prob;
      else if (h === a) draw += prob;
      else awayWin += prob;
    }
  }

  const total = homeWin + draw + awayWin;
  if (total === 0) return { homeWinProb: 0.4, drawProb: 0.3, awayWinProb: 0.3 };

  return {
    homeWinProb: homeWin / total,
    drawProb: draw / total,
    awayWinProb: awayWin / total,
  };
}

function poissonProb(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let factorial = 1;
  for (let i = 2; i <= k; i++) {
    factorial *= i;
  }
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}
