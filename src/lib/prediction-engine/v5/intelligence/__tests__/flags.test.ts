// ═══════════════════════════════════════════════════════════════════════
// Intelligence feature flags — tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import {
  isIntelligenceEnabled,
  setIntelligenceFlags,
  resetIntelligenceFlags,
  withIntelligenceFlags,
  getActiveFlags,
} from '../flags';
import {
  computeDerbyIntensity,
  deriveDerbyContext,
  applyDerbyToXg,
} from '../derby';

// Always restore default state between tests so suite is order-independent.
afterEach(() => resetIntelligenceFlags());

describe('intelligence flags', () => {
  it('all modules default to ON', () => {
    const flags = getActiveFlags();
    expect(flags.derby).toBe(true);
    expect(flags.manager_debut).toBe(true);
    expect(flags.rest_day).toBe(true);
    expect(flags.late_season).toBe(true);
    expect(flags.weather_style).toBe(true);
  });

  it('isIntelligenceEnabled reflects active state', () => {
    expect(isIntelligenceEnabled('derby')).toBe(true);
    setIntelligenceFlags({ derby: false });
    expect(isIntelligenceEnabled('derby')).toBe(false);
  });

  it('setIntelligenceFlags returns previous state for manual restore', () => {
    const prev = setIntelligenceFlags({ derby: false });
    expect(prev.derby).toBe(true);
  });

  it('resetIntelligenceFlags restores defaults', () => {
    setIntelligenceFlags({ derby: false, manager_debut: false });
    resetIntelligenceFlags();
    expect(isIntelligenceEnabled('derby')).toBe(true);
    expect(isIntelligenceEnabled('manager_debut')).toBe(true);
  });

  it('withIntelligenceFlags is scoped + restores on exit', async () => {
    expect(isIntelligenceEnabled('derby')).toBe(true);
    await withIntelligenceFlags({ derby: false }, () => {
      expect(isIntelligenceEnabled('derby')).toBe(false);
    });
    expect(isIntelligenceEnabled('derby')).toBe(true);
  });

  it('withIntelligenceFlags restores even on throw', async () => {
    expect(isIntelligenceEnabled('derby')).toBe(true);
    await expect(
      withIntelligenceFlags({ derby: false }, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(isIntelligenceEnabled('derby')).toBe(true);
  });

  it('withIntelligenceFlags supports async work', async () => {
    const out = await withIntelligenceFlags({ derby: false }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return isIntelligenceEnabled('derby');
    });
    expect(out).toBe(false);
    expect(isIntelligenceEnabled('derby')).toBe(true);
  });
});

describe('derby module honours the kill switch', () => {
  const derbyFv = {
    isLocalDerby: true,
    h2hMatchesAvailable: 15,
    matchChaosScore: 0.7,
    travelDistanceKm: 5,
  };

  it('computeDerbyIntensity returns 0 when derby flag is OFF', () => {
    expect(computeDerbyIntensity(derbyFv)).toBeGreaterThan(0); // baseline
    setIntelligenceFlags({ derby: false });
    expect(computeDerbyIntensity(derbyFv)).toBe(0);
  });

  it('deriveDerbyContext returns no-op when flag OFF', () => {
    setIntelligenceFlags({ derby: false });
    const ctx = deriveDerbyContext(derbyFv);
    expect(ctx.isDerby).toBe(false);
    expect(ctx.xgDampener).toBe(1.0);
    expect(ctx.volatilityDelta).toBe(0);
  });

  it('applyDerbyToXg becomes identity when flag OFF', () => {
    setIntelligenceFlags({ derby: false });
    const out = applyDerbyToXg(1.5, 1.2, derbyFv);
    expect(out.homeXg).toBe(1.5);
    expect(out.awayXg).toBe(1.2);
  });

  it('withIntelligenceFlags scope: ON-OFF-ON behaviour', async () => {
    const onResult = applyDerbyToXg(1.5, 1.2, derbyFv);
    expect(onResult.homeXg).toBeLessThan(1.5);

    const offResult = await withIntelligenceFlags({ derby: false },
      () => applyDerbyToXg(1.5, 1.2, derbyFv));
    expect(offResult.homeXg).toBe(1.5);

    const onAgain = applyDerbyToXg(1.5, 1.2, derbyFv);
    expect(onAgain.homeXg).toBeLessThan(1.5);
  });
});
