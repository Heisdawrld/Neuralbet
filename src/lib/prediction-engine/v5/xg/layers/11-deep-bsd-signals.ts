// ═══════════════════════════════════════════════════════════════════════
// Layer 11: Deep BSD signals (the long-tail intelligence)
//
// Smaller-magnitude signals that BSD provides but few engines actually
// wire up:
//
//   1. CORE PLAYER GAP — the asymmetric strength of the starting XI's
//      most-important players. Wider gap → side with stronger core gets
//      asymmetric xG nudge (max ±3.5%).
//   2. CORE PLAYER RATING — additional rating-gap refinement (max ±2.5%).
//   3. REFEREE CHAOS — referees with high volatility scores tend to
//      produce more disrupted matches (cards, stoppages, lower xG
//      execution). Dampens both sides 1.5% when chaos ≥ 0.72.
//   4. REFEREE RED CARD WARNING — small ~1% dampener on both sides when
//      ref is flagged for high red-card propensity.
//   5. METADATA REASON CODES — narrative tags that BSD generates from
//      pre-match context (e.g., "scoring warning" for a team in a goal
//      drought, "derby context" for fixtures with extra physicality).
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum, type XgPair } from '../shared';

export const CORE_PLAYER_GAP_DIVISOR = 18;
export const CORE_PLAYER_GAP_CAP = 0.035;
export const CORE_PLAYER_GAP_THRESHOLD = 0.008;
export const CORE_RATING_GAP_DIVISOR = 35;
export const CORE_RATING_GAP_CAP = 0.025;
export const CORE_RATING_GAP_THRESHOLD = 0.008;

export const REF_CHAOS_THRESHOLD = 0.72;
export const REF_CHAOS_DAMPENER = 0.985;          // -1.5% xG when chaos ≥ threshold
export const REF_RED_CARD_DAMPENER = 0.99;        // -1% xG when red-card warning active

export const METADATA_GOALS_TREND_BOOST = 1.015;  // +1.5% when "goals trend" code present
export const METADATA_SCORING_WARNING_DAMPENER = 0.99;
export const METADATA_DERBY_DAMPENER = 0.99;

export function applyDeepBsdSignals(homeXg: number, awayXg: number, fv: any): XgPair {
  let h = homeXg, a = awayXg;

  // (1) + (2) Core player intel
  if (fv.hasDeepPlayerIntel) {
    const gap = clamp(safeNum(fv.corePlayerGap, 0) / CORE_PLAYER_GAP_DIVISOR,
                       -CORE_PLAYER_GAP_CAP, CORE_PLAYER_GAP_CAP);
    if (Math.abs(gap) >= CORE_PLAYER_GAP_THRESHOLD) {
      h *= (1 + gap);
      a *= (1 - gap);
    }
    const hRating = safeNum(fv.homeCoreAvgRating, 0);
    const aRating = safeNum(fv.awayCoreAvgRating, 0);
    if (hRating > 0 && aRating > 0) {
      const ratingGap = clamp((hRating - aRating) / CORE_RATING_GAP_DIVISOR,
                               -CORE_RATING_GAP_CAP, CORE_RATING_GAP_CAP);
      if (Math.abs(ratingGap) >= CORE_RATING_GAP_THRESHOLD) {
        h *= (1 + ratingGap);
        a *= (1 - ratingGap);
      }
    }
  }

  // (3) Referee chaos dampener
  if (safeNum(fv.refereeVolatilityChaos, 0) >= REF_CHAOS_THRESHOLD) {
    h *= REF_CHAOS_DAMPENER;
    a *= REF_CHAOS_DAMPENER;
  }

  // (4) Referee red-card warning
  if (fv.refereeRedCardWarning) {
    h *= REF_RED_CARD_DAMPENER;
    a *= REF_RED_CARD_DAMPENER;
  }

  // (5) Metadata reason codes
  const metadataCodes = Array.isArray(fv.metadataReasonCodes) ? fv.metadataReasonCodes : [];
  if (metadataCodes.includes('metadata_goals_trend')) {
    h *= METADATA_GOALS_TREND_BOOST;
    a *= METADATA_GOALS_TREND_BOOST;
  }
  if (metadataCodes.includes('metadata_scoring_warning')) {
    h *= METADATA_SCORING_WARNING_DAMPENER;
    a *= METADATA_SCORING_WARNING_DAMPENER;
  }
  if (metadataCodes.includes('metadata_derby_context')) {
    h *= METADATA_DERBY_DAMPENER;
    a *= METADATA_DERBY_DAMPENER;
  }

  return { homeXg: h, awayXg: a };
}
