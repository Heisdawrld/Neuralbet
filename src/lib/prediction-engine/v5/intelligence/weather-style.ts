// ═══════════════════════════════════════════════════════════════════════
// Intelligence: Weather × playing-style interaction
//
// THE EFFECT — football's most overlooked tactical wrinkle.
// Weather is a much bigger predictor when you cross it with HOW each
// team plays. A flat "rain = -5% goals" misses the point — it depends
// on WHICH team gets disrupted.
//
// MECHANICS
//
//   RAIN / WET CONDITIONS (weather_code ∈ {3, 4, 5})
//     - Possession teams: -12% xG (passing through wet pitch is hard)
//     - Pressing teams:    -8% xG (timing of press affected by surface)
//     - Direct / counter:  -3% xG (long balls + transitions work fine)
//     - Unknown style:    -5% xG (legacy default, kept as fallback)
//
//   HIGH WIND (weather_wind_speed >= 40 km/h, ~22 mph)
//     - Both sides:        -5% xG (long shots + crosses degrade for everyone)
//     - Stacks with rain (multiplicative)
//
//   EXTREME HEAT (temperature_c >= 30)
//     - Pressing teams:    -8% xG (pressing burns energy)
//     - Other styles:      -2% xG (general slowdown)
//
//   EXTREME COLD (temperature_c <= -5)
//     - Both sides:        -4% xG (ball + boots harder)
//
// Each adjustment is independent → final xG can stack ALL of them
// multiplicatively when multiple conditions hit (e.g. wet + windy +
// pressing-vs-possession matchup).
//
// FAIL-SAFE: returns identity context when any weather signal is missing
// or out of plausible range. Never throws.
//
// WHY THIS MATTERS MORE THAN THE LEGACY DAMPENER
// The legacy Layer 12 applied -5% on both sides equally for any "bad
// weather". But weather creates ASYMMETRY — a Pep team dropping points
// in the rain because they can't pass is a real, repeatable signal.
// Capturing it lifts the engine's edge on rainy matches where the
// opposing team is direct/counter-style.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import { isIntelligenceEnabled } from './flags';
import type { ManagerProfile } from '../types';

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS — weather classification + per-style multipliers
// ─────────────────────────────────────────────────────────────────────

/** BSD weather_code values. See https://sports.bzzoiro.com/docs/v2/#weather-codes */
export const WEATHER_CODE = {
  UNKNOWN: 0,
  CLEAR: 1,
  CLOUDY: 2,
  RAIN: 3,
  SNOW: 4,
  EXTREME: 5,
} as const;

/** Codes treated as "wet" (rain / snow / extreme storms). */
export const WET_WEATHER_CODES = new Set<number>([
  WEATHER_CODE.RAIN, WEATHER_CODE.SNOW, WEATHER_CODE.EXTREME,
]);

/** Per playing-style rain dampener (multiplier on xG). */
export const RAIN_PENALTY_BY_STYLE = {
  possession: 0.88,   // -12%
  pressing:   0.92,   // -8%
  direct:     0.97,   // -3%
  counter:    0.97,   // -3%
  defensive:  0.95,   // -5%
  wide:       0.93,   // -7%
  fan:        0.95,   // -5% (catch-all)
  unknown:    0.95,   // -5% (legacy default)
} as const;

/** Wind speed (km/h) threshold for high-wind penalty. */
export const HIGH_WIND_THRESHOLD_KMH = 40;
export const HIGH_WIND_PENALTY = 0.95; // -5% both sides

/** Temperature thresholds (Celsius). */
export const EXTREME_HEAT_C = 30;
export const EXTREME_COLD_C = -5;
export const PRESSING_HEAT_PENALTY = 0.92; // -8% to pressing teams
export const STYLE_HEAT_PENALTY = 0.98;    // -2% to other styles
export const COLD_PENALTY = 0.96;          // -4% both sides

