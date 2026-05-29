// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Shared Math Utilities
// No duplication. Every model uses these same building blocks.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Poisson probability: P(X=k) = (lambda^k * e^-lambda) / k!
 * Uses logarithms for numerical stability with large k.
 */
export function poissonProb(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k === 0) return Math.exp(-lambda);

  // Use log-space to avoid overflow: log(P) = k*log(lambda) - lambda - log(k!)
  let logFactorial = 0;
  for (let i = 2; i <= k; i++) {
    logFactorial += Math.log(i);
  }
  const logProb = k * Math.log(lambda) - lambda - logFactorial;
  return Math.exp(logProb);
}

/**
 * Build the full goal probability matrix (0-maxGoals × 0-maxGoals)
 * using independent Poisson distributions.
 *
 * Includes a correlation adjustment (Dixon-Coles inspired):
 * Real football goals are slightly dependent (game state affects both teams).
 * We apply a small correction to 0-0, 1-0, 0-1, 1-1 scores.
 */
export function buildGoalMatrix(
  homeLambda: number,
  awayLambda: number,
  maxGoals = 7,
  rho = 0.1 // correlation parameter (Dixon-Coles style)
): number[][] {
  const matrix: number[][] = [];

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const baseProb = poissonProb(homeLambda, h) * poissonProb(awayLambda, a);

      // Dixon-Coles correction for low-scoring matches
      // This adjusts for the fact that Poisson underestimates 0-0 and 1-1
      // and overestimates 1-0 and 0-1
      let correction = 1;
      if (h === 0 && a === 0) {
        correction = 1 - (homeLambda * awayLambda * rho);
      } else if (h === 1 && a === 0) {
        correction = 1 + (awayLambda * rho);
      } else if (h === 0 && a === 1) {
        correction = 1 + (homeLambda * rho);
      } else if (h === 1 && a === 1) {
        correction = 1 - rho;
      }

      matrix[h][a] = Math.max(0, baseProb * correction);
    }
  }

  return matrix;
}

/**
 * Calculate match outcome probabilities from a goal matrix.
 */
export function calculateOutcomeProbs(matrix: number[][]): {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
} {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      const prob = matrix[h][a];
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

/**
 * Calculate derived market probabilities from a goal matrix.
 */
export function calculateDerivedMarkets(matrix: number[][]): {
  over15Prob: number;
  over25Prob: number;
  over35Prob: number;
  bttsProb: number;
  mostLikelyScore: string;
  correctScores: Array<{ score: string; prob: number }>;
} {
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let btts = 0;
  let maxProb = 0;
  let mostLikelyScore = '1-1';
  const correctScores: Array<{ score: string; prob: number }> = [];

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      const prob = matrix[h][a];
      if (h + a > 1.5) over15 += prob;
      if (h + a > 2.5) over25 += prob;
      if (h + a > 3.5) over35 += prob;
      if (h > 0 && a > 0) btts += prob;

      correctScores.push({ score: `${h}-${a}`, prob });
      if (prob > maxProb) {
        maxProb = prob;
        mostLikelyScore = `${h}-${a}`;
      }
    }
  }

  // Sort correct scores by probability
  correctScores.sort((a, b) => b.prob - a.prob);

  return {
    over15Prob: over15,
    over25Prob: over25,
    over35Prob: over35,
    bttsProb: btts,
    mostLikelyScore,
    correctScores: correctScores.slice(0, 10),
  };
}

/**
 * Regression to the mean — pull extreme values toward the average.
 *
 * A punter knows that extreme stats are often luck, not skill.
 * A team scoring 3 goals/game over 5 matches will likely regress.
 * A team with 0.3 goals/game over 10 matches... also probably regression.
 *
 * @param value The observed value
 * @param mean The league average / expected value
 * @param sampleSize Number of observations
 * @param shrinkageRate How fast we trust the data (higher = trust sooner)
 * @returns Regressed value
 */
export function regressToMean(
  value: number,
  mean: number,
  sampleSize: number,
  shrinkageRate = 10
): number {
  if (sampleSize <= 0) return mean;
  // Shrinkage factor: how much weight to give the observed value vs the mean
  // With 0 samples: 100% mean. With many samples: mostly observed value.
  const shrinkage = sampleSize / (sampleSize + shrinkageRate);
  return mean + shrinkage * (value - mean);
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize probabilities so they sum to 1.
 */
export function normalizeProbs(probs: number[]): number[] {
  const total = probs.reduce((s, p) => s + p, 0);
  if (total === 0) return probs.map(() => 1 / probs.length);
  return probs.map((p) => p / total);
}

/**
 * Calculate weighted standard deviation.
 * Used to measure model disagreement.
 */
export function weightedStdDev(values: number[], weights: number[]): number {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return 0;

  const mean = values.reduce((s, v, i) => s + v * weights[i], 0) / totalWeight;
  const variance = values.reduce((s, v, i) => s + weights[i] * (v - mean) ** 2, 0) / totalWeight;

  return Math.sqrt(variance);
}

/**
 * Implied probability from decimal odds (removes overround proportionally).
 */
export function impliedProbability(odds: number): number {
  if (odds <= 1) return 0;
  return 1 / odds;
}

/**
 * Calculate overround from a set of decimal odds.
 * Overround = sum of implied probabilities - 1
 * Typical bookmaker overround: 3-8%
 */
export function calculateOverround(odds: number[]): number | null {
  const validOdds = odds.filter((o) => o > 1);
  if (validOdds.length < 2) return null;
  return validOdds.reduce((s, o) => s + 1 / o, 0) - 1;
}

/**
 * Kelly Criterion: optimal bet size as fraction of bankroll.
 * f = (b*p - q) / b where b = odds-1, p = probability, q = 1-p
 *
 * Returns 0 if no edge exists.
 */
export function kellyCriterion(probability: number, odds: number): number {
  if (odds <= 1 || probability <= 0) return 0;
  const b = odds - 1;
  const q = 1 - probability;
  const kelly = (b * probability - q) / b;
  return Math.max(0, kelly);
}

/**
 * Neutral prediction when we have no data.
 * Based on global football averages: home wins ~42%, draw ~28%, away ~30%.
 */
export function neutralPrediction(): import('./types').ModelPrediction {
  return {
    homeWinProb: 0.42,
    drawProb: 0.28,
    awayWinProb: 0.30,
    homeExpectedGoals: 1.35,
    awayExpectedGoals: 1.15,
    reliability: 0.05, // Basically no reliability
  };
}
