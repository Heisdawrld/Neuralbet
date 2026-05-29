// ═══════════════════════════════════════════════════════════════════════
// Category: tight_low_event
//
// "Both teams score sparingly AND both teams defend well AND both attacks
//  are below average." The Italy vs Italy / Atletico vs Real / Cagliari vs
//  Empoli archetype — defensive grind, low total goals.
//
// This is the most asymmetric category in terms of signals — we have four
// hard-threshold sub-signals (low-scoring at home, low-scoring away, low-
// conceding at home, low-conceding away) plus two attack-rating sub-signals.
// All have to chip in for a strong tight-script call.
// ═══════════════════════════════════════════════════════════════════════

import { clamp } from '../../xg/shared';
import type { ScriptInputs } from '../types';

export const HOME_LOW_SCORING_THRESHOLD = 1.1;
export const HOME_LOW_SCORING_BONUS = 0.25;
export const AWAY_LOW_SCORING_THRESHOLD = 1.1;
export const AWAY_LOW_SCORING_BONUS = 0.25;
export const HOME_LOW_CONCEDING_THRESHOLD = 1.0;
export const HOME_LOW_CONCEDING_BONUS = 0.20;
export const AWAY_LOW_CONCEDING_THRESHOLD = 1.0;
export const AWAY_LOW_CONCEDING_BONUS = 0.20;
export const HOME_LOW_ATTACK_THRESHOLD = 0.45;
export const HOME_LOW_ATTACK_BONUS = 0.10;
export const AWAY_LOW_ATTACK_THRESHOLD = 0.45;
export const AWAY_LOW_ATTACK_BONUS = 0.10;

/** Proportional sub-signal: how far BELOW 1.3 goals/game the side is. */
export const PROPORTIONAL_GOAL_BASELINE = 1.3;
export const PROPORTIONAL_GOAL_SCALE = 0.1;
export const PROPORTIONAL_GOAL_CAP = 0.10;

export function scoreTightLowEvent(i: ScriptInputs): number {
  let s = 0;
  if (i.homeHomeGoalsFor < HOME_LOW_SCORING_THRESHOLD) s += HOME_LOW_SCORING_BONUS;
  if (i.awayAwayGoalsFor < AWAY_LOW_SCORING_THRESHOLD) s += AWAY_LOW_SCORING_BONUS;
  if (i.homeAvgConceded < HOME_LOW_CONCEDING_THRESHOLD) s += HOME_LOW_CONCEDING_BONUS;
  if (i.awayAvgConceded < AWAY_LOW_CONCEDING_THRESHOLD) s += AWAY_LOW_CONCEDING_BONUS;
  if (i.homeAttackRating01 < HOME_LOW_ATTACK_THRESHOLD) s += HOME_LOW_ATTACK_BONUS;
  if (i.awayAttackRating01 < AWAY_LOW_ATTACK_THRESHOLD) s += AWAY_LOW_ATTACK_BONUS;

  s += clamp((PROPORTIONAL_GOAL_BASELINE - i.homeHomeGoalsFor) * PROPORTIONAL_GOAL_SCALE,
             0, PROPORTIONAL_GOAL_CAP);
  s += clamp((PROPORTIONAL_GOAL_BASELINE - i.awayAwayGoalsFor) * PROPORTIONAL_GOAL_SCALE,
             0, PROPORTIONAL_GOAL_CAP);

  return clamp(s, 0, 1);
}