// ─────────────────────────────────────────────────────────────────────
// STYLE INFERENCE
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve a manager's playing-style key.
 * Looks at `team_style` field (BSD's canonical tag) first, falls back
 * to tactical_styles[] keyword sniffing if team_style is missing.
 * Returns 'unknown' when nothing matches.
 */
export function resolveTeamStyle(manager: ManagerProfile | undefined | null): keyof typeof RAIN_PENALTY_BY_STYLE {
  if (!manager) return 'unknown';

  const direct = String(manager.team_style || '').toLowerCase().trim();
  if (direct in RAIN_PENALTY_BY_STYLE) {
    return direct as keyof typeof RAIN_PENALTY_BY_STYLE;
  }

  // Sniff across BOTH code and name — BSD's code values are often abbrevs
  // ('POS' for positional) so name field is where the meaningful keyword
  // usually lives.
  const styles = Array.isArray(manager.tactical_styles)
    ? manager.tactical_styles.map((s) => `${s.code ?? ''} ${s.name ?? ''}`).join(' ').toLowerCase()
    : '';

  if (styles.includes('possession') || styles.includes('positional')) return 'possession';
  if (styles.includes('gegenpress') || styles.includes('pressing')) return 'pressing';
  if (styles.includes('direct') || styles.includes('counter')) return 'counter';
  if (styles.includes('defensive') || styles.includes('low block') || styles.includes('park the bus')) return 'defensive';
  if (styles.includes('wide')) return 'wide';

  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────

export interface WeatherStyleContext {
  isActive: boolean;
  /** Which conditions fired (for logging / UI explanations). */
  conditionsTriggered: string[];
  homeXgMultiplier: number;
  awayXgMultiplier: number;
}

/**
 * Compute per-side xG multipliers from weather × style interactions.
 *
 * Reads from feature vector:
 *   - weatherCode (number) — BSD weather classification
 *   - weatherWindSpeedKmh (number, optional)
 *   - weatherTemperatureC (number, optional)
 *   - homeManager (ManagerProfile, optional)
 *   - awayManager (ManagerProfile, optional)
 */
export function deriveWeatherStyleContext(fv: any): WeatherStyleContext {
  const noop: WeatherStyleContext = {
    isActive: false,
    conditionsTriggered: [],
    homeXgMultiplier: 1.0,
    awayXgMultiplier: 1.0,
  };

  if (!isIntelligenceEnabled('weather_style')) return noop;
  if (fv == null) return noop;

  const weatherCode = safeNum(fv.weatherCode, -1);
  const windKmh = fv.weatherWindSpeedKmh != null ? safeNum(fv.weatherWindSpeedKmh, -1) : -1;
  const tempC = fv.weatherTemperatureC != null ? safeNum(fv.weatherTemperatureC, NaN) : NaN;

  const homeStyle = resolveTeamStyle(fv.homeManager);
  const awayStyle = resolveTeamStyle(fv.awayManager);

  let homeMult = 1.0;
  let awayMult = 1.0;
  const triggered: string[] = [];

  // ── RAIN / WET conditions ──
  if (weatherCode >= 0 && WET_WEATHER_CODES.has(weatherCode)) {
    homeMult *= RAIN_PENALTY_BY_STYLE[homeStyle];
    awayMult *= RAIN_PENALTY_BY_STYLE[awayStyle];
    triggered.push(`wet_${weatherCode}`);
  }

  // ── HIGH WIND ──
  if (windKmh >= HIGH_WIND_THRESHOLD_KMH) {
    homeMult *= HIGH_WIND_PENALTY;
    awayMult *= HIGH_WIND_PENALTY;
    triggered.push(`wind_${Math.round(windKmh)}kmh`);
  }

  // ── EXTREME HEAT ──
  if (Number.isFinite(tempC) && tempC >= EXTREME_HEAT_C) {
    homeMult *= homeStyle === 'pressing' ? PRESSING_HEAT_PENALTY : STYLE_HEAT_PENALTY;
    awayMult *= awayStyle === 'pressing' ? PRESSING_HEAT_PENALTY : STYLE_HEAT_PENALTY;
    triggered.push(`heat_${Math.round(tempC)}c`);
  }

  // ── EXTREME COLD ──
  if (Number.isFinite(tempC) && tempC <= EXTREME_COLD_C) {
    homeMult *= COLD_PENALTY;
    awayMult *= COLD_PENALTY;
    triggered.push(`cold_${Math.round(tempC)}c`);
  }

  if (triggered.length === 0) return noop;

  return {
    isActive: true,
    conditionsTriggered: triggered,
    homeXgMultiplier: homeMult,
    awayXgMultiplier: awayMult,
  };
}

/**
 * Apply weather × style adjustments to an xG pair.
 * Pure: returns new {homeXg, awayXg}, does not mutate inputs.
 */
export function applyWeatherStyleToXg(
  homeXg: number, awayXg: number, fv: any,
): { homeXg: number; awayXg: number } {
  const ctx = deriveWeatherStyleContext(fv);
  if (!ctx.isActive) return { homeXg, awayXg };
  return {
    homeXg: homeXg * ctx.homeXgMultiplier,
    awayXg: awayXg * ctx.awayXgMultiplier,
  };
}
