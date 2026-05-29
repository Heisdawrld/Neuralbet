// ═══════════════════════════════════════════════════════════════════════
// Backtest scoring functions — math correctness suite
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  brierSingle, brierScore,
  logLossSingle, logLoss,
  hitRate, roi, calibrationBuckets,
  type ScoredPrediction,
} from '../scorers';

// ─────────────────────────────────────────────────────────────────────
// Brier
// ─────────────────────────────────────────────────────────────────────
describe('brierSingle', () => {
  it('perfect prediction (prob=1, won) → 0', () => {
    expect(brierSingle(1, 1)).toBe(0);
  });
  it('perfect prediction (prob=0, lost) → 0', () => {
    expect(brierSingle(0, 0)).toBe(0);
  });
  it('worst case (prob=1, lost) → 1', () => {
    expect(brierSingle(1, 0)).toBe(1);
  });
  it('worst case (prob=0, won) → 1', () => {
    expect(brierSingle(0, 1)).toBe(1);
  });
  it('coin flip → 0.25', () => {
    expect(brierSingle(0.5, 1)).toBe(0.25);
    expect(brierSingle(0.5, 0)).toBe(0.25);
  });
  it('out-of-range probabilities are clamped', () => {
    expect(brierSingle(-0.5, 1)).toBe(1); // clamps to 0 → (0-1)^2 = 1
    expect(brierSingle(1.5, 0)).toBe(1);  // clamps to 1 → (1-0)^2 = 1
  });
});

