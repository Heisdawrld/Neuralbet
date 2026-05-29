// ═══════════════════════════════════════════════════════════════════════
// Layer 4: Script-aware proportional adjustments
//
// The classifier upstream tags every fixture with a primary script:
//   open_end_to_end        → both sides amp up xG (12%)
//   tight_low_event        → both sides damp xG (10%)
//   dominant_home_pressure → home up, away down (4% each)
//   dominant_away_pressure → away up, home down (4% each)
//   chaotic_unreliable     → regress 10% toward league baseline
//
// These adjustments are PROPORTIONAL (multiplicative) not additive —
// a team already projected at 2.5 xG should lift more in absolute terms
// than a team at 0.8 xG.
//
// We also apply per-side "predicted strength" dampeners — if the upstream
// lineup-intelligence module flagged either team as weakened (key injuries,
// rotation), strength < 1.0 multiplies xG down.
// ═══════════════════════════════════════════════════════════════════════

import type { ScriptOutput } from '../../types';
import { GLOBAL_LEAGUE_AVG, HOME_ADV, safeNum, type XgPair } from '../shared';

export const SCRIPT_MULTIPLIERS = {
  open_end_to_end:        { home: 1.12, away: 1.12 },
  tight_low_event:        { home: 0.90, away: 0.90 },
  dominant_home_pressure: { home: 1.04, away: 0.96 },
  dominant_away_pressure: { home: 0.96, away: 1.04 },
} as const;

/** Chaotic-match regression: pull both sides 10% toward league baseline. */
export const CHAOTIC_REGRESSION_WEIGHT = 0.10;

export function applyScriptAdjustments(
  homeXg: number, awayXg: number,
  script: ScriptOutput, fv: any,
): XgPair {
  const LEAGUE_AVG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const primary = script.primary || '';

  const mult = SCRIPT_MULTIPLIERS[primary as keyof typeof SCRIPT_MULTIPLIERS];
  if (mult) {
    homeXg *= mult.home;
    awayXg *= mult.away;
  } else if (primary === 'chaotic_unreliable') {
    homeXg = homeXg * (1 - CHAOTIC_REGRESSION_WEIGHT) + LEAGUE_AVG * HOME_ADV * CHAOTIC_REGRESSION_WEIGHT;
    awayXg = awayXg * (1 - CHAOTIC_REGRESSION_WEIGHT) + LEAGUE_AVG * CHAOTIC_REGRESSION_WEIGHT;
  }

  // Lineup-intelligence dampeners (key injuries / rotation already weighing down strength score)
  if (fv.homePredictedStrength != null && fv.homePredictedStrength < 1.0) {
    homeXg *= fv.homePredictedStrength;
  }
  if (fv.awayPredictedStrength != null && fv.awayPredictedStrength < 1.0) {
    awayXg *= fv.awayPredictedStrength;
  }

  return { homeXg, awayXg };
}
