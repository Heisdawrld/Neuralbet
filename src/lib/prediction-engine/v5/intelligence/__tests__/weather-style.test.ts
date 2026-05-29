// ═══════════════════════════════════════════════════════════════════════
// Weather × playing-style intelligence — tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  deriveWeatherStyleContext,
  applyWeatherStyleToXg,
  resolveTeamStyle,
  WEATHER_CODE,
  RAIN_PENALTY_BY_STYLE,
  HIGH_WIND_THRESHOLD_KMH,
  HIGH_WIND_PENALTY,
  EXTREME_HEAT_C,
  EXTREME_COLD_C,
  PRESSING_HEAT_PENALTY,
  STYLE_HEAT_PENALTY,
  COLD_PENALTY,
} from '../weather-style';
import { setIntelligenceFlags, resetIntelligenceFlags } from '../flags';

afterEach(() => resetIntelligenceFlags());

const possessionMgr = { team_style: 'possession' };
const pressingMgr = { team_style: 'pressing' };
const counterMgr = { team_style: 'counter' };
const directMgr = { team_style: 'direct' };

// ─────────────────────────────────────────────────────────────────────
// resolveTeamStyle
// ─────────────────────────────────────────────────────────────────────
describe('resolveTeamStyle', () => {
  it('uses direct team_style when present', () => {
    expect(resolveTeamStyle({ team_style: 'possession' })).toBe('possession');
    expect(resolveTeamStyle({ team_style: 'counter' })).toBe('counter');
  });
  it('falls back to tactical_styles[] keyword sniffing', () => {
    expect(resolveTeamStyle({ tactical_styles: [{ code: 'GEGENPRESS', name: 'Gegenpressing' }] })).toBe('pressing');
    expect(resolveTeamStyle({ tactical_styles: [{ code: 'POS', name: 'Positional play' }] })).toBe('possession');
    expect(resolveTeamStyle({ tactical_styles: [{ code: 'PTB', name: 'Park the bus' }] })).toBe('defensive');
  });
  it('returns "unknown" when nothing matches', () => {
    expect(resolveTeamStyle({ team_style: 'something_new' })).toBe('unknown');
    expect(resolveTeamStyle({})).toBe('unknown');
    expect(resolveTeamStyle(null)).toBe('unknown');
    expect(resolveTeamStyle(undefined)).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────
// No-op contract
// ─────────────────────────────────────────────────────────────────────
describe('weather-style — no-op contract', () => {
  it('flag OFF → identity', () => {
    setIntelligenceFlags({ weather_style: false });
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.RAIN,
      homeManager: possessionMgr, awayManager: counterMgr,
    });
    expect(ctx.isActive).toBe(false);
  });

  it('CLEAR weather + no wind/temp signals → identity', () => {
    expect(deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLEAR,
      homeManager: possessionMgr, awayManager: counterMgr,
    }).isActive).toBe(false);
  });

  it('CLOUDY weather → identity (not "wet")', () => {
    expect(deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLOUDY,
    }).isActive).toBe(false);
  });

  it('UNKNOWN weather + no other signals → identity', () => {
    expect(deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.UNKNOWN,
    }).isActive).toBe(false);
  });

  it('null fv → identity', () => {
    expect(deriveWeatherStyleContext(null).isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Rain × style interaction (the headline feature)
// ─────────────────────────────────────────────────────────────────────
describe('rain × style interaction', () => {
  it('possession team in rain: -12% (vs counter team -3%)', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.RAIN,
      homeManager: possessionMgr, awayManager: counterMgr,
    });
    expect(ctx.isActive).toBe(true);
    expect(ctx.homeXgMultiplier).toBe(RAIN_PENALTY_BY_STYLE.possession);
    expect(ctx.awayXgMultiplier).toBe(RAIN_PENALTY_BY_STYLE.counter);
  });

  it('pressing team in rain: -8%', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.RAIN,
      homeManager: pressingMgr,
    });
    expect(ctx.homeXgMultiplier).toBe(RAIN_PENALTY_BY_STYLE.pressing);
  });

  it('direct + counter: small dampener (matches research — direct play unaffected by wet)', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.RAIN,
      homeManager: directMgr, awayManager: counterMgr,
    });
    expect(ctx.homeXgMultiplier).toBe(RAIN_PENALTY_BY_STYLE.direct);
    expect(ctx.awayXgMultiplier).toBe(RAIN_PENALTY_BY_STYLE.counter);
  });

  it('unknown style in rain: legacy -5% default', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.RAIN,
    });
    expect(ctx.homeXgMultiplier).toBe(RAIN_PENALTY_BY_STYLE.unknown);
    expect(ctx.awayXgMultiplier).toBe(RAIN_PENALTY_BY_STYLE.unknown);
  });

  it('snow + extreme are treated as wet', () => {
    expect(deriveWeatherStyleContext({ weatherCode: WEATHER_CODE.SNOW }).isActive).toBe(true);
    expect(deriveWeatherStyleContext({ weatherCode: WEATHER_CODE.EXTREME }).isActive).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Wind
// ─────────────────────────────────────────────────────────────────────
describe('high wind', () => {
  it('wind ≥ threshold → -5% both sides', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLEAR,
      weatherWindSpeedKmh: HIGH_WIND_THRESHOLD_KMH + 5,
    });
    expect(ctx.isActive).toBe(true);
    expect(ctx.homeXgMultiplier).toBeCloseTo(HIGH_WIND_PENALTY, 4);
    expect(ctx.awayXgMultiplier).toBeCloseTo(HIGH_WIND_PENALTY, 4);
    expect(ctx.conditionsTriggered.some((c) => c.startsWith('wind_'))).toBe(true);
  });

  it('wind below threshold → no wind penalty', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLEAR,
      weatherWindSpeedKmh: HIGH_WIND_THRESHOLD_KMH - 5,
    });
    expect(ctx.isActive).toBe(false);
  });

  it('wind stacks multiplicatively with rain', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.RAIN,
      weatherWindSpeedKmh: HIGH_WIND_THRESHOLD_KMH + 10,
      homeManager: possessionMgr,
    });
    // possession rain (0.88) × wind (0.95) ≈ 0.836
    expect(ctx.homeXgMultiplier).toBeCloseTo(RAIN_PENALTY_BY_STYLE.possession * HIGH_WIND_PENALTY, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Heat
// ─────────────────────────────────────────────────────────────────────
describe('extreme heat', () => {
  it('pressing team in 32°C → -8%', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLEAR,
      weatherTemperatureC: 32,
      homeManager: pressingMgr,
    });
    expect(ctx.homeXgMultiplier).toBeCloseTo(PRESSING_HEAT_PENALTY, 4);
  });
  it('non-pressing team in 32°C → -2%', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLEAR,
      weatherTemperatureC: 32,
      homeManager: counterMgr,
    });
    expect(ctx.homeXgMultiplier).toBeCloseTo(STYLE_HEAT_PENALTY, 4);
  });
  it('25°C: no heat penalty', () => {
    expect(deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLEAR,
      weatherTemperatureC: 25,
    }).isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cold
// ─────────────────────────────────────────────────────────────────────
describe('extreme cold', () => {
  it('-10°C → -4% both sides', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLEAR,
      weatherTemperatureC: -10,
    });
    expect(ctx.homeXgMultiplier).toBeCloseTo(COLD_PENALTY, 4);
    expect(ctx.awayXgMultiplier).toBeCloseTo(COLD_PENALTY, 4);
  });
  it('0°C: no cold penalty', () => {
    expect(deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.CLEAR,
      weatherTemperatureC: 0,
    }).isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// applyWeatherStyleToXg
// ─────────────────────────────────────────────────────────────────────
describe('applyWeatherStyleToXg', () => {
  it('identity when no conditions trigger', () => {
    const out = applyWeatherStyleToXg(1.5, 1.2, { weatherCode: WEATHER_CODE.CLEAR });
    expect(out).toEqual({ homeXg: 1.5, awayXg: 1.2 });
  });

  it('rain + possession matchup: lifts opponent edge', () => {
    // 1.5 vs 1.5 baseline. Home plays possession, away plays counter, in rain.
    // Result: home xG drops more than away xG → away gets a relative edge.
    const out = applyWeatherStyleToXg(1.5, 1.5, {
      weatherCode: WEATHER_CODE.RAIN,
      homeManager: possessionMgr,
      awayManager: counterMgr,
    });
    expect(out.homeXg).toBeLessThan(out.awayXg);
  });

  it('does not mutate input', () => {
    const fv = { weatherCode: WEATHER_CODE.RAIN, homeManager: possessionMgr };
    const snap = JSON.stringify(fv);
    applyWeatherStyleToXg(1.5, 1.5, fv);
    expect(JSON.stringify(fv)).toBe(snap);
  });

  it('property-based: xG always > 0 and ≤ input × 1.0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.3, max: 4.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.3, max: 4.0, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 5 }),
        fc.double({ min: 0, max: 80, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -20, max: 40, noNaN: true, noDefaultInfinity: true }),
        (h, a, code, wind, temp) => {
          const out = applyWeatherStyleToXg(h, a, {
            weatherCode: code, weatherWindSpeedKmh: wind, weatherTemperatureC: temp,
            homeManager: possessionMgr, awayManager: counterMgr,
          });
          return out.homeXg > 0 && out.homeXg <= h + 1e-9
              && out.awayXg > 0 && out.awayXg <= a + 1e-9;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Compound conditions
// ─────────────────────────────────────────────────────────────────────
describe('compound weather conditions', () => {
  it('rain + wind + heat all stack', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.RAIN,
      weatherWindSpeedKmh: 45,
      weatherTemperatureC: 31,
      homeManager: pressingMgr,
    });
    expect(ctx.conditionsTriggered.length).toBe(3);
    // pressing rain (0.92) × wind (0.95) × pressing heat (0.92)
    const expected = RAIN_PENALTY_BY_STYLE.pressing * HIGH_WIND_PENALTY * PRESSING_HEAT_PENALTY;
    expect(ctx.homeXgMultiplier).toBeCloseTo(expected, 4);
  });

  it('all conditions emit named tags', () => {
    const ctx = deriveWeatherStyleContext({
      weatherCode: WEATHER_CODE.RAIN,
      weatherWindSpeedKmh: 50,
      weatherTemperatureC: -10,
    });
    expect(ctx.conditionsTriggered).toContain('wet_3');
    expect(ctx.conditionsTriggered.some((t) => t.startsWith('wind_'))).toBe(true);
    expect(ctx.conditionsTriggered.some((t) => t.startsWith('cold_'))).toBe(true);
  });
});
