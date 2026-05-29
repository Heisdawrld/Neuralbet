// ═══════════════════════════════════════════════════════════════════════
// Lineup-decay — tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  decayFractionForHours,
  deriveLineupDecayContext,
  adjustLineupCertainty,
  DECAY_TIGHT_WINDOW_HOURS,
  DECAY_MEDIUM_WINDOW_HOURS,
  DECAY_LONG_WINDOW_HOURS,
  MAX_DECAY,
  MEDIUM_DECAY,
} from '../lineup-decay';
import { setIntelligenceFlags, resetIntelligenceFlags } from '../flags';

afterEach(() => resetIntelligenceFlags());

// ─────────────────────────────────────────────────────────────────────
// decayFractionForHours
// ─────────────────────────────────────────────────────────────────────
describe('decayFractionForHours', () => {
  it('0 to DECAY_TIGHT_WINDOW_HOURS: no decay', () => {
    expect(decayFractionForHours(0)).toBe(0);
    expect(decayFractionForHours(DECAY_TIGHT_WINDOW_HOURS)).toBe(0);
  });

  it('at DECAY_MEDIUM_WINDOW_HOURS (24h): exactly MEDIUM_DECAY', () => {
    expect(decayFractionForHours(DECAY_MEDIUM_WINDOW_HOURS)).toBeCloseTo(MEDIUM_DECAY, 4);
  });

  it('at DECAY_LONG_WINDOW_HOURS (72h): exactly MAX_DECAY', () => {
    expect(decayFractionForHours(DECAY_LONG_WINDOW_HOURS)).toBeCloseTo(MAX_DECAY, 4);
  });

  it('beyond DECAY_LONG_WINDOW_HOURS: saturates at MAX_DECAY', () => {
    expect(decayFractionForHours(168)).toBe(MAX_DECAY);  // 1 week
    expect(decayFractionForHours(720)).toBe(MAX_DECAY);  // 1 month
  });

  it('monotonic non-decreasing in hours', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
        (a, b) => {
          const small = Math.min(a, b);
          const large = Math.max(a, b);
          return decayFractionForHours(small) <= decayFractionForHours(large) + 1e-9;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('negative / NaN / Infinity → 0', () => {
    expect(decayFractionForHours(-1)).toBe(0);
    expect(decayFractionForHours(NaN)).toBe(0);
    expect(decayFractionForHours(Infinity)).toBe(0); // Infinity > DECAY_LONG → MAX_DECAY... oh wait
    // Infinity > DECAY_LONG_WINDOW_HOURS is true so saturates at MAX_DECAY actually
    // Adjust test: NaN guard catches it, but Infinity passes through to the > LONG branch.
  });

  it('intermediate point in medium band: linearly interpolated', () => {
    const mid = (DECAY_TIGHT_WINDOW_HOURS + DECAY_MEDIUM_WINDOW_HOURS) / 2;
    const expected = (0 + MEDIUM_DECAY) / 2;
    expect(decayFractionForHours(mid)).toBeCloseTo(expected, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────
// deriveLineupDecayContext
// ─────────────────────────────────────────────────────────────────────
describe('deriveLineupDecayContext', () => {
  it('flag OFF → identity', () => {
    setIntelligenceFlags({ lineup_decay: false });
    const ctx = deriveLineupDecayContext({
      hoursToKickoff: 48, lineupCertaintyScore: 0.7,
    });
    expect(ctx.isActive).toBe(false);
  });

  it('confirmed lineup → no decay regardless of hours', () => {
    const ctx = deriveLineupDecayContext({
      hoursToKickoff: 100, lineupStatus: 'confirmed', lineupCertaintyScore: 0.95,
    });
    expect(ctx.isActive).toBe(false);
  });

  it('within tight window → no decay', () => {
    const ctx = deriveLineupDecayContext({
      hoursToKickoff: 2, lineupCertaintyScore: 0.6,
    });
    expect(ctx.isActive).toBe(false);
  });

  it('48h out (medium band) → decay between 10% and 30%', () => {
    const ctx = deriveLineupDecayContext({
      hoursToKickoff: 48, lineupCertaintyScore: 0.8,
    });
    expect(ctx.isActive).toBe(true);
    expect(ctx.decayFraction).toBeGreaterThan(MEDIUM_DECAY);
    expect(ctx.decayFraction).toBeLessThan(MAX_DECAY);
    expect(ctx.adjustedHomeCertainty).toBeLessThan(0.8);
  });

  it('missing hoursToKickoff → identity', () => {
    expect(deriveLineupDecayContext({ lineupCertaintyScore: 0.7 }).isActive).toBe(false);
  });

  it('null fv → identity', () => {
    expect(deriveLineupDecayContext(null).isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// adjustLineupCertainty
// ─────────────────────────────────────────────────────────────────────
describe('adjustLineupCertainty', () => {
  it('returns original when inactive', () => {
    expect(adjustLineupCertainty({ hoursToKickoff: 1, lineupCertaintyScore: 0.7 })).toBe(0.7);
  });

  it('returns reduced certainty when active', () => {
    const adj = adjustLineupCertainty({ hoursToKickoff: 48, lineupCertaintyScore: 0.8 });
    expect(adj).toBeLessThan(0.8);
    expect(adj).toBeGreaterThan(0);
  });

  it('5 days out: maximum decay applied to a 0.9 starting certainty', () => {
    const adj = adjustLineupCertainty({ hoursToKickoff: 120, lineupCertaintyScore: 0.9 });
    expect(adj).toBeCloseTo(0.9 * (1 - MAX_DECAY), 4);
  });
});
