// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Referee Intelligence Model
//
// A punter knows: the ref changes the game.
// - A card-happy ref = more fouls = disrupted flow = fewer goals
// - A lenient ref = physical game = more goals from set pieces
// - A ref with high avg goals isn't causing them — but games he
//   officiates tend to be open (assignment bias, but still useful)
// ═══════════════════════════════════════════════════════════════════════

import type { RefereeIntel, RefereeProfile, ModelPrediction } from '../types';
import { buildGoalMatrix, calculateOutcomeProbs, clamp } from '../../utils';

interface RefereeData {
  id: number;
  name: string;
  avg_yellow_per_match: number;
  avg_goals_per_match: number;
  avg_fouls_per_match: number;
  career_games: number;
}

/**
 * Build referee intelligence from Turso data.
 */
export function buildRefereeIntel(referee: RefereeData | null): RefereeIntel {
  if (!referee) {
    return {
      referee: null,
      cardExpectation: 'average',
      goalExpectation: 'average',
      bttsModifier: 0,
      over25Modifier: 0,
    };
  }

  const profile: RefereeProfile = {
    id: referee.id,
    name: referee.name,
    avgYellowPerMatch: referee.avg_yellow_per_match || 3.5,
    avgGoalsPerMatch: referee.avg_goals_per_match || 2.5,
    avgFoulsPerMatch: referee.avg_fouls_per_match || 25,
    careerGames: referee.career_games || 0,
  };

  // Card expectation
  let cardExpectation: 'low' | 'average' | 'high' = 'average';
  if (profile.avgYellowPerMatch > 4.5) cardExpectation = 'high';
  else if (profile.avgYellowPerMatch < 2.5) cardExpectation = 'low';

  // Goal expectation
  let goalExpectation: 'low' | 'average' | 'high' = 'average';
  if (profile.avgGoalsPerMatch > 3.0) goalExpectation = 'high';
  else if (profile.avgGoalsPerMatch < 2.0) goalExpectation = 'low';

  // Modifiers based on referee tendencies
  const avgGoalsDiff = profile.avgGoalsPerMatch - 2.5;
  const over25Modifier = clamp(avgGoalsDiff * 0.05, -0.08, 0.08);
  const bttsModifier = clamp(avgGoalsDiff * 0.03, -0.05, 0.05);

  return {
    referee: profile,
    cardExpectation,
    goalExpectation,
    bttsModifier,
    over25Modifier,
  };
}

/**
 * Referee-adjusted model prediction.
 *
 * Uses the referee's average goals per match to adjust expectations.
 * Weight is low (referees don't directly cause goals) but informative.
 */
export function calculateRefereePrediction(
  referee: RefereeData | null
): ModelPrediction {
  if (!referee) {
    return { homeWinProb: 0.42, drawProb: 0.28, awayWinProb: 0.30, homeExpectedGoals: 1.35, awayExpectedGoals: 1.15, reliability: 0.05 };
  }

  // Use referee's avg goals to estimate total, split roughly 55/45 home/away
  const totalGoals = referee.avg_goals_per_match || 2.5;
  const homeExpectedGoals = clamp(totalGoals * 0.55, 0.3, 3.5);
  const awayExpectedGoals = clamp(totalGoals * 0.45, 0.2, 2.8);

  const matrix = buildGoalMatrix(homeExpectedGoals, awayExpectedGoals, 7, 0.1);
  const outcomes = calculateOutcomeProbs(matrix);

  // Reliability based on career games
  let reliability = 0.15;
  if (referee.career_games > 100) reliability = 0.4;
  else if (referee.career_games > 50) reliability = 0.3;
  else if (referee.career_games > 20) reliability = 0.2;

  return {
    homeWinProb: outcomes.homeWinProb,
    drawProb: outcomes.drawProb,
    awayWinProb: outcomes.awayWinProb,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    reliability,
  };
}
