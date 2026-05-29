// ═══════════════════════════════════════════════════════════════════════
// Layer 10: BSD intelligence signals
//
// Three rich BSD signals, each gated by a data-completeness weight so
// they only fire when we trust the underlying data:
//
//   1. xG TABLE — when BSD exposes per-team season xG-for / xG-against,
//      blend with our engine estimate. Weighted heavily (62% xG-for /
//      38% opponent xG-against) since xG is itself an xG signal — but
//      tempered by data completeness so a sparse season doesn't dominate.
//
//   2. MANAGER OVER/UNDER BIAS — BSD computes per-manager career over_2.5
//      and under_2.5 rates. We translate the gap into a small bilateral
//      xG nudge (both sides up or both sides down).
//
//   3. PLAYER STATS GAP — when we have ≥8 player rating samples, the
//      mean-rating gap and impact-score gap translate into a small
//      asymmetric nudge (one side up, the other down).
//
// All adjustments capped to ±6% per signal to prevent any single layer
// dominating the others.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum, type XgPair } from '../shared';

export const DATA_COMPLETENESS_FLOOR = 0.35;
export const DATA_COMPLETENESS_CEIL = 0.85;

// xG table sub-signals
export const XG_TABLE_BASE_WEIGHT = 0.18;
export const XG_TABLE_FOR_SHARE = 0.62;
export const XG_TABLE_AGAINST_SHARE = 0.38;
export const XG_TABLE_HOME_MIN = 0.45;
export const XG_TABLE_HOME_MAX = 2.70;
export const XG_TABLE_AWAY_MIN = 0.35;
export const XG_TABLE_AWAY_MAX = 2.50;
export const XG_TABLE_GAP_DIVISOR = 20;
export const XG_TABLE_GAP_CAP = 0.06;
export const XG_TABLE_GAP_THRESHOLD = 0.015;

// Manager bias sub-signals
export const MANAGER_TOTAL_BIAS_SCALE = 0.08;
export const MANAGER_TOTAL_BIAS_CAP_POS = 0.06;
export const MANAGER_TOTAL_BIAS_CAP_NEG = -0.05;
export const MANAGER_TOTAL_BIAS_THRESHOLD = 0.012;
export const MANAGER_ATTACK_GAP_SCALE = 0.05;
export const MANAGER_ATTACK_GAP_CAP = 0.04;
export const MANAGER_ATTACK_GAP_THRESHOLD = 0.012;

// Player stats sub-signals
export const PLAYER_STATS_MIN_SAMPLE = 8;
export const PLAYER_IMPACT_GAP_DIVISOR = 8;
export const PLAYER_IMPACT_GAP_CAP = 0.05;
export const PLAYER_IMPACT_GAP_THRESHOLD = 0.01;
export const PLAYER_RATING_GAP_DIVISOR = 20;
export const PLAYER_RATING_GAP_CAP = 0.035;
export const PLAYER_RATING_GAP_THRESHOLD = 0.01;

export function applyBsdIntelligenceAdjustments(homeXg: number, awayXg: number, fv: any): XgPair {
  let h = homeXg, a = awayXg;
  const weight = clamp(safeNum(fv.dataCompletenessScore, 0.5), DATA_COMPLETENESS_FLOOR, DATA_COMPLETENESS_CEIL);

  // ── (1) xG TABLE ────────────────────────────────────────────────────
  if (fv.hasXgTable) {
    const hFor = safeNum(fv.homeXgForPerGame, 0);
    const hAgainst = safeNum(fv.homeXgAgainstPerGame, 0);
    const aFor = safeNum(fv.awayXgForPerGame, 0);
    const aAgainst = safeNum(fv.awayXgAgainstPerGame, 0);

    if (hFor > 0 && aAgainst > 0) {
      const tableHome = clamp(hFor * XG_TABLE_FOR_SHARE + aAgainst * XG_TABLE_AGAINST_SHARE,
                              XG_TABLE_HOME_MIN, XG_TABLE_HOME_MAX);
      h = h * (1 - XG_TABLE_BASE_WEIGHT * weight) + tableHome * (XG_TABLE_BASE_WEIGHT * weight);
    }
    if (aFor > 0 && hAgainst > 0) {
      const tableAway = clamp(aFor * XG_TABLE_FOR_SHARE + hAgainst * XG_TABLE_AGAINST_SHARE,
                              XG_TABLE_AWAY_MIN, XG_TABLE_AWAY_MAX);
      a = a * (1 - XG_TABLE_BASE_WEIGHT * weight) + tableAway * (XG_TABLE_BASE_WEIGHT * weight);
    }

    const gap = clamp(safeNum(fv.xgTableGap, 0) / XG_TABLE_GAP_DIVISOR, -XG_TABLE_GAP_CAP, XG_TABLE_GAP_CAP);
    if (Math.abs(gap) >= XG_TABLE_GAP_THRESHOLD) {
      h *= (1 + gap);
      a *= (1 - gap);
    }
  }

  // ── (2) MANAGER BIAS ────────────────────────────────────────────────
  if (fv.hasManagerIntel) {
    const overBias = clamp(safeNum(fv.combinedManagerOverBias, 0), 0, 1);
    const underBias = clamp(safeNum(fv.combinedManagerUnderBias, 0), 0, 1);
    const totalBias = clamp((overBias - underBias) * MANAGER_TOTAL_BIAS_SCALE,
                             MANAGER_TOTAL_BIAS_CAP_NEG, MANAGER_TOTAL_BIAS_CAP_POS);
    if (Math.abs(totalBias) >= MANAGER_TOTAL_BIAS_THRESHOLD) {
      h *= (1 + totalBias);
      a *= (1 + totalBias);
    }
    const attackGap = clamp(safeNum(fv.managerAttackGap, 0) * MANAGER_ATTACK_GAP_SCALE,
                             -MANAGER_ATTACK_GAP_CAP, MANAGER_ATTACK_GAP_CAP);
    if (Math.abs(attackGap) >= MANAGER_ATTACK_GAP_THRESHOLD) {
      h *= (1 + attackGap);
      a *= (1 - attackGap);
    }
  }

  // ── (3) PLAYER STATS ────────────────────────────────────────────────
  if (fv.hasPlayerStats && safeNum(fv.playerStatsCount, 0) >= PLAYER_STATS_MIN_SAMPLE) {
    const impactGap = clamp(safeNum(fv.playerImpactGap, 0) / PLAYER_IMPACT_GAP_DIVISOR,
                             -PLAYER_IMPACT_GAP_CAP, PLAYER_IMPACT_GAP_CAP);
    if (Math.abs(impactGap) >= PLAYER_IMPACT_GAP_THRESHOLD) {
      h *= (1 + impactGap);
      a *= (1 - impactGap);
    }
    const hRating = safeNum(fv.homeAvgPlayerRating, 0);
    const aRating = safeNum(fv.awayAvgPlayerRating, 0);
    if (hRating > 0 && aRating > 0) {
      const ratingGap = clamp((hRating - aRating) / PLAYER_RATING_GAP_DIVISOR,
                               -PLAYER_RATING_GAP_CAP, PLAYER_RATING_GAP_CAP);
      if (Math.abs(ratingGap) >= PLAYER_RATING_GAP_THRESHOLD) {
        h *= (1 + ratingGap);
        a *= (1 - ratingGap);
      }
    }
  }

  return { homeXg: h, awayXg: a };
}
