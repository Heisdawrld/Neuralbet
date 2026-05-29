// ═══════════════════════════════════════════════════════════════════════
// Layer 12: Match-context adjustments
//
// External match conditions that affect goal expectation:
//
//   1. LOCAL DERBY — tighter, more cautious, fewer goals on average.
//      Both sides -3% xG (research: derbies average ~10% fewer goals).
//   2. AWAY TRAVEL — long-haul flights degrade away xG.
//      ≥2000km → -6%   (e.g. Brazilian / Russian / US travel)
//      ≥800km  → -3%   (e.g. inter-European)
//   3. BAD WEATHER / BAD PITCH — wet/icy/uneven conditions reduce
//      passing efficiency → fewer goals. Both sides -5%.
//   4. STRICT REFEREE — high-strictness referees (lots of fouls/cards)
//      disrupt attacking play. Both sides -2%.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum, type XgPair } from '../shared';
import { applyDerbyToXg } from '../../intelligence/derby';

export const DERBY_DAMPENER = 0.97;
export const TRAVEL_LONG_DISTANCE_KM = 2000;
export const TRAVEL_MEDIUM_DISTANCE_KM = 800;
export const TRAVEL_LONG_DAMPENER = 0.94;
export const TRAVEL_MEDIUM_DAMPENER = 0.97;
export const BAD_CONDITIONS_DAMPENER = 0.95;
export const STRICT_REFEREE_THRESHOLD = 0.75;
export const STRICT_REFEREE_DAMPENER = 0.98;

export function applyBsdContextAdjustments(homeXg: number, awayXg: number, fv: any): XgPair {
  let h = homeXg, a = awayXg;

  // Derby refinement: intensity-aware, replaces the legacy flat -3% dampener.
  // See src/lib/prediction-engine/v5/intelligence/derby.ts for the math.
  if (fv.isLocalDerby) {
    const derbyAdjusted = applyDerbyToXg(h, a, fv);
    h = derbyAdjusted.homeXg;
    a = derbyAdjusted.awayXg;
  }

  if (fv.travelDistanceKm && fv.travelDistanceKm >= TRAVEL_MEDIUM_DISTANCE_KM) {
    a *= fv.travelDistanceKm >= TRAVEL_LONG_DISTANCE_KM
      ? TRAVEL_LONG_DAMPENER
      : TRAVEL_MEDIUM_DAMPENER;
  }

  if (fv.hasBadWeather || fv.hasBadPitch) {
    h *= BAD_CONDITIONS_DAMPENER;
    a *= BAD_CONDITIONS_DAMPENER;
  }

  if (safeNum(fv.refereeStrictness, 0) >= STRICT_REFEREE_THRESHOLD) {
    h *= STRICT_REFEREE_DAMPENER;
    a *= STRICT_REFEREE_DAMPENER;
  }

  return { homeXg: h, awayXg: a };
}
