import type { ModelPrediction } from './types';

/**
 * Calculate form-based prediction from recent match form strings.
 *
 * Form strings like "WWLDW" are converted to power ratings:
 *   W = 3 points, D = 1 point, L = 0 points
 * Recent matches are weighted more heavily (exponential decay).
 *
 * Maximum possible weighted form = ~10 points.
 * Normalized to 0-1 scale by dividing by 10.
 */

interface FormInput {
  homeForm: string;    // e.g. "WWLDW"
  awayForm: string;    // e.g. "LDWWL"
  homeGoalForm: number; // average goals scored in recent matches
  awayGoalForm: number; // average goals scored in recent matches
}

function calculateFormRating(form: string): number {
  if (!form || form.length === 0) return 0.5; // neutral if no data

  const decay = 0.8; // each older match gets 80% weight of the next
  let totalWeight = 0;
  let weightedScore = 0;

  // Process from most recent (first char) to oldest
  const chars = form.slice(0, 5).split('');
  for (let i = 0; i < chars.length; i++) {
    const weight = Math.pow(decay, i);
    let points: number;
    switch (chars[i]) {
      case 'W':
        points = 3;
        break;
      case 'D':
        points = 1;
        break;
      case 'L':
        points = 0;
        break;
      default:
        points = 1; // unknown = treat as draw
    }
    weightedScore += points * weight;
    totalWeight += 3 * weight; // max possible per match is 3
  }

  if (totalWeight === 0) return 0.5;
  return weightedScore / totalWeight; // 0-1 scale
}

/**
 * Calculate match prediction based on recent form.
 */
export function calculateFormPrediction(
  homeFormInput: FormInput,
  awayFormInput: FormInput
): ModelPrediction {
  const homeFormRating = calculateFormRating(homeFormInput.homeForm);
  const awayFormRating = calculateFormRating(awayFormInput.awayForm);

  // Home advantage boost
  const homeAdvantage = 0.06;
  const adjustedHomeRating = Math.min(1, homeFormRating + homeAdvantage);

  // Convert form ratings to win probabilities
  // The larger the gap in form, the more decisive the prediction
  const formDiff = adjustedHomeRating - awayFormRating;

  // Base probabilities
  let homeWinProb = 0.33 + formDiff * 0.6;
  let awayWinProb = 0.33 - formDiff * 0.6;

  // Draw probability: higher when forms are similar
  const formSimilarity = 1 - Math.abs(formDiff) * 2;
  const drawProb = 0.26 * Math.max(0.3, formSimilarity);

  // Adjust for draw
  homeWinProb = Math.max(0.05, homeWinProb - drawProb * 0.3);
  awayWinProb = Math.max(0.05, awayWinProb - drawProb * 0.3);

  // Normalize
  const total = homeWinProb + drawProb + awayWinProb;

  // Expected goals from form and goal scoring form
  const homeExpectedGoals = Math.max(
    0.5,
    homeFormInput.homeGoalForm * (1 + homeAdvantage)
  );
  const awayExpectedGoals = Math.max(0.3, awayFormInput.awayGoalForm);

  return {
    homeWinProb: homeWinProb / total,
    drawProb: drawProb / total,
    awayWinProb: awayWinProb / total,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
  };
}
