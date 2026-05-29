// ═══════════════════════════════════════════════════════════════════════
// Category: chaotic_unreliable
//
// "High volatility OR low data quality OR high upset risk." Signal that
// the engine should be HUMBLE about this fixture — abstain logic
// downstream uses chaotic-script primary as a strong abstain hint.
//
// Volatility and data completeness are the two heaviest signals because
// they directly map to "we don't really know what's going to happen."
// Upset risk is a softer signal — it activates when the model thinks
// the favoured side is unusually vulnerable to a shock result.
// ═══════════════════════════════════════════════════════════════════════

import { clamp } from '../../xg/shared';
import type { ScriptInputs } from '../types';

export const HIGH_VOLATILITY_THRESHOLD = 0.72;
export const HIGH_VOLATILITY_BONUS = 0.50;
export const LOW_DATA_THRESHOLD = 0.4;
export const LOW_DATA_BONUS = 0.40;
export const HIGH_UPSET_THRESHOLD = 0.7;
export const HIGH_UPSET_BONUS = 0.30;

export const VOLATILITY_PROPORTIONAL_SCALE = 0.3;
export const VOLATILITY_PROPORTIONAL_CAP = 0.25;
export const DATA_PROPORTIONAL_BASELINE = 0.5;
export const DATA_PROPORTIONAL_SCALE = 0.3;
export const DATA_PROPORTIONAL_CAP = 0.20;

export function scoreChaoticUnreliable(i: ScriptInputs): number {
  let s = 0;
  if (i.matchChaosScore > HIGH_VOLATILITY_THRESHOLD) s += HIGH_VOLATILITY_BONUS;
  if (i.dataCompletenessScore < LOW_DATA_THRESHOLD) s += LOW_DATA_BONUS;
  if (i.upsetRiskScore > HIGH_UPSET_THRESHOLD) s += HIGH_UPSET_BONUS;

  s += clamp(i.matchChaosScore * VOLATILITY_PROPORTIONAL_SCALE, 0, VOLATILITY_PROPORTIONAL_CAP);
  s += clamp((DATA_PROPORTIONAL_BASELINE - i.dataCompletenessScore) * DATA_PROPORTIONAL_SCALE,
             0, DATA_PROPORTIONAL_CAP);

  return clamp(s, 0, 1);
}
