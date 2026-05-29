// ═══════════════════════════════════════════════════════════════════════
// Layer 8: League goal-rate adjustment
//
// Even when we know team-level form and base rates, the league context
// matters: Bundesliga + Eredivisie + Swiss SL are systematically
// higher-scoring than Serie A + Ligue 1. If our base xG was estimated
// assuming a typical league, but THIS league is +0.30 over_3.5 above
// global mean, we should nudge xG up.
//
// We use BOTH over_2.5 and over_3.5 league rates because they capture
// different parts of the distribution:
//   over_3.5 rate deviation × 0.65 weight  (sensitive to tail / blowouts)
//   over_2.5 rate deviation × 0.35 weight  (sensitive to the middle)
//
// Multiplier capped to ±6% — this is a tilt, not a wholesale rewrite.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum, type XgPair } from '../shared';

export const LEAGUE_GLOBAL_OVER35 = 0.30;
export const LEAGUE_GLOBAL_OVER25 = 0.50;
export const LEAGUE_OVER35_WEIGHT = 0.65;
export const LEAGUE_OVER25_WEIGHT = 0.35;
export const LEAGUE_RATE_SENSITIVITY = 0.30;
export const LEAGUE_RATE_MAX_DELTA = 0.06;

export function applyLeagueGoalRateAdjustment(homeXg: number, awayXg: number, fv: any): XgPair {
  const leagueOver35 = safeNum(fv.leagueOver35Rate, LEAGUE_GLOBAL_OVER35);
  const leagueOver25 = safeNum(fv.leagueOver25Rate, LEAGUE_GLOBAL_OVER25);
  const over35Dev = leagueOver35 - LEAGUE_GLOBAL_OVER35;
  const over25Dev = leagueOver25 - LEAGUE_GLOBAL_OVER25;
  const totalDev = over35Dev * LEAGUE_OVER35_WEIGHT + over25Dev * LEAGUE_OVER25_WEIGHT;
  const multiplier = 1 + clamp(totalDev * LEAGUE_RATE_SENSITIVITY, -LEAGUE_RATE_MAX_DELTA, LEAGUE_RATE_MAX_DELTA);
  return { homeXg: homeXg * multiplier, awayXg: awayXg * multiplier };
}
