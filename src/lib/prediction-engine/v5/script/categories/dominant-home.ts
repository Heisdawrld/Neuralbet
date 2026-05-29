// ═══════════════════════════════════════════════════════════════════════
// Category: dominant_home_pressure
//
// "Home team is materially stronger AND opposition defence is leaky AND
//  the match isn't volatile." This is the canonical 'Bayern vs Augsburg
//  at home' / 'Man City vs Sheffield United at home' archetype.
//
// Weighting rationale:
//   strength gap >0.25      → +0.30  (the dominant signal)
//   away defence leaky >0.6 → +0.25  (gap × leak = lots of goals)
//   home scoring well       → +0.20  (track record matters)
//   away conceding away     → +0.15  (corroborating evidence)
//   low volatility          → +0.10  (chaos kills favourites)
//   PLUS gentle proportional bonuses on strength gap and away weakness
//
// Final score is clamped to [0, 1].
// ═══════════════════════════════════════════════════════════════════════

import { clamp } from '../../xg/shared';
import type { ScriptInputs } from '../types';

export const HOME_STRENGTH_GAP_THRESHOLD = 0.25;
export const HOME_STRENGTH_GAP_BONUS = 0.30;
export const AWAY_DEF_WEAKNESS_THRESHOLD = 0.6;
export const AWAY_DEF_WEAKNESS_BONUS = 0.25;
export const HOME_HOME_GOALS_THRESHOLD = 1.4;
export const HOME_HOME_GOALS_BONUS = 0.20;
export const AWAY_AWAY_CONCEDED_THRESHOLD = 1.3;
export const AWAY_AWAY_CONCEDED_BONUS = 0.15;
export const LOW_VOLATILITY_THRESHOLD = 0.65;
export const LOW_VOLATILITY_BONUS = 0.10;

export const PROPORTIONAL_STRENGTH_SCALE = 0.5;
export const PROPORTIONAL_STRENGTH_CAP = 0.20;
export const PROPORTIONAL_DEFENCE_BASELINE = 0.4;
export const PROPORTIONAL_DEFENCE_SCALE = 0.5;
export const PROPORTIONAL_DEFENCE_CAP = 0.15;

export function scoreDominantHome(i: ScriptInputs): number {
  let s = 0;
  if (i.homeStrengthGap > HOME_STRENGTH_GAP_THRESHOLD) s += HOME_STRENGTH_GAP_BONUS;
  if (i.awayDefensiveWeakness > AWAY_DEF_WEAKNESS_THRESHOLD) s += AWAY_DEF_WEAKNESS_BONUS;
  if (i.homeHomeGoalsFor > HOME_HOME_GOALS_THRESHOLD) s += HOME_HOME_GOALS_BONUS;
  if (i.awayAwayGoalsAgainst > AWAY_AWAY_CONCEDED_THRESHOLD) s += AWAY_AWAY_CONCEDED_BONUS;
  if (i.matchChaosScore < LOW_VOLATILITY_THRESHOLD) s += LOW_VOLATILITY_BONUS;

  s += clamp(i.homeStrengthGap * PROPORTIONAL_STRENGTH_SCALE, 0, PROPORTIONAL_STRENGTH_CAP);
  s += clamp((i.awayDefensiveWeakness - PROPORTIONAL_DEFENCE_BASELINE) * PROPORTIONAL_DEFENCE_SCALE,
             0, PROPORTIONAL_DEFENCE_CAP);

  return clamp(s, 0, 1);
}
