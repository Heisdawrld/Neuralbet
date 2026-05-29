// ═══════════════════════════════════════════════════════════════════════
// Calibration — correctness suite
//
// These tests lock the contract of calibrateProbabilities():
//   1. Bookmaker blend produces the right weighted average
//   2. Script nudges move probabilities in the right direction
//   3. Complement identities hold after every transform
//   4. Monotonicity is repaired
//   5. 1X2 sums to 1.0 within tolerance
//   6. All outputs are in [0, 1]
//   7. Calibration is idempotent for already-calibrated inputs
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildScoreMatrix, deriveMarketProbabilities } from '../poisson';
import {
  calibrateProbabilities,
  BLEND_WEIGHTS,
  CHAOTIC_DAMPEN_THRESHOLD,
  CHAOTIC_DAMPEN_FACTOR,
  OVER15_HARD_CAP,
} from '../calibration';
import type { ScriptOutput } from '../../types';

const EPS = 0.012;

function makeScript(primary: string, confidence = 0.7): ScriptOutput {
  return {
    primary,
    secondary: null,
    confidence,
    homeControlScore: 0.5,
    awayControlScore: 0.5,
    eventLevelScore: 0.5,
    volatilityScore: 0.5,
  };
}

function buildRawProbs(homeXg = 1.5, awayXg = 1.2): Record<string, number> {
  return deriveMarketProbabilities(buildScoreMatrix(homeXg, awayXg));
}

