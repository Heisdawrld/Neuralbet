// ═══════════════════════════════════════════════════════════════════════
// Layer 6: Bookmaker over/under 2.5 odds anchor
//
// Even the best model is noisy on a per-fixture basis. The bookmaker
// over/under 2.5 line aggregates the entire market's view of expected
// goals. We blend our total xG with the bookmaker-implied total xG.
//
// Implied total xG from over_2.5 probability:
//   λ_total = max(1.2, -2.1 × ln(1 - P(over_2.5)))
//
// This formula inverts the Poisson CDF approximation for two-sided totals
// — at P=0.50 → λ≈1.46; at P=0.75 → λ≈2.91. It's a reasonable mapping
// that doesn't require integrating the Poisson directly.
//
// We weight 65% to our model / 35% to the bookmaker — same philosophy as
// the calibration layer: we trust our engine more than the line, but
// only a fool ignores the market entirely.
//
// Safety: extreme implied probabilities (<5% or >95%) are likely
// stale/incorrect prices and are IGNORED entirely. The scale factor is
// also clamped to [0.78, 1.25] so even a wildly mispriced market can't
// blow up the xG estimate.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum, type XgPair } from '../shared';

export const ODDS_MODEL_WEIGHT = 0.65;
export const ODDS_MARKET_WEIGHT = 0.35;
export const ODDS_IMPLIED_FLOOR = 0.05;   // ignore if implied < 5%
export const ODDS_IMPLIED_CEIL = 0.95;    // ignore if implied > 95%
export const ODDS_IMPLIED_MIN_TOTAL_XG = 1.2;
export const ODDS_SCALE_MIN = 0.78;
export const ODDS_SCALE_MAX = 1.25;

/** Invert P(over 2.5) → implied total expected goals via log approximation. */
export function impliedTotalXg(impliedOver25: number): number {
  return Math.max(ODDS_IMPLIED_MIN_TOTAL_XG, -2.1 * Math.log(Math.max(0.01, 1 - impliedOver25)));
}

export function applyOddsAnchor(homeXg: number, awayXg: number, fv: any): XgPair {
  const impl = fv.impliedOver25 != null ? safeNum(fv.impliedOver25) : null;
  if (impl == null || impl <= ODDS_IMPLIED_FLOOR || impl >= ODDS_IMPLIED_CEIL) {
    return { homeXg, awayXg };
  }
  const implTotal = impliedTotalXg(impl);
  const engTotal = homeXg + awayXg;
  const blended = engTotal * ODDS_MODEL_WEIGHT + implTotal * ODDS_MARKET_WEIGHT;
  const scale = clamp(blended / Math.max(0.5, engTotal), ODDS_SCALE_MIN, ODDS_SCALE_MAX);
  return { homeXg: homeXg * scale, awayXg: awayXg * scale };
}
