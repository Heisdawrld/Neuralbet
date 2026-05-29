// ═══════════════════════════════════════════════════════════════════════
// Category: dominant_away_pressure
//
// Mirror of dominant_home_pressure for the away side. NOTE the asymmetry
// in thresholds — away strength gaps trigger more aggressively (0.20 vs
// 0.25 for home) because away dominance is rarer in football and when it
// happens, it's usually a strong signal.
//
// We do NOT include a "low volatility" sub-signal here (unlike the home
// version), because dominant-away script is itself a higher-volatility
// event archetype.
// ═══════════════════════════════════════════════════════════════════════

import { clamp } from '../../xg/shared';
import type { ScriptInputs } from '../types';

export const AWAY_STRENGTH_GAP_THRESHOLD = 0.20;  // lower than home — away dominance is rarer
export const AWAY_STRENGTH_GAP_BONUS = 0.35;      // and more diagnostic when it occurs
export const HOME_DEF_WEAKNESS_THRESHOLD = 0.55;
export const HOME_DEF_WEAKNESS_BONUS = 0.30;
export const AWAY_AWAY_GOALS_THRESHOLD = 1.3;
export const AWAY_AWAY_GOALS_BONUS = 0.25;

export const PROPORTIONAL_STRENGTH_SCALE = 0.5;
export const PROPORTIONAL_STRENGTH_CAP = 0.20;
export const PROPORTIONAL_DEFENCE_BASELINE = 0.35;
export const PROPORTIONAL_DEFENCE_SCALE = 0.5;
export const PROPORTIONAL_DEFENCE_CAP = 0.15;

export function scoreDominantAway(i: ScriptInputs): number {
  let s = 0;
  if (i.awayStrengthGap > AWAY_STRENGTH_GAP_THRESHOLD) s += AWAY_STRENGTH_GAP_BONUS;
  if (i.homeDefensiveWeakness > HOME_DEF_WEAKNESS_THRESHOLD) s += HOME_DEF_WEAKNESS_BONUS;
  if (i.awayAwayGoalsFor > AWAY_AWAY_GOALS_THRESHOLD) s += AWAY_AWAY_GOALS_BONUS;

  s += clamp(i.awayStrengthGap * PROPORTIONAL_STRENGTH_SCALE, 0, PROPORTIONAL_STRENGTH_CAP);
  s += clamp((i.homeDefensiveWeakness - PROPORTIONAL_DEFENCE_BASELINE) * PROPORTIONAL_DEFENCE_SCALE,
             0, PROPORTIONAL_DEFENCE_CAP);

  return clamp(s, 0, 1);
}