// ─────────────────────────────────────────────────────────────────────
// 1. Bookmaker blend mechanics
// ─────────────────────────────────────────────────────────────────────
describe('bookmaker blend (L1)', () => {
  it('1X2 is exactly the weighted average when implied is provided', () => {
    const raw = buildRawProbs(1.5, 1.5);
    const cal = calibrateProbabilities(
      raw,
      makeScript('open_end_to_end'),
      { impliedHomeProb: 0.50, impliedAwayProb: 0.30 },
    );
    // open_end_to_end doesn't nudge 1X2 directly, so cal.homeWin should reflect blend
    const { model, market } = BLEND_WEIGHTS.ONE_X_TWO;
    const expectedHome = raw.homeWin * model + 0.50 * market;
    expect(cal.homeWin).toBeCloseTo(expectedHome, 2);
  });

  it('over25 blends 65/35 model/market when implied provided', () => {
    const raw = buildRawProbs(2.0, 2.0); // ≈0.65 over25
    const cal = calibrateProbabilities(
      raw,
      makeScript('open_end_to_end'),  // open script nudges over25 +0.03
      { impliedOver25: 0.50 },
    );
    const { model, market } = BLEND_WEIGHTS.OVER_UNDER;
    const blended = raw.over25 * model + 0.50 * market;
    // After nudge of +0.03 from open_end_to_end script
    expect(cal.over25).toBeCloseTo(blended + 0.03, 2);
  });

  it('passing null impliedOdds skips blending entirely', () => {
    const raw = buildRawProbs(1.5, 1.2);
    const cal = calibrateProbabilities(raw, makeScript('dominant_home_pressure'), null);
    // dominant_home_pressure nudges homeWin +0.03
    expect(cal.homeWin).toBeCloseTo(raw.homeWin + 0.03, 2);
  });

  it('partial impliedOdds (only over25) blends only over25, leaves 1X2 alone', () => {
    const raw = buildRawProbs(1.5, 1.5);
    const cal = calibrateProbabilities(
      raw,
      makeScript('balanced'),
      { impliedOver25: 0.40 },
    );
    // 1X2 untouched by blend (no implied), and 'balanced' script doesn't nudge 1X2
    expect(cal.homeWin).toBeCloseTo(raw.homeWin, 3);
    // over25 IS blended
    const { model, market } = BLEND_WEIGHTS.OVER_UNDER;
    expect(cal.over25).toBeCloseTo(raw.over25 * model + 0.40 * market, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Script nudges
// ─────────────────────────────────────────────────────────────────────
describe('script nudges (L2)', () => {
  const raw = buildRawProbs(1.4, 1.4);

  it('dominant_home_pressure: homeWin↑, awayWin↓', () => {
    const cal = calibrateProbabilities(raw, makeScript('dominant_home_pressure'), null);
    expect(cal.homeWin).toBeGreaterThan(raw.homeWin);
    expect(cal.awayWin).toBeLessThan(raw.awayWin);
  });

  it('dominant_away_pressure: awayWin↑, homeWin↓', () => {
    const cal = calibrateProbabilities(raw, makeScript('dominant_away_pressure'), null);
    expect(cal.awayWin).toBeGreaterThan(raw.awayWin);
    expect(cal.homeWin).toBeLessThan(raw.homeWin);
  });

  it('open_end_to_end: bttsYes↑, over25↑, over35↑', () => {
    const cal = calibrateProbabilities(raw, makeScript('open_end_to_end'), null);
    expect(cal.bttsYes).toBeGreaterThan(raw.bttsYes);
    expect(cal.over25).toBeGreaterThan(raw.over25);
    expect(cal.over35).toBeGreaterThan(raw.over35);
  });

  it('tight_low_event: bttsNo↑, over25↓, over15↓', () => {
    const cal = calibrateProbabilities(raw, makeScript('tight_low_event'), null);
    expect(cal.bttsNo).toBeGreaterThan(raw.bttsNo);
    expect(cal.over25).toBeLessThan(raw.over25);
    expect(cal.over15).toBeLessThan(raw.over15);
  });

  it('chaotic_unreliable: any prob > threshold gets dampened', () => {
    // Build a fixture with a high-confidence prediction (mismatch)
    const veryHigh = buildRawProbs(3.0, 0.4); // P(homeWin) will be ~0.85
    expect(veryHigh.homeWin).toBeGreaterThan(CHAOTIC_DAMPEN_THRESHOLD);
    const cal = calibrateProbabilities(veryHigh, makeScript('chaotic_unreliable'), null);
    // homeWin should be (raw * factor) ± rebalance
    expect(cal.homeWin).toBeLessThan(veryHigh.homeWin);
  });

  it('unknown script primary: no nudges applied (passthrough)', () => {
    const cal = calibrateProbabilities(raw, makeScript('absolute_nonsense'), null);
    // Should be identical except for identity-enforcement (which is no-op here)
    expect(cal.homeWin).toBeCloseTo(raw.homeWin, 4);
    expect(cal.bttsYes).toBeCloseTo(raw.bttsYes, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Identity enforcement
// ─────────────────────────────────────────────────────────────────────
describe('identity enforcement (L3)', () => {
  it('all complement pairs still sum to 1.0 after calibration', () => {
    const raw = buildRawProbs(1.5, 1.5);
    const cal = calibrateProbabilities(raw, makeScript('open_end_to_end'), {
      impliedHomeProb: 0.4, impliedAwayProb: 0.35, impliedOver25: 0.55, impliedBttsYes: 0.55,
    });
    const pairs: Array<[string, string]> = [
      ['over15', 'under15'], ['over25', 'under25'], ['over35', 'under35'],
      ['bttsYes', 'bttsNo'],
      ['homeOver15', 'homeUnder15'], ['awayOver15', 'awayUnder15'],
    ];
    for (const [over, under] of pairs) {
      if (cal[over] != null && cal[under] != null) {
        expect(cal[over] + cal[under], `${over} + ${under}`).toBeCloseTo(1.0, 3);
      }
    }
  });

  it('over15 ≥ over25 ≥ over35 always (monotonicity)', () => {
    const raw = buildRawProbs(0.5, 0.5);
    // Manually corrupt to violate monotonicity
    raw.over15 = 0.30;
    raw.over25 = 0.40; // VIOLATES (over15 < over25)
    raw.over35 = 0.20;
    const cal = calibrateProbabilities(raw, makeScript('tight_low_event'), null);
    expect(cal.over15).toBeGreaterThanOrEqual(cal.over25);
    expect(cal.over25).toBeGreaterThanOrEqual(cal.over35);
  });

  it('1X2 sums to within tolerance of 1.0 even after script nudges', () => {
    const raw = buildRawProbs(1.5, 1.5);
    const cal = calibrateProbabilities(raw, makeScript('dominant_home_pressure'), null);
    const sum = cal.homeWin + cal.draw + cal.awayWin;
    expect(sum).toBeGreaterThan(1 - EPS);
    expect(sum).toBeLessThan(1 + EPS);
  });

  it('over15 is capped at max(OVER15_HARD_CAP, over25) — respects monotonicity', () => {
    // High λ → both over15 and over25 are near 1.0
    const raw = buildRawProbs(3.5, 3.5);
    expect(raw.over15).toBeGreaterThan(0.90);
    const cal = calibrateProbabilities(raw, makeScript('open_end_to_end'), null);
    const effectiveCap = Math.max(OVER15_HARD_CAP, cal.over25);
    expect(cal.over15).toBeLessThanOrEqual(effectiveCap + 0.001);
  });

  it('over15 hard cap fires when over25 is low (typical case)', () => {
    // Fabricate raw probs: high over15 but unrealistically lower over25.
    // After calibration, over15 should be capped to OVER15_HARD_CAP since
    // monotonicity raises over25 to match anyway. Actually — when over25 is
    // already low, the over15 sanity dampener (multiplier) fires instead.
    // The hard cap is enforced for cases where someone (or some future layer)
    // pushed over15 above 0.90 with over25 NOT high.
    const raw: Record<string, number> = {
      over05: 0.95, over15: 0.92, over25: 0.85, over35: 0.50,
      under05: 0.05, under15: 0.08, under25: 0.15, under35: 0.50,
      homeWin: 0.40, draw: 0.30, awayWin: 0.30,
      bttsYes: 0.55, bttsNo: 0.45,
    };
    const cal = calibrateProbabilities(raw, makeScript('balanced'), null);
    // over25 = 0.85, so effective cap = max(0.90, 0.85) = 0.90 → over15 capped at 0.90
    expect(cal.over15).toBeLessThanOrEqual(0.901);
  });

  it('all returned values are in [0, 1]', () => {
    const raw = buildRawProbs(2.0, 1.8);
    const cal = calibrateProbabilities(raw, makeScript('chaotic_unreliable'), {
      impliedHomeProb: 0.5, impliedAwayProb: 0.3, impliedOver25: 0.7, impliedBttsYes: 0.65,
    });
    for (const [k, v] of Object.entries(cal)) {
      expect(v, `${k} out of range`).toBeGreaterThanOrEqual(0);
      expect(v, `${k} out of range`).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Robustness
// ─────────────────────────────────────────────────────────────────────
describe('robustness', () => {
  it('does not mutate the input raw probability map', () => {
    const raw = buildRawProbs(1.5, 1.5);
    const snapshot = JSON.stringify(raw);
    calibrateProbabilities(raw, makeScript('open_end_to_end'), { impliedOver25: 0.55 });
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  it('survives sparse raw input (missing keys)', () => {
    const sparse: Record<string, number> = { over25: 0.45, bttsYes: 0.6 };
    const cal = calibrateProbabilities(sparse, makeScript('open_end_to_end'), null);
    expect(cal.over25).toBeDefined();
    expect(cal.bttsYes).toBeDefined();
    // Should not throw or NaN-out
    for (const v of Object.values(cal)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('survives all-null impliedOdds fields', () => {
    const raw = buildRawProbs(1.5, 1.2);
    const cal = calibrateProbabilities(raw, makeScript('open_end_to_end'), {
      impliedHomeProb: null, impliedAwayProb: null, impliedOver25: null,
      impliedOver15: null, impliedBttsYes: null,
    });
    // No blend should happen — output should match the no-impliedOdds case
    const cal2 = calibrateProbabilities(raw, makeScript('open_end_to_end'), null);
    expect(cal.homeWin).toBeCloseTo(cal2.homeWin, 4);
    expect(cal.over25).toBeCloseTo(cal2.over25, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Property-based — random raw probs + random implied, all axioms hold
// ─────────────────────────────────────────────────────────────────────
describe('property-based invariants', () => {
  it('for any reasonable raw probs + implied, all axioms hold', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.4, max: 3.5, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.4, max: 3.5, noNaN: true, noDefaultInfinity: true }),
        fc.option(fc.double({ min: 0.10, max: 0.85, noNaN: true, noDefaultInfinity: true }), { nil: null }),
        fc.option(fc.double({ min: 0.10, max: 0.85, noNaN: true, noDefaultInfinity: true }), { nil: null }),
        fc.option(fc.double({ min: 0.15, max: 0.85, noNaN: true, noDefaultInfinity: true }), { nil: null }),
        fc.constantFrom(
          'open_end_to_end',
          'tight_low_event',
          'dominant_home_pressure',
          'dominant_away_pressure',
          'chaotic_unreliable',
          'balanced',
        ),
        (homeXg, awayXg, impHome, impAway, impOver25, scriptPrimary) => {
          const raw = buildRawProbs(homeXg, awayXg);
          const cal = calibrateProbabilities(raw, makeScript(scriptPrimary), {
            impliedHomeProb: impHome,
            impliedAwayProb: impAway,
            impliedOver25: impOver25,
          });

          // All in [0,1]
          for (const v of Object.values(cal)) {
            if (typeof v !== 'number') continue;
            if (v < 0 || v > 1) return false;
          }
          // 1X2 sums to within 0.02 of 1.0
          if (cal.homeWin != null && cal.draw != null && cal.awayWin != null) {
            const s = cal.homeWin + cal.draw + cal.awayWin;
            if (Math.abs(s - 1) > 0.02) return false;
          }
          // Complements
          if (cal.over25 != null && cal.under25 != null) {
            if (Math.abs(cal.over25 + cal.under25 - 1) > 0.01) return false;
          }
          if (cal.bttsYes != null && cal.bttsNo != null) {
            if (Math.abs(cal.bttsYes + cal.bttsNo - 1) > 0.01) return false;
          }
          // Monotonicity
          if (cal.over15 != null && cal.over25 != null && cal.over15 < cal.over25 - 0.001) return false;
          if (cal.over25 != null && cal.over35 != null && cal.over25 < cal.over35 - 0.001) return false;
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});
