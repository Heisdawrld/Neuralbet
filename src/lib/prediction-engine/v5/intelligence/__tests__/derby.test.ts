// ═══════════════════════════════════════════════════════════════════════
// Derby intelligence — correctness tests
//
// Pins:
//   - Non-derby fixtures get a perfect no-op (zero behaviour change)
//   - Derby intensity scales correctly with H2H + chaos + proximity
//   - xG dampener bounded between BASE and BASE × MAX_EXTRA
//   - Volatility delta + BTTS tilt scale with intensity
//   - Pure: no mutation of input fv or probs
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeDerbyIntensity,
  deriveDerbyContext,
  applyDerbyToXg,
  applyDerbyToVolatility,
  applyDerbyToProbs,
  DERBY_BASE_XG_DAMPENER,
  DERBY_MAX_EXTRA_DAMPENER,
  DERBY_VOLATILITY_BOOST,
  DERBY_BTTS_TILT,
  VOLATILITY_CEIL,
} from '../derby';

const baseFv = (overrides: any = {}) => ({
  isLocalDerby: true,
  h2hMatchesAvailable: 5,
  matchChaosScore: 0.5,
  travelDistanceKm: 10,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────
// Non-derby — no-op contract
// ─────────────────────────────────────────────────────────────────────
describe('non-derby fixtures — no-op', () => {
  it('computeDerbyIntensity returns 0 for non-derby', () => {
    expect(computeDerbyIntensity({ isLocalDerby: false })).toBe(0);
    expect(computeDerbyIntensity({})).toBe(0);
    expect(computeDerbyIntensity(null)).toBe(0);
  });

  it('deriveDerbyContext returns identity context for non-derby', () => {
    const ctx = deriveDerbyContext({ isLocalDerby: false });
    expect(ctx.isDerby).toBe(false);
    expect(ctx.intensity).toBe(0);
    expect(ctx.xgDampener).toBe(1.0);
    expect(ctx.volatilityDelta).toBe(0);
    expect(ctx.bttsTilt).toBe(0);
  });

  it('applyDerbyToXg is identity for non-derby', () => {
    const out = applyDerbyToXg(1.5, 1.2, { isLocalDerby: false });
    expect(out.homeXg).toBe(1.5);
    expect(out.awayXg).toBe(1.2);
  });

  it('applyDerbyToProbs is identity for non-derby', () => {
    const probs = { bttsYes: 0.5, bttsNo: 0.5, homeWin: 0.4, draw: 0.3, awayWin: 0.3 };
    const out = applyDerbyToProbs(probs, { isLocalDerby: false });
    expect(out).toEqual(probs);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Intensity scaling
// ─────────────────────────────────────────────────────────────────────
describe('computeDerbyIntensity', () => {
  it('soft derby (low H2H, low chaos, distant): intensity is low', () => {
    const i = computeDerbyIntensity(baseFv({
      h2hMatchesAvailable: 1, matchChaosScore: 0.3, travelDistanceKm: 200,
    }));
    expect(i).toBeLessThan(0.4);
  });

  it('fierce derby (lots of H2H, high chaos, 0km): intensity near 1', () => {
    const i = computeDerbyIntensity(baseFv({
      h2hMatchesAvailable: 20, matchChaosScore: 0.85, travelDistanceKm: 0,
    }));
    expect(i).toBeGreaterThan(0.85);
  });

  it('balanced derby (5 H2H, 0.5 chaos, 10km): intensity is mid', () => {
    const i = computeDerbyIntensity(baseFv());
    expect(i).toBeGreaterThan(0.5);
    expect(i).toBeLessThan(0.95);
  });

  it('H2H contribution saturates at INTENSITY_H2H_SATURATION', () => {
    const i1 = computeDerbyIntensity(baseFv({ h2hMatchesAvailable: 10 }));
    const i2 = computeDerbyIntensity(baseFv({ h2hMatchesAvailable: 100 }));
    expect(i1).toBeCloseTo(i2, 5);  // both saturate
  });

  it('proximity drops with distance', () => {
    const close = computeDerbyIntensity(baseFv({ travelDistanceKm: 10 }));
    const far = computeDerbyIntensity(baseFv({ travelDistanceKm: 300 }));
    expect(close).toBeGreaterThan(far);
  });
});

// ─────────────────────────────────────────────────────────────────────
// xG dampener
// ─────────────────────────────────────────────────────────────────────
describe('applyDerbyToXg', () => {
  it('applies BASE dampener at zero intensity', () => {
    // h2h=0, chaos=0, travel=999 → intensity=0
    const fv = baseFv({ h2hMatchesAvailable: 0, matchChaosScore: 0, travelDistanceKm: 999 });
    const out = applyDerbyToXg(1.5, 1.2, fv);
    expect(out.homeXg).toBeCloseTo(1.5 * DERBY_BASE_XG_DAMPENER, 4);
    expect(out.awayXg).toBeCloseTo(1.2 * DERBY_BASE_XG_DAMPENER, 4);
  });

  it('applies stronger dampener at max intensity (still bounded)', () => {
    const fv = baseFv({ h2hMatchesAvailable: 20, matchChaosScore: 1.0, travelDistanceKm: 0 });
    const out = applyDerbyToXg(1.5, 1.5, fv);
    const expectedDamper = DERBY_BASE_XG_DAMPENER * DERBY_MAX_EXTRA_DAMPENER;
    expect(out.homeXg).toBeCloseTo(1.5 * expectedDamper, 3);
  });

  it('output xG always positive and less than input', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 4.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 4.0, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 30 }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 500 }),
        (h, a, h2h, chaos, travel) => {
          const fv = baseFv({ h2hMatchesAvailable: h2h, matchChaosScore: chaos, travelDistanceKm: travel });
          const out = applyDerbyToXg(h, a, fv);
          return out.homeXg > 0 && out.homeXg <= h
              && out.awayXg > 0 && out.awayXg <= a;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Volatility boost
// ─────────────────────────────────────────────────────────────────────
describe('applyDerbyToVolatility', () => {
  it('returns base chaos unchanged for non-derby', () => {
    expect(applyDerbyToVolatility({ isLocalDerby: false, matchChaosScore: 0.4 })).toBe(0.4);
  });

  it('adds volatility delta scaled by intensity', () => {
    const fv = baseFv({ matchChaosScore: 0.5, h2hMatchesAvailable: 20, travelDistanceKm: 0 });
    const out = applyDerbyToVolatility(fv);
    expect(out).toBeGreaterThan(0.5);
    expect(out).toBeLessThanOrEqual(0.5 + DERBY_VOLATILITY_BOOST + 0.001);
  });

  it('volatility capped at VOLATILITY_CEIL', () => {
    const fv = baseFv({ matchChaosScore: 0.95, h2hMatchesAvailable: 20, travelDistanceKm: 0 });
    const out = applyDerbyToVolatility(fv);
    expect(out).toBeLessThanOrEqual(VOLATILITY_CEIL);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BTTS tilt
// ─────────────────────────────────────────────────────────────────────
describe('applyDerbyToProbs', () => {
  it('tilts bttsYes UP for derbies', () => {
    const probs = { bttsYes: 0.55, bttsNo: 0.45 };
    const fv = baseFv({ h2hMatchesAvailable: 10, matchChaosScore: 0.8, travelDistanceKm: 0 });
    const out = applyDerbyToProbs(probs, fv);
    expect(out.bttsYes).toBeGreaterThan(0.55);
    expect(out.bttsYes + out.bttsNo).toBeCloseTo(1.0, 4);
  });

  it('does NOT mutate input probs', () => {
    const probs = { bttsYes: 0.55, bttsNo: 0.45 };
    const snap = { ...probs };
    applyDerbyToProbs(probs, baseFv());
    expect(probs).toEqual(snap);
  });

  it('skips when bttsYes is not present', () => {
    const probs = { homeWin: 0.4 };
    const out = applyDerbyToProbs(probs, baseFv());
    expect(out.bttsYes).toBeUndefined();
  });

  it('tilt is bounded — never pushes bttsYes outside [0.01, 0.99]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 30 }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (btts, h2h, chaos) => {
          const probs = { bttsYes: btts, bttsNo: 1 - btts };
          const fv = baseFv({ h2hMatchesAvailable: h2h, matchChaosScore: chaos });
          const out = applyDerbyToProbs(probs, fv);
          return out.bttsYes! >= 0.01 && out.bttsYes! <= 0.99;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Combined behaviour (sanity)
// ─────────────────────────────────────────────────────────────────────
describe('end-to-end derby sanity', () => {
  it('fierce derby pulls everything in the right direction', () => {
    const fv = baseFv({
      isLocalDerby: true,
      h2hMatchesAvailable: 20,
      matchChaosScore: 0.7,
      travelDistanceKm: 0,
    });
    const ctx = deriveDerbyContext(fv);
    expect(ctx.isDerby).toBe(true);
    expect(ctx.intensity).toBeGreaterThan(0.8);
    expect(ctx.xgDampener).toBeLessThan(DERBY_BASE_XG_DAMPENER + 0.01);
    expect(ctx.volatilityDelta).toBeGreaterThan(0);
    expect(ctx.bttsTilt).toBeGreaterThan(0);
  });

  it('soft derby (low intensity) applies milder corrections', () => {
    const soft = deriveDerbyContext(baseFv({
      h2hMatchesAvailable: 1, matchChaosScore: 0.2, travelDistanceKm: 200,
    }));
    const fierce = deriveDerbyContext(baseFv({
      h2hMatchesAvailable: 20, matchChaosScore: 0.9, travelDistanceKm: 0,
    }));
    expect(soft.intensity).toBeLessThan(fierce.intensity);
    expect(soft.xgDampener).toBeGreaterThan(fierce.xgDampener); // less damped
    expect(soft.volatilityDelta).toBeLessThan(fierce.volatilityDelta);
    expect(soft.bttsTilt).toBeLessThan(fierce.bttsTilt);
  });
});
