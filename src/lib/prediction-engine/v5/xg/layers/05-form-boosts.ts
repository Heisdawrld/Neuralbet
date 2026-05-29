// ═══════════════════════════════════════════════════════════════════════
// Layer 5: Form-derived attack/defence boosts
//
// Wide-ranging recent-form signal that combines:
//   • Goals scored vs league average      (attack quality)
//   • Score-success rate (1 - failed to score)
//   • BTTS rate                            (offensive consistency)
//   • Luck regression (goals - xG)         (variance correction)
//   • Lineup attacker count                (small penalty if <2 attackers)
//   • Goals conceded vs league average    (defensive leak)
//   • Clean sheet rate                    (defensive consistency, inverse)
//
// Each sub-signal is clamped to a small range (±5–12%) so any one bad
// number can't dominate. Then totals are clamped to ±20% as a final brake.
//
// CONFIDENCE SCALING (the part the silent-bug audit found important):
// boosts only fire fully when the team has ≥5 matches AND data
// completeness ≥0.55. With ≥3 matches but lower completeness, boosts
// scale down. With <3 matches, NO boost at all (zero confidence).
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum, type XgPair } from '../shared';

// Global baselines (fallbacks when league context is missing)
export const GLOBAL_AVG_SCORED = 1.25;
export const GLOBAL_BTTS = 0.46;
export const GLOBAL_CS = 0.28;
export const GLOBAL_SCORE_SUCCESS = 0.70;

// Sub-signal weights & caps
export const ATTACK_GOAL_SCALE = 0.35;          // sensitivity to goals-scored deviation
export const ATTACK_GOAL_CAP = 0.12;            // ±12% max from goals signal alone
export const CONSISTENCY_SCALE = 0.28;          // sensitivity to score-success rate
export const CONSISTENCY_CAP = 0.08;
export const BTTS_SCALE = 0.22;
export const BTTS_CAP = 0.07;
export const LUCK_REGRESSION_SCALE = -0.40;     // NEGATIVE: overperformers regress down
export const LUCK_REGRESSION_CAP = 0.10;
export const LINEUP_ATTACKER_PENALTY = -0.05;   // -5% xG if <2 attackers
export const DEFENCE_LEAK_SCALE = 0.30;
export const DEFENCE_LEAK_CAP = 0.10;
export const CLEAN_SHEET_SCALE = -0.25;          // NEGATIVE: more CS → opponent xG down
export const CLEAN_SHEET_CAP = 0.07;

export const FINAL_ATTACK_CAP = 0.20;            // total attack boost cap
export const FINAL_DEFENCE_CAP = 0.15;
export const TOTAL_XG_BOOST_CAP = 0.20;

// Quality scaling thresholds
export const MIN_MATCHES_FOR_ANY_BOOST = 3;
export const STRONG_QSCALE_COMPLETENESS = 0.55;
export const WEAK_QSCALE_COMPLETENESS = 0.35;
export const LOW_MATCH_COUNT_THRESHOLD = 5;
export const LOW_MATCH_QSCALE_FACTOR = 0.65;

function qualityScale(matches: number, completeness: number): number {
  if (matches < MIN_MATCHES_FOR_ANY_BOOST) return 0;
  const completenessFactor =
    completeness >= STRONG_QSCALE_COMPLETENESS ? 1.0 :
    completeness >= WEAK_QSCALE_COMPLETENESS ? 0.7 :
    0.4;
  const matchFactor = matches < LOW_MATCH_COUNT_THRESHOLD ? LOW_MATCH_QSCALE_FACTOR : 1;
  return completenessFactor * matchFactor;
}

function boostContrib(value: number | null | undefined, baseline: number, scale: number, maxEffect: number): number {
  if (value == null || !Number.isFinite(value) || baseline === 0) return 0;
  return clamp(((value - baseline) / baseline) * scale, -maxEffect, maxEffect);
}

