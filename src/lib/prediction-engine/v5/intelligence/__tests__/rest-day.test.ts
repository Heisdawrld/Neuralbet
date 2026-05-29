// ═══════════════════════════════════════════════════════════════════════
// Rest-day intelligence — tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  deriveRestDayContext,
  applyRestDayToXg,
  REST_DIFF_MIN_TRIGGER_DAYS,
  REST_MAX_PENALTY,
  REST_MAX_PLAUSIBLE_DAYS,
} from '../rest-day';
import { setIntelligenceFlags, resetIntelligenceFlags } from '../flags';

afterEach(() => resetIntelligenceFlags());

// ─────────────────────────────────────────────────────────────────────
// No-op contract
// ─────────────────────────────────────────────────────────────────────
describe('rest-day — no-op contract', () => {
  it('flag OFF → identity', () => {
    setIntelligenceFlags({ rest_day: false });
    const ctx = deriveRestDayContext({ homeRestDays: 7, awayRestDays: 3 });
    expect(ctx.isActive).toBe(false);
    expect(ctx.homeXgMultiplier).toBe(1.0);
    expect(ctx.awayXgMultiplier).toBe(1.0);
  });

  it('missing homeRestDays → identity', () => {
    const ctx = deriveRestDayContext({ awayRestDays: 3 });
    expect(ctx.isActive).toBe(false);
  });

  it('missing awayRestDays → identity', () => {
    const ctx = deriveRestDayContext({ homeRestDays: 7 });
    expect(ctx.isActive).toBe(false);
  });

  it('null fv → identity', () => {
    expect(deriveRestDayContext(null).isActive).toBe(false);
  });

  it('negative rest days → identity (defensive)', () => {
    expect(deriveRestDayContext({ homeRestDays: -1, awayRestDays: 3 }).isActive).toBe(false);
    expect(deriveRestDayContext({ homeRestDays: 7, awayRestDays: -5 }).isActive).toBe(false);
  });

  it('rest days beyond REST_MAX_PLAUSIBLE_DAYS → identity', () => {
    const fv = { homeRestDays: REST_MAX_PLAUSIBLE_DAYS + 5, awayRestDays: 3 };
    expect(deriveRestDayContext(fv).isActive).toBe(false);
  });

  it('differential below trigger threshold → identity', () => {
    // 2-day differential — no effect
    expect(deriveRestDayContext({ homeRestDays: 5, awayRestDays: 3 }).isActive).toBe(false);
    expect(deriveRestDayContext({ homeRestDays: 3, awayRestDays: 5 }).isActive).toBe(false);
    // equal rest — no effect
    expect(deriveRestDayContext({ homeRestDays: 7, awayRestDays: 7 }).isActive).toBe(false);
  });

  it('applyRestDayToXg returns identity when no-op', () => {
    const out = applyRestDayToXg(1.5, 1.2, { homeRestDays: 5, awayRestDays: 5 });
    expect(out.homeXg).toBe(1.5);
    expect(out.awayXg).toBe(1.2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Penalty scaling
// ─────────────────────────────────────────────────────────────────────
describe('rest-day — penalty scaling', () => {
  it('3-day diff: -3% to fatigued side', () => {
    const ctx = deriveRestDayContext({ homeRestDays: 7, awayRestDays: 4 });
    expect(ctx.isActive).toBe(true);
    expect(ctx.differentialDays).toBe(3);
    expect(ctx.homeXgMultiplier).toBe(1.0);    // home rested → unaffected
    expect(ctx.awayXgMultiplier).toBeCloseTo(0.97, 4); // away penalised
  });

  it('4-day diff: -6% to fatigued side', () => {
    const ctx = deriveRestDayContext({ homeRestDays: 8, awayRestDays: 4 });
    expect(ctx.awayXgMultiplier).toBeCloseTo(0.94, 4);
  });

  it('5-day diff: saturates at -9%', () => {
    const ctx = deriveRestDayContext({ homeRestDays: 9, awayRestDays: 4 });
    expect(ctx.awayXgMultiplier).toBeCloseTo(REST_MAX_PENALTY, 4);
  });

  it('10-day diff: still capped at -9%', () => {
    const ctx = deriveRestDayContext({ homeRestDays: 14, awayRestDays: 4 });
    expect(ctx.awayXgMultiplier).toBeCloseTo(REST_MAX_PENALTY, 4);
  });

  it('REVERSE: away more rested → home penalised', () => {
    const ctx = deriveRestDayContext({ homeRestDays: 3, awayRestDays: 8 });
    expect(ctx.differentialDays).toBe(-5);
    expect(ctx.homeXgMultiplier).toBeCloseTo(REST_MAX_PENALTY, 4);
    expect(ctx.awayXgMultiplier).toBe(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// applyRestDayToXg — math correctness
// ─────────────────────────────────────────────────────────────────────
describe('applyRestDayToXg', () => {
  it('home rested 4d, away rested 1d (diff=3) → away xG -3%', () => {
    const out = applyRestDayToXg(1.5, 1.5, { homeRestDays: 4, awayRestDays: 1 });
    expect(out.homeXg).toBeCloseTo(1.5, 4);
    expect(out.awayXg).toBeCloseTo(1.5 * 0.97, 4);
  });

  it('only the fatigued side is touched, never both', () => {
    const out = applyRestDayToXg(2.0, 1.5, { homeRestDays: 9, awayRestDays: 2 });
    // home is rested → unchanged
    expect(out.homeXg).toBe(2.0);
    // away is fatigued → penalised
    expect(out.awayXg).toBeLessThan(1.5);
  });

  it('symmetric: outputs commute via input swap (with flipped sides)', () => {
    const a = applyRestDayToXg(1.5, 1.2, { homeRestDays: 8, awayRestDays: 3 });
    const b = applyRestDayToXg(1.2, 1.5, { homeRestDays: 3, awayRestDays: 8 });
    expect(a.homeXg).toBeCloseTo(b.awayXg, 4);
    expect(a.awayXg).toBeCloseTo(b.homeXg, 4);
  });

  it('does not mutate input', () => {
    const fv = { homeRestDays: 8, awayRestDays: 2 };
    const snap = { ...fv };
    applyRestDayToXg(1.5, 1.5, fv);
    expect(fv).toEqual(snap);
  });

  it('property-based: output xG always positive and ≤ input xG', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.2, max: 4.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.2, max: 4.0, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: REST_MAX_PLAUSIBLE_DAYS }),
        fc.integer({ min: 0, max: REST_MAX_PLAUSIBLE_DAYS }),
        (h, a, hr, ar) => {
          const out = applyRestDayToXg(h, a, { homeRestDays: hr, awayRestDays: ar });
          return (
            out.homeXg > 0 && out.homeXg <= h + 1e-9
            && out.awayXg > 0 && out.awayXg <= a + 1e-9
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Flag interaction
// ─────────────────────────────────────────────────────────────────────
describe('rest-day flag interaction', () => {
  it('flag toggle ON-OFF-ON works', () => {
    const fv = { homeRestDays: 8, awayRestDays: 2 };
    expect(deriveRestDayContext(fv).isActive).toBe(true);
    setIntelligenceFlags({ rest_day: false });
    expect(deriveRestDayContext(fv).isActive).toBe(false);
    resetIntelligenceFlags();
    expect(deriveRestDayContext(fv).isActive).toBe(true);
  });

  it('toggling derby flag does NOT affect rest-day module', () => {
    const fv = { homeRestDays: 8, awayRestDays: 2 };
    setIntelligenceFlags({ derby: false });
    expect(deriveRestDayContext(fv).isActive).toBe(true);
  });
});
