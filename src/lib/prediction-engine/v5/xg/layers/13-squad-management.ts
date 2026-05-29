// ═══════════════════════════════════════════════════════════════════════
// Layer 13: Squad-management adjustments
//
// The "context the bookmakers haven't fully priced" signals — rotation,
// fatigue, rest, cup distraction, motivation. These are individually
// small but compound when present together.
//
//   1. ROTATION RISK — when a manager is likely to rest first-choice XI
//      (cup distraction, dead-rubber match, packed fixture list). Each
//      side's rotation-risk score (0-1) dampens that side's xG up to 18%.
//   2. ALREADY SECURE — team has clinched a position (title, European
//      spot, mid-table) → motivation drops sharply. Hard -18% xG.
//   3. FATIGUE — proportional dampener (1 - fatigue_score).
//   4. REST DIFFERENTIAL — when one side has had significantly more
//      rest days, the other side gets a small -3% to -5% xG penalty.
//   5. CUP DISTRACTION — proportional dampener up to ~15%.
//   6. EARLY SEASON — both sides -2% to reflect higher noise / less
//      tuned tactics.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum, type XgPair } from '../shared';

export const ROTATION_RISK_THRESHOLD = 0.1;
export const ROTATION_RISK_SCALE = 0.20;
export const ROTATION_RISK_MAX_DAMPER = 0.18;

export const ALREADY_SECURE_DAMPENER = 0.82;

export const FATIGUE_THRESHOLD = 0.05;

export const REST_DIFF_BIG_DAYS = 3;
export const REST_DIFF_BIG_DAMPENER = 0.95;
export const REST_DIFF_MEDIUM_DAYS = 2;
export const REST_DIFF_MEDIUM_DAMPENER = 0.97;

export const CUP_DISTRACTION_THRESHOLD = 0.1;
export const CUP_DISTRACTION_SCALE = 0.15;

export const EARLY_SEASON_DAMPENER = 0.98;

export function applySquadManagementAdjustments(homeXg: number, awayXg: number, fv: any): XgPair {
  let h = homeXg, a = awayXg;

  // (1) Rotation
  const homeRotation = safeNum(fv.rotationRiskHome, 0);
  const awayRotation = safeNum(fv.rotationRiskAway, 0);
  const homeRotationDampener = 1 - clamp(homeRotation * ROTATION_RISK_SCALE, 0, ROTATION_RISK_MAX_DAMPER);
  const awayRotationDampener = 1 - clamp(awayRotation * ROTATION_RISK_SCALE, 0, ROTATION_RISK_MAX_DAMPER);
  if (homeRotation > ROTATION_RISK_THRESHOLD) h *= homeRotationDampener;
  if (awayRotation > ROTATION_RISK_THRESHOLD) a *= awayRotationDampener;

  // (2) Already secure
  if (fv.homeAlreadySecure) h *= ALREADY_SECURE_DAMPENER;
  if (fv.awayAlreadySecure) a *= ALREADY_SECURE_DAMPENER;

  // (3) Fatigue
  const homeFatigue = safeNum(fv.homeFatigue, 0);
  const awayFatigue = safeNum(fv.awayFatigue, 0);
  if (homeFatigue > FATIGUE_THRESHOLD) h *= (1 - homeFatigue);
  if (awayFatigue > FATIGUE_THRESHOLD) a *= (1 - awayFatigue);

  // (4) Rest differential — positive means HOME had more rest (away is the disadvantaged side)
  const restDiff = safeNum(fv.restDiffDays, 0);
  if (restDiff >= REST_DIFF_BIG_DAYS) a *= REST_DIFF_BIG_DAMPENER;
  else if (restDiff >= REST_DIFF_MEDIUM_DAYS) a *= REST_DIFF_MEDIUM_DAMPENER;
  if (restDiff <= -REST_DIFF_BIG_DAYS) h *= REST_DIFF_BIG_DAMPENER;
  else if (restDiff <= -REST_DIFF_MEDIUM_DAYS) h *= REST_DIFF_MEDIUM_DAMPENER;

  // (5) Cup distraction
  const homeCup = safeNum(fv.cupDistractionHome, 0);
  const awayCup = safeNum(fv.cupDistractionAway, 0);
  if (homeCup > CUP_DISTRACTION_THRESHOLD) h *= (1 - homeCup * CUP_DISTRACTION_SCALE);
  if (awayCup > CUP_DISTRACTION_THRESHOLD) a *= (1 - awayCup * CUP_DISTRACTION_SCALE);

  // (6) Early-season noise
  if (fv.seasonStage === 'early') {
    h *= EARLY_SEASON_DAMPENER;
    a *= EARLY_SEASON_DAMPENER;
  }

  return { homeXg: h, awayXg: a };
}
