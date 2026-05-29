// ═══════════════════════════════════════════════════════════════════════
// Intelligence: Derby refinement
//
// Research-backed observations on local derby matches:
//
//   1. GOALS DOWN ~10-15% on average. The legacy engine only applied
//      a flat -3% dampener (too gentle). We push to ~8% baseline with
//      intensity-aware scaling up to 14% for the fiercest rivalries.
//
//   2. SCRIPT bias toward tight_low_event. Even teams that play wide-open
//      football in normal fixtures tighten up in derbies. Coaches don't
//      want to be the one who lost THIS one. Engine should know.
//
//   3. VOLATILITY UP. Derbies are more upset-prone — the underdog wins
//      ~+5% more often than form suggests. Engine should be humbler →
//      more abstains, fewer bad picks.
//
//   4. BTTS slight UP. Counter-intuitive but matches data: high-tension
//      matches with mistakes + cards → fewer total goals but more often
//      both teams find one.
//
//   5. CARDS UP. Not priced today but BSD has referee data — when we
//      ship a cards market, derby will be a primary signal.
//
// INTENSITY SCALING
//
// We use signals already in the FeatureVector to estimate derby intensity:
//   - h2hMatchesAvailable: more historical meetings = older rivalry
//   - matchChaosScore: pre-existing chaos signal correlates with intensity
//   - travelDistanceKm: 0km local + frequent meeting = fierce
//
// Output: a derbyIntensity score in [0, 1] that scales the adjustments.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum } from '../xg/shared';
import { isIntelligenceEnabled } from './flags';

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────

/** xG dampener baseline for a generic derby (low intensity). */
export const DERBY_BASE_XG_DAMPENER = 0.92; // -8%

/** Additional dampener at maximum intensity (multiplies on top of base). */
export const DERBY_MAX_EXTRA_DAMPENER = 0.94; // worst case: 0.92 * 0.94 ≈ -13.5%

/** Volatility score added to the engine's matchChaosScore for derbies. */
export const DERBY_VOLATILITY_BOOST = 0.12;

/** Volatility cap — never push chaos above this. */
export const VOLATILITY_CEIL = 0.95;

/** Small upward tilt to bttsYes when derby is detected. */
export const DERBY_BTTS_TILT = 0.03;

/** Intensity scoring weights (sum determines derbyIntensity ∈ [0,1]). */
export const INTENSITY_H2H_WEIGHT = 0.4;      // older rivalry → more intense
export const INTENSITY_CHAOS_WEIGHT = 0.3;     // pre-existing chaos hint
export const INTENSITY_PROXIMITY_WEIGHT = 0.3; // 0km local = max intensity

/** H2H sample size where derby intensity saturates (e.g. ≥10 meetings = full historic rivalry). */
export const INTENSITY_H2H_SATURATION = 10;

/** Travel distance threshold where proximity contribution starts dropping. */
export const INTENSITY_PROXIMITY_FULL_KM = 30; // up to 30km → full proximity
export const INTENSITY_PROXIMITY_ZERO_KM = 250; // beyond 250km → no proximity boost

// ─────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────

export interface DerbyContext {
  isDerby: boolean;
  intensity: number;        // 0-1: 0 = soft derby, 1 = fierce historic rivalry
  xgDampener: number;       // multiplier for both home and away xG
  volatilityDelta: number;  // amount to ADD to matchChaosScore
  bttsTilt: number;         // amount to ADD to bttsYes probability
}

/**
 * Compute proximity sub-score from travel distance.
 * 0km → 1.0 (max); INTENSITY_PROXIMITY_FULL_KM → 1.0;
 * INTENSITY_PROXIMITY_ZERO_KM → 0.0; linear in between.
 */
function proximityScore(travelKm: number): number {
  if (travelKm <= INTENSITY_PROXIMITY_FULL_KM) return 1.0;
  if (travelKm >= INTENSITY_PROXIMITY_ZERO_KM) return 0.0;
  const range = INTENSITY_PROXIMITY_ZERO_KM - INTENSITY_PROXIMITY_FULL_KM;
  return 1.0 - (travelKm - INTENSITY_PROXIMITY_FULL_KM) / range;
}

