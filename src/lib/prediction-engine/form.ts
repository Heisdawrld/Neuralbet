// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Form Analysis Model
//
// Form is a story, not a number. A punter reads form like this:
// - "WWLWW" — team lost one but bounced back. Strong mentality.
// - "LLLWL" — team in freefall. One win doesn't fix it.
// - "WLDWL" — inconsistent. Don't trust them with big stakes.
// - "WWWWW" — suspicious. Everything goes right? Probably regression coming.
//
// Key insight: form WEIGHT matters more than form RATING.
// Recent matches matter more, but how MUCH more depends on the narrative.
// ═══════════════════════════════════════════════════════════════════════

import type { ModelPrediction } from './types';
import { clamp } from './utils';

interface FormInput {
  homeForm: string;
  awayForm: string;
  homeGoalForm: number;
  awayGoalForm: number;
}

/**
 * Calculate form rating with momentum detection.
 *
 * Returns a 0-1 rating where:
 * - 0.5 = average form
 * - >0.5 = good form
 * - <0.5 = bad form
 *
 * Also detects MOMENTUM (trending up or down) which affects reliability.
 */
function calculateFormRating(form: string): {
  rating: number;
  momentum: 'rising' | 'stable' | 'falling';
  volatility: number; // how up-and-down the form is
} {
  if (!form || form.length === 0) {
    return { rating: 0.5, momentum: 'stable', volatility: 0 };
  }

  const chars = form.slice(0, 5).split('');
  const decay = 0.75; // Recent matches matter more

  let totalWeight = 0;
  let weightedScore = 0;
  const results: number[] = [];

  for (let i = 0; i < chars.length; i++) {
    const weight = Math.pow(decay, i);
    let points: number;
    switch (chars[i]) {
      case 'W': points = 3; break;
      case 'D': points = 1; break;
      case 'L': points = 0; break;
      default: points = 1;
    }
    weightedScore += points * weight;
    totalWeight += 3 * weight;
    results.push(points / 3); // Normalize to 0-1
  }

  const rating = totalWeight > 0 ? weightedScore / totalWeight : 0.5;

  // Detect momentum: are recent results better or worse than older ones?
  let momentum: 'rising' | 'stable' | 'falling' = 'stable';
  if (results.length >= 3) {
    const recent = results.slice(0, 2).reduce((s, v) => s + v, 0) / 2;
    const older = results.slice(2).reduce((s, v) => s + v, 0) / Math.max(1, results.length - 2);
    if (recent > older + 0.15) momentum = 'rising';
    else if (recent < older - 0.15) momentum = 'falling';
  }

  // Volatility: how inconsistent is the form?
  let volatility = 0;
  if (results.length >= 2) {
    const mean = results.reduce((s, v) => s + v, 0) / results.length;
    const variance = results.reduce((s, v) => s + (v - mean) ** 2, 0) / results.length;
    volatility = Math.sqrt(variance);
  }

  return { rating, momentum, volatility };
}

/**
 * Generate form-based match prediction.
 *
 * A punter doesn't just look at "who's in better form?"
 * They look at HOW the form was achieved:
 * - Rising form = trust it more (team is improving)
 * - Falling form = trust it less (team is declining)
 * - Volatile form = REDUCE confidence (team is inconsistent)
 */
export function calculateFormPrediction(
  homeFormInput: FormInput,
  awayFormInput: FormInput
): ModelPrediction {
  const homeForm = calculateFormRating(homeFormInput.homeForm);
  const awayForm = calculateFormRating(awayFormInput.awayForm);

  // Home advantage boost
  const homeAdvantage = 0.06;
  const adjustedHomeRating = Math.min(1, homeForm.rating + homeAdvantage);

  // Convert form ratings to win probabilities
  const formDiff = adjustedHomeRating - awayForm.rating;

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

  // Expected goals from goal scoring form
  const homeExpectedGoals = clamp(
    homeFormInput.homeGoalForm * (1 + homeAdvantage),
    0.4,
    3.0
  );
  const awayExpectedGoals = clamp(awayFormInput.awayGoalForm, 0.3, 2.5);

  // Reliability depends on form length, momentum, and volatility
  const homeFormLength = homeFormInput.homeForm.length;
  const awayFormLength = awayFormInput.awayForm.length;
  const minFormLength = Math.min(homeFormLength, awayFormLength);

  let reliability: number;
  if (minFormLength < 2) reliability = 0.1;
  else if (minFormLength < 3) reliability = 0.25;
  else if (minFormLength < 5) reliability = 0.45;
  else reliability = 0.6;

  // Momentum bonus: rising form is more reliable
  if (homeForm.momentum === 'rising' && awayForm.momentum !== 'rising') {
    reliability += 0.05;
  }
  if (awayForm.momentum === 'rising' && homeForm.momentum !== 'rising') {
    reliability += 0.05;
  }

  // Volatility penalty: inconsistent form is less reliable
  const maxVolatility = Math.max(homeForm.volatility, awayForm.volatility);
  reliability -= maxVolatility * 0.2;

  // Extreme form penalty: "WWWWW" is suspicious (regression incoming)
  if (homeForm.rating > 0.9 || awayForm.rating > 0.9) {
    reliability -= 0.1;
  }
  // Same for "LLLLL" — team is due for something different
  if (homeForm.rating < 0.1 || awayForm.rating < 0.1) {
    reliability -= 0.05;
  }

  reliability = clamp(reliability, 0.05, 0.65);

  return {
    homeWinProb: homeWinProb / total,
    drawProb: drawProb / total,
    awayWinProb: awayWinProb / total,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    reliability,
  };
}