describe('brierScore', () => {
  it('returns NaN for empty input', () => {
    expect(brierScore([])).toBeNaN();
  });
  it('averages single-sample Brier scores', () => {
    const samples: ScoredPrediction[] = [
      { predictedProb: 0.8, actualOutcome: 1 }, // (0.8-1)^2 = 0.04
      { predictedProb: 0.3, actualOutcome: 0 }, // (0.3-0)^2 = 0.09
    ];
    expect(brierScore(samples)).toBeCloseTo((0.04 + 0.09) / 2, 4);
  });
  it('always-perfect predictions → 0', () => {
    const samples: ScoredPrediction[] = [
      { predictedProb: 1, actualOutcome: 1 },
      { predictedProb: 0, actualOutcome: 0 },
      { predictedProb: 1, actualOutcome: 1 },
    ];
    expect(brierScore(samples)).toBe(0);
  });
  it('coin-flip predictions on random outcomes → ~0.25', () => {
    const samples: ScoredPrediction[] = Array.from({ length: 1000 }, () => ({
      predictedProb: 0.5,
      actualOutcome: (Math.random() < 0.5 ? 1 : 0) as 0 | 1,
    }));
    expect(brierScore(samples)).toBe(0.25);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Log loss
// ─────────────────────────────────────────────────────────────────────
describe('logLossSingle', () => {
  it('coin flip → ln(2) ≈ 0.693', () => {
    expect(logLossSingle(0.5, 1)).toBeCloseTo(Math.LN2, 6);
    expect(logLossSingle(0.5, 0)).toBeCloseTo(Math.LN2, 6);
  });
  it('confident correct → near 0', () => {
    expect(logLossSingle(0.99, 1)).toBeLessThan(0.02);
    expect(logLossSingle(0.01, 0)).toBeLessThan(0.02);
  });
  it('confident wrong → big (but finite — clamped)', () => {
    expect(Number.isFinite(logLossSingle(1, 0))).toBe(true);
    expect(Number.isFinite(logLossSingle(0, 1))).toBe(true);
    expect(logLossSingle(1, 0)).toBeGreaterThan(20);
  });
});

describe('logLoss', () => {
  it('coin flip on 100 random outcomes → ≈ 0.693', () => {
    const samples: ScoredPrediction[] = Array.from({ length: 100 }, () => ({
      predictedProb: 0.5,
      actualOutcome: (Math.random() < 0.5 ? 1 : 0) as 0 | 1,
    }));
    expect(logLoss(samples)).toBeCloseTo(Math.LN2, 4);
  });
  it('NaN on empty input', () => {
    expect(logLoss([])).toBeNaN();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Hit rate
// ─────────────────────────────────────────────────────────────────────
describe('hitRate', () => {
  it('counts hits among beliefs above threshold', () => {
    const samples: ScoredPrediction[] = [
      { predictedProb: 0.8, actualOutcome: 1 }, // believe + hit
      { predictedProb: 0.7, actualOutcome: 0 }, // believe + miss
      { predictedProb: 0.3, actualOutcome: 1 }, // don't believe (ignored)
      { predictedProb: 0.6, actualOutcome: 1 }, // believe + hit
    ];
    const r = hitRate(samples, 0.5);
    expect(r.beliefs).toBe(3);
    expect(r.hits).toBe(2);
    expect(r.rate).toBeCloseTo(2 / 3, 4);
  });
  it('NaN when no beliefs', () => {
    const samples: ScoredPrediction[] = [
      { predictedProb: 0.1, actualOutcome: 1 },
    ];
    expect(hitRate(samples, 0.5).rate).toBeNaN();
  });
});

// ─────────────────────────────────────────────────────────────────────
// ROI
// ─────────────────────────────────────────────────────────────────────
describe('roi', () => {
  it('positive ROI when wins outweigh losses at given odds', () => {
    // 2 wins at 2.0 (each: +1 profit) + 1 loss (−1) = net +1 on 3 staked = +33%
    const samples: ScoredPrediction[] = [
      { predictedProb: 0.7, actualOutcome: 1, decimalOdds: 2.0 },
      { predictedProb: 0.7, actualOutcome: 1, decimalOdds: 2.0 },
      { predictedProb: 0.7, actualOutcome: 0, decimalOdds: 2.0 },
    ];
    const r = roi(samples);
    expect(r.bets).toBe(3);
    expect(r.profit).toBe(1);
    expect(r.staked).toBe(3);
    expect(r.roi).toBeCloseTo(1 / 3, 4);
  });
  it('ignores samples with no odds', () => {
    const samples: ScoredPrediction[] = [
      { predictedProb: 0.7, actualOutcome: 1, decimalOdds: null },
      { predictedProb: 0.7, actualOutcome: 1, decimalOdds: 2.0 },
    ];
    expect(roi(samples).bets).toBe(1);
  });
  it('NaN ROI when no bets placed', () => {
    expect(roi([]).roi).toBeNaN();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Calibration buckets
// ─────────────────────────────────────────────────────────────────────
describe('calibrationBuckets', () => {
  it('returns nBuckets entries', () => {
    const samples: ScoredPrediction[] = [{ predictedProb: 0.55, actualOutcome: 1 }];
    expect(calibrationBuckets(samples, 5).length).toBe(5);
    expect(calibrationBuckets(samples, 10).length).toBe(10);
  });
  it('a perfectly calibrated model has actualRate ≈ binMid in every bucket', () => {
    // Generate 1000 samples where outcome IS the predicted probability
    const samples: ScoredPrediction[] = [];
    for (let i = 0; i < 1000; i++) {
      const p = Math.random();
      samples.push({ predictedProb: p, actualOutcome: (Math.random() < p ? 1 : 0) as 0 | 1 });
    }
    const buckets = calibrationBuckets(samples, 10);
    for (const b of buckets) {
      if (b.count < 30) continue;
      expect(Math.abs(b.actualRate - b.binMid), `bucket ${b.binStart}-${b.binEnd} miscalibrated`).toBeLessThan(0.15);
    }
  });
  it('empty buckets have count=0 and NaN rate', () => {
    const samples: ScoredPrediction[] = [
      { predictedProb: 0.95, actualOutcome: 1 },
    ];
    const buckets = calibrationBuckets(samples, 10);
    expect(buckets[0].count).toBe(0);
    expect(buckets[0].actualRate).toBeNaN();
    expect(buckets[9].count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Property: Brier never exceeds 1
// ─────────────────────────────────────────────────────────────────────
describe('property-based invariants', () => {
  it('brierSingle output is in [0, 1] for any input in [0,1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 1 }),
        (p, o) => {
          const b = brierSingle(p, o as 0 | 1);
          return b >= 0 && b <= 1;
        },
      ),
      { numRuns: 200 },
    );
  });
  it('logLossSingle output is finite + non-negative for any input', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 1 }),
        (p, o) => {
          const l = logLossSingle(p, o as 0 | 1);
          return Number.isFinite(l) && l >= 0;
        },
      ),
      { numRuns: 200 },
    );
  });
});