/**
 * Compute derby intensity ∈ [0, 1] from feature vector signals.
 * Returns 0 when fv.isLocalDerby is false.
 */
export function computeDerbyIntensity(fv: any): number {
  if (!isIntelligenceEnabled('derby') || !fv?.isLocalDerby) return 0;

  const h2hCount = safeNum(fv.h2hMatchesAvailable, 0);
  const chaos = safeNum(fv.matchChaosScore, 0.5);
  const travelKm = safeNum(fv.travelDistanceKm, INTENSITY_PROXIMITY_ZERO_KM);

  const h2hScore = clamp(h2hCount / INTENSITY_H2H_SATURATION, 0, 1);
  const chaosScore = clamp(chaos, 0, 1);
  const proxScore = proximityScore(travelKm);

  return clamp(
    INTENSITY_H2H_WEIGHT * h2hScore
    + INTENSITY_CHAOS_WEIGHT * chaosScore
    + INTENSITY_PROXIMITY_WEIGHT * proxScore,
    0, 1,
  );
}

/**
 * Produce all derby-aware adjustments for a feature vector.
 * Returns a no-op context when isLocalDerby is false.
 */
export function deriveDerbyContext(fv: any): DerbyContext {
  // Module-level kill switch (backtest ablation). When OFF, return no-op
  // context so applyDerbyToXg/Volatility/Probs all become identity.
  if (!isIntelligenceEnabled('derby') || !fv?.isLocalDerby) {
    return {
      isDerby: false,
      intensity: 0,
      xgDampener: 1.0,
      volatilityDelta: 0,
      bttsTilt: 0,
    };
  }

  const intensity = computeDerbyIntensity(fv);

  // xG dampener: starts at DERBY_BASE_XG_DAMPENER, scales further down by intensity.
  // At intensity=0: full dampener = DERBY_BASE_XG_DAMPENER (-8%).
  // At intensity=1: dampener = DERBY_BASE_XG_DAMPENER × DERBY_MAX_EXTRA_DAMPENER (≈ -13.5%).
  const extraScale = 1 - (1 - DERBY_MAX_EXTRA_DAMPENER) * intensity;
  const xgDampener = DERBY_BASE_XG_DAMPENER * extraScale;

  return {
    isDerby: true,
    intensity,
    xgDampener,
    volatilityDelta: DERBY_VOLATILITY_BOOST * intensity,
    bttsTilt: DERBY_BTTS_TILT * intensity,
  };
}

/**
 * Apply derby xG dampener to a (home, away) xG pair.
 * Pure: returns new {homeXg, awayXg}, does not mutate inputs.
 */
export function applyDerbyToXg(homeXg: number, awayXg: number, fv: any): { homeXg: number; awayXg: number } {
  const ctx = deriveDerbyContext(fv);
  if (!ctx.isDerby) return { homeXg, awayXg };
  return {
    homeXg: homeXg * ctx.xgDampener,
    awayXg: awayXg * ctx.xgDampener,
  };
}

/**
 * Apply derby volatility boost to the feature vector's matchChaosScore.
 * Returns the boosted value (capped at VOLATILITY_CEIL); does not mutate fv.
 */
export function applyDerbyToVolatility(fv: any): number {
  const baseChaos = safeNum(fv?.matchChaosScore, 0.5);
  const ctx = deriveDerbyContext(fv);
  return clamp(baseChaos + ctx.volatilityDelta, 0, VOLATILITY_CEIL);
}

/**
 * Apply derby BTTS tilt to a calibrated probability map.
 * Returns a new map (does not mutate input).
 */
export function applyDerbyToProbs(
  probs: Record<string, number>,
  fv: any,
): Record<string, number> {
  const ctx = deriveDerbyContext(fv);
  if (!ctx.isDerby || ctx.bttsTilt === 0) return probs;
  const updated = { ...probs };
  if (updated.bttsYes != null) {
    updated.bttsYes = clamp(updated.bttsYes + ctx.bttsTilt, 0.01, 0.99);
    updated.bttsNo = clamp(1 - updated.bttsYes, 0.01, 0.99);
  }
  return updated;
}
