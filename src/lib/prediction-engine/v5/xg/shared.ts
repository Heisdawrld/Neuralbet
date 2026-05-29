// ═══════════════════════════════════════════════════════════════════════
// Shared utilities + global xG constants
//
// Single source of truth for the numeric primitives used across every xG
// layer. Keep this file thin — anything that's only used by ONE layer
// should live in that layer's file, not here.
// ═══════════════════════════════════════════════════════════════════════

/** Coerce to a finite number, falling back to `fallback` for NaN/Infinity/undefined. */
export function safeNum(v: unknown, fallback: number = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Constrain a number to [min, max]. */
export function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(num, max));
}

/** Round to 3 dp — matches the precision the engine exposes externally. */
export function round3(num: number): number {
  return Math.round(num * 1000) / 1000;
}

// ─────────────────────────────────────────────────────────────────────
// GLOBAL xG CONSTANTS — used by multiple layers
// ─────────────────────────────────────────────────────────────────────

/**
 * Fallback when no league context is available. ~1.35 goals/team is the
 * long-run global average across the top European leagues weighted by
 * fixtures. Used in computeBaseXg + thin-data regression as a stable anchor.
 *
 * IMPORTANT: this should almost never fire in production — the FeatureVector
 * carries `leagueAvgGoalsPerTeam` for every fixture we predict. It exists
 * as a defence against malformed input.
 */
export const GLOBAL_LEAGUE_AVG = 1.35;

/**
 * Home advantage multiplier on home-side xG. ~10% home boost matches the
 * widely-cited 0.30-goal home edge in top European leagues. Neutral-ground
 * fixtures bypass this entirely (handled inside computeBaseXg).
 *
 * Citation: Pollard, R. (1986) "Home advantage in soccer", J. Sports Sci.
 */
export const HOME_ADV = 1.10;

// ─────────────────────────────────────────────────────────────────────
// SHARED TYPES — every layer is a pure (homeXg, awayXg, ...) → {homeXg, awayXg}
// ─────────────────────────────────────────────────────────────────────

export interface XgPair {
  homeXg: number;
  awayXg: number;
}
