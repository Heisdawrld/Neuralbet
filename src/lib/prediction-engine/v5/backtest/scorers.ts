// ═══════════════════════════════════════════════════════════════════════
// Backtest scoring functions
//
// Three quality metrics — each measures something different:
//
//   BRIER SCORE — average squared difference between predicted probability
//     and actual outcome (0 or 1). Lower is better.
//     Range: [0, 1]. Coin flip (always 0.5) = 0.25. Perfect = 0.
//
//   LOG LOSS — penalises confident wrong predictions much more heavily.
//     Range: [0, ∞). Coin flip (always 0.5) = 0.693. Perfect = 0.
//
//   HIT RATE — fraction of predictions where the model's preferred outcome
//     matched reality. Useful for headline trust but doesn't measure
//     calibration — a model can have 60% hit rate by always betting
//     favourites. Hit rate is a tie-breaker, not a primary metric.
//
//   ROI — return on stake. Assumes 1-unit stake on each bet at the
//     bookmaker odds. ROI > 0 = profitable. Industry benchmark: +3% is
//     elite, anything sustained above 0% beats the bookmaker.
// ═══════════════════════════════════════════════════════════════════════

/** A single outcome for scoring. */
export interface ScoredPrediction {
  /** Model's predicted probability of the bet hitting (0-1). */
  predictedProb: number;
  /** Actual outcome: 1 if the bet hit, 0 if it didn't. */
  actualOutcome: 0 | 1;
  /** Bookmaker odds at the time (used for ROI only — optional). */
  decimalOdds?: number | null;
}

/** Brier score for a single (prob, outcome) pair. */
export function brierSingle(predictedProb: number, actualOutcome: 0 | 1): number {
  const p = Math.max(0, Math.min(1, predictedProb));
  return (p - actualOutcome) ** 2;
}

/** Mean Brier score across N predictions. Lower is better. */
export function brierScore(samples: ScoredPrediction[]): number {
  if (samples.length === 0) return NaN;
  let sum = 0;
  for (const s of samples) sum += brierSingle(s.predictedProb, s.actualOutcome);
  return sum / samples.length;
}

/** Log loss for a single pair. */
export function logLossSingle(predictedProb: number, actualOutcome: 0 | 1): number {
  // Clamp inside (0, 1) to avoid -Infinity for confident wrong predictions
  const p = Math.max(1e-12, Math.min(1 - 1e-12, predictedProb));
  return actualOutcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

/** Mean log loss. Lower is better. */
export function logLoss(samples: ScoredPrediction[]): number {
  if (samples.length === 0) return NaN;
  let sum = 0;
  for (const s of samples) sum += logLossSingle(s.predictedProb, s.actualOutcome);
  return sum / samples.length;
}

/**
 * Hit rate at a probability threshold.
 * Counts how often the model "believed" the bet hit (prob >= threshold)
 * AND it actually did, divided by total beliefs at that threshold.
 *
 * Example: at threshold 0.5, model predicted hit for 100 bets, 58 won → 0.58.
 */
export function hitRate(samples: ScoredPrediction[], threshold = 0.5): {
  rate: number; hits: number; beliefs: number;
} {
  let hits = 0;
  let beliefs = 0;
  for (const s of samples) {
    if (s.predictedProb >= threshold) {
      beliefs++;
      if (s.actualOutcome === 1) hits++;
    }
  }
  return {
    rate: beliefs === 0 ? NaN : hits / beliefs,
    hits,
    beliefs,
  };
}

/**
 * ROI assuming 1-unit stake on every prediction where we "believed"
 * (predictedProb >= threshold) AND the market was priced.
 *
 * For each hit: profit = (odds - 1)
 * For each miss: loss = -1
 * ROI = total_profit / total_staked
 */
export function roi(samples: ScoredPrediction[], threshold = 0.5): {
  roi: number; profit: number; staked: number; bets: number;
} {
  let profit = 0;
  let staked = 0;
  let bets = 0;
  for (const s of samples) {
    if (s.predictedProb < threshold) continue;
    if (s.decimalOdds == null || s.decimalOdds <= 1.0) continue;
    bets++;
    staked += 1;
    if (s.actualOutcome === 1) profit += s.decimalOdds - 1;
    else profit -= 1;
  }
  return {
    roi: staked === 0 ? NaN : profit / staked,
    profit,
    staked,
    bets,
  };
}

/**
 * Calibration buckets: bin predictions by predicted probability,
 * compute actual hit rate within each bin. A well-calibrated model
 * has actualHitRate[bin] ≈ binMidpoint.
 *
 * Useful for plotting reliability diagrams.
 */
export function calibrationBuckets(samples: ScoredPrediction[], nBuckets = 10): Array<{
  binStart: number; binEnd: number; binMid: number;
  count: number; expectedHits: number; actualHits: number;
  predictedAvgProb: number; actualRate: number;
}> {
  const buckets: number[][] = Array.from({ length: nBuckets }, () => []);
  const actuals: number[][] = Array.from({ length: nBuckets }, () => []);
  for (const s of samples) {
    const p = Math.max(0, Math.min(0.9999, s.predictedProb));
    const idx = Math.floor(p * nBuckets);
    buckets[idx].push(p);
    actuals[idx].push(s.actualOutcome);
  }
  return buckets.map((bucket, i) => {
    const binStart = i / nBuckets;
    const binEnd = (i + 1) / nBuckets;
    const binMid = (binStart + binEnd) / 2;
    const count = bucket.length;
    const predictedAvgProb = count === 0 ? NaN : bucket.reduce((a, b) => a + b, 0) / count;
    const actualHits = actuals[i].reduce((a, b) => a + b, 0);
    const actualRate = count === 0 ? NaN : actualHits / count;
    return {
      binStart, binEnd, binMid,
      count, predictedAvgProb,
      expectedHits: count * binMid, actualHits, actualRate,
    };
  });
}
