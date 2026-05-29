// ═══════════════════════════════════════════════════════════════════════
// Poisson + Dixon-Coles + market derivation — correctness suite
//
// These tests pin the mathematical contract of the engine. They fail
// loudly if anyone (human or AI) changes the math in a way that violates
// a probability axiom or a market identity.
//
// Categories:
//   1. Numerical sanity — Poisson PMF against known values
//   2. Score matrix invariants — normalisation, non-negativity
//   3. Market derivation identities — sums, monotonicity, BTTS, handicaps
//   4. Edge cases — λ near zero, very high λ, asymmetric λ
//   5. Property-based — random λ pairs, all invariants always hold
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  factorial,
  poissonProb,
  buildScoreMatrix,
  deriveMarketProbabilities,
} from '../poisson';

const EPS = 1e-9;
const EPS_ROUND = 1.5e-4; // probabilities are rounded to 4dp before return

// ─────────────────────────────────────────────────────────────────────
// 1. Numerical sanity
// ─────────────────────────────────────────────────────────────────────
describe('factorial', () => {
  it('matches known values', () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(1)).toBe(1);
    expect(factorial(5)).toBe(120);
    expect(factorial(10)).toBe(3628800);
  });
  it('returns 0 for negative input (defensive)', () => {
    expect(factorial(-1)).toBe(0);
    expect(factorial(-99)).toBe(0);
  });
});

