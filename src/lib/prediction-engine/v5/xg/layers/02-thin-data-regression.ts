// ═══════════════════════════════════════════════════════════════════════
// Layer 2: Thin-data regression toward league average
//
// When a team has very few matches in our window (early season, promoted
// team, new league), their average-scored/conceded is unreliable. We
// regress the xG estimate toward the league average + home-advantage
// baseline, more strongly the thinner the data.
//
// Thresholds:
//   <3 matches → 50% engine / 50% league baseline
//   <5 matches → 75% engine / 25% league baseline
//   ≥5 matches → full engine, no regression
//
// The 3/5 cutoffs are conservative — research on sports prediction
// suggests ~7-10 matches before team-level signals stabilise, so this
// is a soft floor, not a hard one. Form/H2H layers handle the rest.
// ═══════════════════════════════════════════════════════════════════════

import { GLOBAL_LEAGUE_AVG, HOME_ADV, safeNum, type XgPair } from '../shared';

export const REGRESSION_HARD_CUTOFF = 3;   // <this → 50% regression
export const REGRESSION_SOFT_CUTOFF = 5;   // <this → 25% regression
export const HARD_REGRESSION_WEIGHT = 0.5; // weight on league baseline at <3 matches
export const SOFT_REGRESSION_WEIGHT = 0.25;// weight on league baseline at <5 matches

export function applyThinDataRegression(homeXg: number, awayXg: number, fv: any): XgPair {
  const LEAGUE_AVG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const minMatches = Math.min(
    safeNum(fv.homeMatchesAvailable, 5),
    safeNum(fv.awayMatchesAvailable, 5),
  );

  if (minMatches < REGRESSION_HARD_CUTOFF) {
    return {
      homeXg: homeXg * (1 - HARD_REGRESSION_WEIGHT) + LEAGUE_AVG * HOME_ADV * HARD_REGRESSION_WEIGHT,
      awayXg: awayXg * (1 - HARD_REGRESSION_WEIGHT) + LEAGUE_AVG * HARD_REGRESSION_WEIGHT,
    };
  }
  if (minMatches < REGRESSION_SOFT_CUTOFF) {
    return {
      homeXg: homeXg * (1 - SOFT_REGRESSION_WEIGHT) + LEAGUE_AVG * HOME_ADV * SOFT_REGRESSION_WEIGHT,
      awayXg: awayXg * (1 - SOFT_REGRESSION_WEIGHT) + LEAGUE_AVG * SOFT_REGRESSION_WEIGHT,
    };
  }
  return { homeXg, awayXg };
}
