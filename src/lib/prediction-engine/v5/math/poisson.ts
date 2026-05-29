// ═══════════════════════════════════════════════════════════════════════
// Poisson + Dixon-Coles score matrix + market probability derivation
//
// This is the mathematical foundation of the V5 Phantom Engine. It takes
// home/away expected goals (λ) and produces the joint distribution over
// all plausible scorelines, then derives probabilities for every market
// we serve.
//
// Properties enforced (verified by tests in __tests__/poisson.test.ts):
//   1. P(score = (h,a)) = Poisson(h|λ_h) · Poisson(a|λ_a) · DC(h,a)
//   2. ΣΣ P(h,a) = 1.0 (matrix normalised after DC correction)
//   3. All cells ≥ 0 (rho bounded to prevent negative probabilities)
//   4. homeWin + draw + awayWin = 1.0
//   5. over_K + under_K = 1.0 for K ∈ {0.5, 1.5, 2.5, 3.5}
//   6. over_K is monotonic decreasing in K (over_05 ≥ over_15 ≥ over_25 ≥ over_35)
//   7. bttsYes + bttsNo = 1.0
//   8. Handicap probabilities reflect goal-margin distribution correctly
//
// Dixon-Coles parameter rho:
//   ρ = -0.10 by default. This correction is what makes "Poisson" actually
//   match football data — vanilla Poisson under-predicts draws, especially
//   low-scoring draws (0-0, 1-1). When λ_h · λ_a < |ρ|, rho is dynamically
//   clamped to avoid negative joint probabilities for low-scoring matches.
//
// Performance: factorial is memoised. matrix builds are O(maxGoals²) and
// run in <0.5 ms for maxGoals=7 in V8. Safe to call per-fixture, per-request.
// ═══════════════════════════════════════════════════════════════════════

const factCache: number[] = [1];

/** n! with memoisation. Returns 0 for n < 0. */
export function factorial(n: number): number {
  if (n < 0) return 0;
  if (factCache[n] !== undefined) return factCache[n];
  factCache[n] = n * factorial(n - 1);
  return factCache[n];
}

/** Probability of exactly k events under Poisson(λ). */
export function poissonProb(lambda: number, k: number): number {
  if (k < 0) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

export interface ScoreMatrix {
  /** matrix[h][a] = P(home scores h ∧ away scores a). Always normalised to ΣΣ=1. */
  matrix: number[][];
  /** Maximum goals on each axis (inclusive). Default 7 → 8×8 matrix. */
  maxGoals: number;
}

/**
 * Build the Dixon-Coles bivariate Poisson score matrix.
 *
 * @param homeLambda — Expected goals for home team (>0)
 * @param awayLambda — Expected goals for away team (>0)
 * @param maxGoals  — Highest goal tally to enumerate per side (inclusive)
 * @returns ScoreMatrix with cells summing exactly to 1.0
 */
export function buildScoreMatrix(
  homeLambda: number,
  awayLambda: number,
  maxGoals: number = 7,
): ScoreMatrix {
  // Dixon-Coles rho — negative pulls draws up. Clamp to keep all cells ≥ 0.
  let rho = -0.1;
  if (homeLambda * awayLambda < Math.abs(rho)) {
    rho = -(homeLambda * awayLambda) + 0.01;
  }

  const matrix: number[][] = [];
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      let p = poissonProb(homeLambda, h) * poissonProb(awayLambda, a);
      if (h === 0 && a === 0) p *= 1 - homeLambda * awayLambda * rho;
      else if (h === 0 && a === 1) p *= 1 + homeLambda * rho;
      else if (h === 1 && a === 0) p *= 1 + awayLambda * rho;
      else if (h === 1 && a === 1) p *= 1 - rho;
      matrix[h][a] = Math.max(0, p);
    }
  }

  // Renormalise so cells sum to exactly 1.0 (DC correction breaks the sum).
  let sum = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) sum += matrix[h][a];
  }
  if (sum > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) matrix[h][a] /= sum;
    }
  }

  return { matrix, maxGoals };
}

/** Clamp to [0,1] and round to 4 dp. Used for every emitted probability. */
function cap(v: number): number {
  const clamped = Math.max(0, Math.min(1, v));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Derive every market probability we serve from a Dixon-Coles score matrix.
 *
 * Keys returned (always present, always in [0,1]):
 *   homeWin, draw, awayWin
 *   over05, over15, over25, over35, under15, under25, under35
 *   bttsYes, bttsNo
 *   homeOver05, homeOver15, homeOver25, homeUnder15
 *   awayOver05, awayOver15, awayOver25, awayUnder15
 *   handicapHome1     — home wins by 2+ goals
 *   handicapAwayMinus1— away wins by 2+ goals
 *   handicapHomePlus1 — home wins, draws, or loses by exactly 1 (h ≥ a-1)
 *   handicapAway1     — away wins or draws
 */
export function deriveMarketProbabilities(sm: ScoreMatrix): Record<string, number> {
  const { matrix, maxGoals } = sm;

  let homeWin = 0, draw = 0, awayWin = 0;
  let over05 = 0, over15 = 0, over25 = 0, over35 = 0;
  let bttsYes = 0;
  let homeOver05 = 0, homeOver15 = 0, homeOver25 = 0;
  let awayOver05 = 0, awayOver15 = 0, awayOver25 = 0;
  let handicapHome1 = 0, handicapAwayMinus1 = 0;
  let handicapHomePlus1 = 0, handicapAway1 = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = matrix[h][a];
      const total = h + a;

      // 1X2
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      // Totals
      if (total > 0.5) over05 += p;
      if (total > 1.5) over15 += p;
      if (total > 2.5) over25 += p;
      if (total > 3.5) over35 += p;

      // BTTS
      if (h > 0 && a > 0) bttsYes += p;

      // Team totals
      if (h > 0) homeOver05 += p;
      if (h > 1) homeOver15 += p;
      if (h > 2) homeOver25 += p;
      if (a > 0) awayOver05 += p;
      if (a > 1) awayOver15 += p;
      if (a > 2) awayOver25 += p;

      // Asian handicaps
      if (h - a >= 2) handicapHome1 += p;
      if (a - h >= 2) handicapAwayMinus1 += p;
      if (h >= a - 1) handicapHomePlus1 += p;
      if (a >= h) handicapAway1 += p;
    }
  }

  return {
    homeWin: cap(homeWin), draw: cap(draw), awayWin: cap(awayWin),
    over05: cap(over05), over15: cap(over15), over25: cap(over25), over35: cap(over35),
    under15: cap(1 - over15), under25: cap(1 - over25), under35: cap(1 - over35),
    bttsYes: cap(bttsYes), bttsNo: cap(1 - bttsYes),
    homeOver05: cap(homeOver05), homeOver15: cap(homeOver15), homeOver25: cap(homeOver25),
    homeUnder15: cap(1 - homeOver15),
    awayOver05: cap(awayOver05), awayOver15: cap(awayOver15), awayOver25: cap(awayOver25),
    awayUnder15: cap(1 - awayOver15),
    handicapHome1: cap(handicapHome1),
    handicapAwayMinus1: cap(handicapAwayMinus1),
    handicapHomePlus1: cap(handicapHomePlus1),
    handicapAway1: cap(handicapAway1),
  };
}
