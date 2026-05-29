// ═══════════════════════════════════════════════════════════════════════
// Category: open_end_to_end
//
// "Both teams attack well AND both teams concede readily AND historical
//  BTTS rate is high." The Bayern vs Dortmund / Liverpool vs Man City
//  archetype.
//
// Symmetric weighting — both sides need to chip in. The combinedBttsRate
// signal is the single strongest indicator (historical BTTS rate of this
// specific matchup is a very robust predictor of a high-scoring open game).
// ═══════════════════════════════════════════════════════════════════════

import { clamp } from '../../xg/shared';
import type { ScriptInputs } from '../types';

export const HOME_ATTACK_THRESHOLD = 0.55;
export const HOME_ATTACK_BONUS = 0.20;
export const AWAY_ATTACK_THRESHOLD = 0.55;
export const AWAY_ATTACK_BONUS = 0.20;
export const HOME_LEAKY_THRESHOLD = 1.2;
export const HOME_LEAKY_BONUS = 0.15;
export const AWAY_LEAKY_THRESHOLD = 1.2;
export const AWAY_LEAKY_BONUS = 0.15;
export const BTTS_HIGH_THRESHOLD = 0.5;
export const BTTS_HIGH_BONUS = 0.20;

export const BTTS_PROPORTIONAL_BASELINE = 0.3;
export const BTTS_PROPORTIONAL_SCALE = 0.5;
export const BTTS_PROPORTIONAL_CAP = 0.10;
export const TOTAL_GOALS_PROPORTIONAL_SCALE = 0.05;
export const TOTAL_GOALS_PROPORTIONAL_CAP = 0.10;

export function scoreOpenEndToEnd(i: ScriptInputs): number {
  let s = 0;
  if (i.homeAttackRating01 > HOME_ATTACK_THRESHOLD) s += HOME_ATTACK_BONUS;
  if (i.awayAttackRating01 > AWAY_ATTACK_THRESHOLD) s += AWAY_ATTACK_BONUS;
  if (i.homeAvgConceded > HOME_LEAKY_THRESHOLD) s += HOME_LEAKY_BONUS;
  if (i.awayAvgConceded > AWAY_LEAKY_THRESHOLD) s += AWAY_LEAKY_BONUS;
  if (i.combinedBttsRate > BTTS_HIGH_THRESHOLD) s += BTTS_HIGH_BONUS;

  s += clamp((i.combinedBttsRate - BTTS_PROPORTIONAL_BASELINE) * BTTS_PROPORTIONAL_SCALE,
             0, BTTS_PROPORTIONAL_CAP);
  s += clamp(i.avgTotalGoalsProxy * TOTAL_GOALS_PROPORTIONAL_SCALE,
             0, TOTAL_GOALS_PROPORTIONAL_CAP);

  return clamp(s, 0, 1);
}