export function computeFormDerivedBoosts(fv: any): { homeXgBoost: number; awayXgBoost: number } {
  const LAG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_AVG_SCORED);
  const L_BTTS = safeNum(fv.leagueBttsRate, GLOBAL_BTTS);
  const L_CS = safeNum(fv.leagueCleanSheetRate, GLOBAL_CS);
  const L_SCORE_OK = safeNum(fv.leagueScoreSuccessRate, GLOBAL_SCORE_SUCCESS);

  const homeQScale = qualityScale(safeNum(fv.homeMatchesAvailable, 0), safeNum(fv.dataCompletenessScore, 0));
  const awayQScale = qualityScale(safeNum(fv.awayMatchesAvailable, 0), safeNum(fv.dataCompletenessScore, 0));

  // ── HOME attack signals ──
  const hGoalsBoost = boostContrib(fv.homeAvgScored, LAG, ATTACK_GOAL_SCALE, ATTACK_GOAL_CAP);
  const hScoreSuccess = fv.homeFailedToScoreRate != null ? 1 - fv.homeFailedToScoreRate : undefined;
  const hConsistency = boostContrib(hScoreSuccess, L_SCORE_OK, CONSISTENCY_SCALE, CONSISTENCY_CAP);
  const hBtts = boostContrib(fv.homeProfileBttsRate ?? fv.homeBttsRate, L_BTTS, BTTS_SCALE, BTTS_CAP);
  const hLuckDiff = fv.homeAvgXgFor != null && fv.homeAvgScored != null && Number.isFinite(fv.homeAvgXgFor) && Number.isFinite(fv.homeAvgScored)
    ? fv.homeAvgScored - fv.homeAvgXgFor : 0;
  const hLuckReg = boostContrib(hLuckDiff, 1.0, LUCK_REGRESSION_SCALE, LUCK_REGRESSION_CAP);
  const hLineupPen = fv.homeAttackers != null && fv.homeAttackers < 2 ? LINEUP_ATTACKER_PENALTY : 0;

  const hAttackBoost = homeQScale > 0
    ? clamp(hGoalsBoost + hConsistency + hBtts + hLuckReg, -FINAL_ATTACK_CAP, FINAL_ATTACK_CAP) * homeQScale
    : 0;

  // ── AWAY attack signals ──
  const aGoalsBoost = boostContrib(fv.awayAvgScored, LAG, ATTACK_GOAL_SCALE, ATTACK_GOAL_CAP);
  const aScoreSuccess = fv.awayFailedToScoreRate != null ? 1 - fv.awayFailedToScoreRate : undefined;
  const aConsistency = boostContrib(aScoreSuccess, L_SCORE_OK, CONSISTENCY_SCALE, CONSISTENCY_CAP);
  const aBtts = boostContrib(fv.awayProfileBttsRate ?? fv.awayBttsRate, L_BTTS, BTTS_SCALE, BTTS_CAP);
  const aLuckDiff = fv.awayAvgXgFor != null && fv.awayAvgScored != null && Number.isFinite(fv.awayAvgXgFor) && Number.isFinite(fv.awayAvgScored)
    ? fv.awayAvgScored - fv.awayAvgXgFor : 0;
  const aLuckReg = boostContrib(aLuckDiff, 1.0, LUCK_REGRESSION_SCALE, LUCK_REGRESSION_CAP);
  const aLineupPen = fv.awayAttackers != null && fv.awayAttackers < 2 ? LINEUP_ATTACKER_PENALTY : 0;

  const aAttackBoost = awayQScale > 0
    ? clamp(aGoalsBoost + aConsistency + aBtts + aLuckReg, -FINAL_ATTACK_CAP, FINAL_ATTACK_CAP) * awayQScale
    : 0;

  // ── Defence leaks (opponent benefit from your defensive frailty) ──
  const hDefLeaky = homeQScale > 0
    ? clamp(
        boostContrib(fv.homeAvgConceded, LAG, DEFENCE_LEAK_SCALE, DEFENCE_LEAK_CAP)
        + boostContrib(fv.homeProfileCleanSheetRate, L_CS, CLEAN_SHEET_SCALE, CLEAN_SHEET_CAP),
        -FINAL_DEFENCE_CAP, FINAL_DEFENCE_CAP,
      ) * homeQScale
    : 0;

  const aDefLeaky = awayQScale > 0
    ? clamp(
        boostContrib(fv.awayAvgConceded, LAG, DEFENCE_LEAK_SCALE, DEFENCE_LEAK_CAP)
        + boostContrib(fv.awayProfileCleanSheetRate, L_CS, CLEAN_SHEET_SCALE, CLEAN_SHEET_CAP),
        -FINAL_DEFENCE_CAP, FINAL_DEFENCE_CAP,
      ) * awayQScale
    : 0;

  // Home xG benefits from away defensive leakiness; away xG benefits from home leakiness
  const homeXgBoost = clamp(hAttackBoost + aDefLeaky + hLineupPen, -TOTAL_XG_BOOST_CAP, TOTAL_XG_BOOST_CAP);
  const awayXgBoost = clamp(aAttackBoost + hDefLeaky + aLineupPen, -TOTAL_XG_BOOST_CAP, TOTAL_XG_BOOST_CAP);

  return { homeXgBoost, awayXgBoost };
}

export function applyFormBoosts(homeXg: number, awayXg: number, fv: any): XgPair {
  const { homeXgBoost, awayXgBoost } = computeFormDerivedBoosts(fv);
  return {
    homeXg: homeXg * (1 + homeXgBoost),
    awayXg: awayXg * (1 + awayXgBoost),
  };
}
