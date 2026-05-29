// ═══════════════════════════════════════════════════════════════════════
// Layer 3: Venue-specific splits — home-at-home and away-on-the-road
//
// Teams behave systematically differently at home vs away — sometimes
// dramatically (Atletico Madrid at the Metropolitano). Layer 1 used
// overall scored/conceded averages; here we blend in the venue-specific
// splits when available.
//
// When BOTH the home team's home-form data AND the away team's away-form
// data exist:  35% weight to venue splits (60/40 GF/GA inside that 35%).
// When only one side's split is known:           25% weight.
// When neither: no change (pure pass-through).
//
// Why 60/40 inside the venue blend: a team's goals-for at home is a
// stronger signal of upcoming xG than goals-against, because GF reflects
// attacking intent which travels through the engine; GA is already
// captured by the opposing team's attack ratio in Layer 1.
// ═══════════════════════════════════════════════════════════════════════

import type { XgPair } from '../shared';

export const VENUE_WEIGHT_BOTH_SIDES = 0.35;
export const VENUE_WEIGHT_ONE_SIDE = 0.25;
export const VENUE_GF_SHARE = 0.6;
export const VENUE_GA_SHARE = 0.4;

export function applyVenueAnchoring(homeXg: number, awayXg: number, fv: any): XgPair {
  const { homeHomeGoalsFor: hhGF, awayAwayGoalsFor: aaGF,
          homeHomeGoalsAgainst: hhGA, awayAwayGoalsAgainst: aaGA } = fv;

  // Home side
  if (hhGF != null && aaGA != null) {
    homeXg = homeXg * (1 - VENUE_WEIGHT_BOTH_SIDES)
           + (hhGF * VENUE_GF_SHARE + aaGA * VENUE_GA_SHARE) * VENUE_WEIGHT_BOTH_SIDES;
  } else if (hhGF != null) {
    homeXg = homeXg * (1 - VENUE_WEIGHT_ONE_SIDE) + hhGF * VENUE_WEIGHT_ONE_SIDE;
  }

  // Away side
  if (aaGF != null && hhGA != null) {
    awayXg = awayXg * (1 - VENUE_WEIGHT_BOTH_SIDES)
           + (aaGF * VENUE_GF_SHARE + hhGA * VENUE_GA_SHARE) * VENUE_WEIGHT_BOTH_SIDES;
  } else if (aaGF != null) {
    awayXg = awayXg * (1 - VENUE_WEIGHT_ONE_SIDE) + aaGF * VENUE_WEIGHT_ONE_SIDE;
  }

  return { homeXg, awayXg };
}