describe('poissonProb', () => {
  it('sums to 1.0 across all k for a fixed λ (truncated to k=20)', () => {
    for (const lambda of [0.3, 1.0, 1.5, 2.4, 3.7]) {
      let sum = 0;
      for (let k = 0; k <= 20; k++) sum += poissonProb(lambda, k);
      expect(sum).toBeGreaterThan(1 - 1e-6);
      expect(sum).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('mean of Poisson(λ) = λ (numerically)', () => {
    for (const lambda of [0.5, 1.2, 2.3]) {
      let mean = 0;
      for (let k = 0; k <= 20; k++) mean += k * poissonProb(lambda, k);
      expect(mean).toBeCloseTo(lambda, 4);
    }
  });
  it('P(k=0 | λ=0) = 1, P(k>0 | λ=0) = 0', () => {
    expect(poissonProb(0, 0)).toBe(1);
    expect(poissonProb(0, 1)).toBe(0);
    expect(poissonProb(0, 5)).toBe(0);
  });
  it('P(λ=1, k=1) = 1/e (~0.3678…)', () => {
    expect(poissonProb(1, 1)).toBeCloseTo(1 / Math.E, 10);
  });
  it('returns 0 for negative k', () => {
    expect(poissonProb(2, -1)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Score matrix invariants
// ─────────────────────────────────────────────────────────────────────
describe('buildScoreMatrix', () => {
  const cases = [
    { home: 1.5, away: 1.0 }, // typical home favourite
    { home: 1.0, away: 1.5 }, // typical away favourite
    { home: 2.5, away: 2.5 }, // open end-to-end
    { home: 0.6, away: 0.8 }, // low-event match (Italy)
    { home: 3.5, away: 0.5 }, // mismatch
    { home: 0.3, away: 0.3 }, // very thin match, DC rho clamping kicks in
  ];

  for (const { home, away } of cases) {
    it(`sums to 1.0 for λ=(${home}, ${away})`, () => {
      const { matrix, maxGoals } = buildScoreMatrix(home, away);
      let sum = 0;
      for (let h = 0; h <= maxGoals; h++) {
        for (let a = 0; a <= maxGoals; a++) sum += matrix[h][a];
      }
      expect(sum).toBeGreaterThan(1 - EPS);
      expect(sum).toBeLessThan(1 + EPS);
    });

    it(`all cells ≥ 0 for λ=(${home}, ${away})`, () => {
      const { matrix, maxGoals } = buildScoreMatrix(home, away);
      for (let h = 0; h <= maxGoals; h++) {
        for (let a = 0; a <= maxGoals; a++) {
          expect(matrix[h][a]).toBeGreaterThanOrEqual(0);
        }
      }
    });
  }

  it('respects custom maxGoals shape', () => {
    const sm = buildScoreMatrix(1.5, 1.5, 5);
    expect(sm.maxGoals).toBe(5);
    expect(sm.matrix.length).toBe(6);
    expect(sm.matrix[0].length).toBe(6);
  });

  it('DC correction pulls draws UP vs vanilla Poisson (the whole point)', () => {
    // For λ=(1.0, 1.0), vanilla Poisson P(0,0) = e^-2 ≈ 0.1353.
    // After DC with ρ=-0.10, P(0,0) should be HIGHER (rho < 0 boosts draws).
    const vanilla00 = Math.exp(-1) * Math.exp(-1); // 0.1353…
    const { matrix } = buildScoreMatrix(1.0, 1.0);
    expect(matrix[0][0]).toBeGreaterThan(vanilla00);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Market derivation identities
// ─────────────────────────────────────────────────────────────────────
describe('deriveMarketProbabilities', () => {
  it('1X2 sums to 1.0 (within rounding)', () => {
    const sm = buildScoreMatrix(1.5, 1.2);
    const p = deriveMarketProbabilities(sm);
    expect(p.homeWin + p.draw + p.awayWin).toBeGreaterThan(1 - EPS_ROUND);
    expect(p.homeWin + p.draw + p.awayWin).toBeLessThan(1 + EPS_ROUND);
  });

  it('over_K + under_K = 1.0 for K ∈ {1.5, 2.5, 3.5}', () => {
    const sm = buildScoreMatrix(1.7, 1.3);
    const p = deriveMarketProbabilities(sm);
    expect(p.over15 + p.under15).toBeCloseTo(1.0, 3);
    expect(p.over25 + p.under25).toBeCloseTo(1.0, 3);
    expect(p.over35 + p.under35).toBeCloseTo(1.0, 3);
  });

  it('over_K monotonic decreasing in K (over05 ≥ over15 ≥ over25 ≥ over35)', () => {
    const sm = buildScoreMatrix(2.0, 1.5);
    const p = deriveMarketProbabilities(sm);
    expect(p.over05).toBeGreaterThanOrEqual(p.over15 - EPS_ROUND);
    expect(p.over15).toBeGreaterThanOrEqual(p.over25 - EPS_ROUND);
    expect(p.over25).toBeGreaterThanOrEqual(p.over35 - EPS_ROUND);
  });

  it('bttsYes + bttsNo = 1.0', () => {
    const sm = buildScoreMatrix(1.3, 1.4);
    const p = deriveMarketProbabilities(sm);
    expect(p.bttsYes + p.bttsNo).toBeCloseTo(1.0, 3);
  });

  it('team totals: homeOver_K + homeUnder_K = 1.0 for the 1.5 line', () => {
    const sm = buildScoreMatrix(1.5, 1.5);
    const p = deriveMarketProbabilities(sm);
    expect(p.homeOver15 + p.homeUnder15).toBeCloseTo(1.0, 3);
    expect(p.awayOver15 + p.awayUnder15).toBeCloseTo(1.0, 3);
  });

  it('handicaps: home win + draw + away win partition correctly', () => {
    // handicapHome1 (h-a ≥ 2) is a strict subset of homeWin (h > a)
    const sm = buildScoreMatrix(1.8, 1.2);
    const p = deriveMarketProbabilities(sm);
    expect(p.handicapHome1).toBeLessThanOrEqual(p.homeWin + EPS_ROUND);
    expect(p.handicapAwayMinus1).toBeLessThanOrEqual(p.awayWin + EPS_ROUND);
  });

  it('handicap +1: handicapHomePlus1 = homeWin + draw + (loss by 1)', () => {
    // h ≥ a - 1 means home doesn't lose by 2+. So handicapHomePlus1 = 1 - handicapAwayMinus1.
    const sm = buildScoreMatrix(1.5, 1.5);
    const p = deriveMarketProbabilities(sm);
    expect(p.handicapHomePlus1 + p.handicapAwayMinus1).toBeCloseTo(1.0, 3);
  });

  it('handicap +1 (away): handicapAway1 = drawOrAwayWin', () => {
    const sm = buildScoreMatrix(1.5, 1.5);
    const p = deriveMarketProbabilities(sm);
    expect(p.handicapAway1).toBeCloseTo(p.draw + p.awayWin, 3);
  });

  it('symmetric λ → symmetric probabilities (homeWin ≈ awayWin)', () => {
    const sm = buildScoreMatrix(1.4, 1.4);
    const p = deriveMarketProbabilities(sm);
    expect(p.homeWin).toBeCloseTo(p.awayWin, 3);
    expect(p.homeOver15).toBeCloseTo(p.awayOver15, 3);
  });

  it('extreme home favourite: P(homeWin) ≫ P(awayWin)', () => {
    const sm = buildScoreMatrix(3.0, 0.5);
    const p = deriveMarketProbabilities(sm);
    expect(p.homeWin).toBeGreaterThan(0.75);
    expect(p.awayWin).toBeLessThan(0.10);
  });

  it('all returned probabilities are in [0,1]', () => {
    const sm = buildScoreMatrix(2.0, 1.0);
    const p = deriveMarketProbabilities(sm);
    for (const [key, value] of Object.entries(p)) {
      expect(value, `${key} out of range`).toBeGreaterThanOrEqual(0);
      expect(value, `${key} out of range`).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Specific golden fixtures — pin exact values so any math drift fails
//    These are NOT regressions to chase — these are the contract.
// ─────────────────────────────────────────────────────────────────────
describe('golden fixtures (pinned probabilities)', () => {
  // λ_h=1.5, λ_a=1.0 — the most common Premier League fixture profile
  it('λ=(1.5, 1.0): homeWin in [0.45, 0.50], draw in [0.24, 0.30], over25 in [0.45, 0.55]', () => {
    const sm = buildScoreMatrix(1.5, 1.0);
    const p = deriveMarketProbabilities(sm);
    expect(p.homeWin).toBeGreaterThan(0.45);
    expect(p.homeWin).toBeLessThan(0.50);
    expect(p.draw).toBeGreaterThan(0.24);
    expect(p.draw).toBeLessThan(0.30);
    expect(p.over25).toBeGreaterThan(0.45);
    expect(p.over25).toBeLessThan(0.55);
  });

  // λ_h=0.8, λ_a=0.8 — Italian/French defensive fixture
  it('λ=(0.8, 0.8): draw is the modal outcome, under25 dominates', () => {
    const sm = buildScoreMatrix(0.8, 0.8);
    const p = deriveMarketProbabilities(sm);
    expect(p.draw).toBeGreaterThan(0.30);
    expect(p.under25).toBeGreaterThan(0.75);
    expect(p.over25).toBeLessThan(0.25);
  });

  // λ_h=2.5, λ_a=2.5 — Bayern vs Dortmund profile
  it('λ=(2.5, 2.5): high-scoring, bttsYes > 0.65, over35 > 0.45', () => {
    const sm = buildScoreMatrix(2.5, 2.5);
    const p = deriveMarketProbabilities(sm);
    expect(p.bttsYes).toBeGreaterThan(0.65);
    expect(p.over35).toBeGreaterThan(0.45);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Property-based — random λ pairs, all invariants always hold
// ─────────────────────────────────────────────────────────────────────
describe('property-based invariants', () => {
  it('for any reasonable λ pair, all probability identities hold', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 5.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 5.0, noNaN: true, noDefaultInfinity: true }),
        (homeLambda, awayLambda) => {
          const sm = buildScoreMatrix(homeLambda, awayLambda);
          const p = deriveMarketProbabilities(sm);

          // 1X2 sum
          const sum1x2 = p.homeWin + p.draw + p.awayWin;
          if (Math.abs(sum1x2 - 1) > EPS_ROUND * 3) return false;

          // Over/Under complements
          if (Math.abs(p.over15 + p.under15 - 1) > EPS_ROUND * 2) return false;
          if (Math.abs(p.over25 + p.under25 - 1) > EPS_ROUND * 2) return false;
          if (Math.abs(p.bttsYes + p.bttsNo - 1) > EPS_ROUND * 2) return false;

          // Monotonicity of overs
          if (p.over15 < p.over25 - EPS_ROUND) return false;
          if (p.over25 < p.over35 - EPS_ROUND) return false;

          // Range
          for (const v of Object.values(p)) {
            if (v < 0 || v > 1) return false;
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});
