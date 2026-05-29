// ═══════════════════════════════════════════════════════════════════════
// Intelligence: Rest-day asymmetry
//
// THE EFFECT — well-documented across football analytics literature:
// when one team has had significantly more rest than the other before
// kickoff, the rested side gains a meaningful xG advantage. Drivers:
//   - Physical recovery (muscle fatigue, sleep debt, travel hangover)
//   - More training time → tactical sharpness
//   - Squad rotation flexibility for the rested side
//
// Research consensus: ~3-day rest advantage → ~3-6% xG bump for the
// rested side. ≥5-day advantage saturates around 9-10% (more rest
// doesn't help indefinitely — peak around match-fitness day).
//
// CRITICAL — this is ASYMMETRIC. We do NOT bump the rested side's xG up;
// we PENALISE the fatigued side. Reason: the rested side's xG is already
// estimated from their recent form / training context. The fatigued side
// is the one likely to under-perform their baseline.
//
// INPUTS (feature-vector fields the feature-builder must populate):
//   homeRestDays:  days since the home team's previous finished match.
//                  null when unknown (e.g. team has no prior match in DB
//                  → engine assumes no asymmetry — fail-safe).
//   awayRestDays:  same for the away team.
//
// SCALING (penalty applied to the LESS-rested side's xG)
//   differential 0-2 days:  no effect (within noise)
//   differential 3 days:    -3%
//   differential 4 days:    -6%
//   differential 5+ days:   -9% (saturates)
//
// HARD GUARDS
//   - Both restDays must be present (non-null) and ≥ 0
//   - Both must be ≤ 30 days (otherwise it's "returning from break" not
//     "extra rest" — different signal we don't model yet)
//   - When restDays are equal, no-op
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import { isIntelligenceEnabled } from './flags';

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────

/** Below this differential, no penalty (noise zone). */
export const REST_DIFF_MIN_TRIGGER_DAYS = 3;

/** Penalty schedule — keyed by absolute differential days.
 *  Penalty is a MULTIPLIER on the fatigued side's xG. */
export const REST_PENALTY_BY_DIFF: readonly { diff: number; penalty: number }[] = [
  { diff: 3, penalty: 0.97 }, // -3%
  { diff: 4, penalty: 0.94 }, // -6%
  { diff: 5, penalty: 0.91 }, // -9% (saturates here)
];

/** Maximum penalty (applied for differential >= 5 days). */
export const REST_MAX_PENALTY = 0.91;

/** Max plausible rest window. Beyond this, signal is "returning from
 *  break" (different effect) — we no-op rather than misapply. */
export const REST_MAX_PLAUSIBLE_DAYS = 30;

// ─────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────

export interface RestDayContext {
  isActive: boolean;
  /** Differential = home rest days - away rest days. Positive → home more rested. */
  differentialDays: number;
  /** Multiplier on home xG (= 1.0 when home is the more-rested side). */
  homeXgMultiplier: number;
  /** Multiplier on away xG (= 1.0 when away is the more-rested side). */
  awayXgMultiplier: number;
}

/** Map an absolute differential → penalty multiplier. */
function penaltyForDifferential(absDiff: number): number {
  if (absDiff < REST_DIFF_MIN_TRIGGER_DAYS) return 1.0;
  if (absDiff >= 5) return REST_MAX_PENALTY;
  // Look up exact step
  const exact = REST_PENALTY_BY_DIFF.find((p) => p.diff === absDiff);
  return exact ? exact.penalty : REST_MAX_PENALTY;
}

/**
 * Compute the rest-day context for a fixture.
 * Returns a no-op context when:
 *   - flag is OFF
 *   - either restDays is missing / non-finite / negative
 *   - either restDays exceeds REST_MAX_PLAUSIBLE_DAYS
 *   - differential is below trigger threshold
 */
export function deriveRestDayContext(fv: any): RestDayContext {
  const noop: RestDayContext = {
    isActive: false,
    differentialDays: 0,
    homeXgMultiplier: 1.0,
    awayXgMultiplier: 1.0,
  };

  if (!isIntelligenceEnabled('rest_day')) return noop;
  if (fv == null) return noop;

  const homeRest = fv.homeRestDays;
  const awayRest = fv.awayRestDays;
  if (homeRest == null || awayRest == null) return noop;

  const h = safeNum(homeRest, -1);
  const a = safeNum(awayRest, -1);
  if (h < 0 || a < 0) return noop;
  if (h > REST_MAX_PLAUSIBLE_DAYS || a > REST_MAX_PLAUSIBLE_DAYS) return noop;

  const diff = h - a;
  const absDiff = Math.abs(diff);
  if (absDiff < REST_DIFF_MIN_TRIGGER_DAYS) return noop;

  const penalty = penaltyForDifferential(absDiff);

  // Penalty applies to the LESS rested side.
  // diff > 0 → home is more rested → away is fatigued → penalise away
  // diff < 0 → away is more rested → home is fatigued → penalise home
  return {
    isActive: true,
    differentialDays: diff,
    homeXgMultiplier: diff < 0 ? penalty : 1.0,
    awayXgMultiplier: diff > 0 ? penalty : 1.0,
  };
}

/**
 * Apply rest-day asymmetry penalty to an xG pair.
 * Pure: returns new {homeXg, awayXg}, does not mutate inputs.
 */
export function applyRestDayToXg(homeXg: number, awayXg: number, fv: any): { homeXg: number; awayXg: number } {
  const ctx = deriveRestDayContext(fv);
  if (!ctx.isActive) return { homeXg, awayXg };
  return {
    homeXg: homeXg * ctx.homeXgMultiplier,
    awayXg: awayXg * ctx.awayXgMultiplier,
  };
}
