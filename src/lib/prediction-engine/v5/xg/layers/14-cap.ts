// ═══════════════════════════════════════════════════════════════════════
// Layer 14: League-dependent xG capping (final safety brake)
//
// Final step before returning xG. Even if every upstream layer behaved
// reasonably, edge cases can push xG into nonsense territory. This layer
// applies hard floors + ceilings calibrated to league character.
//
// CAP TIERS (based on league over_3.5 rate):
//   HIGH-scoring leagues (>35% over_3.5)  → per-team 3.5, total 7.0
//   TYPICAL leagues       (25–35%)         → per-team 3.0, total 6.0
//   LOW-scoring leagues  (<25% over_3.5)  → per-team 2.5, total 5.0
//
// We also enforce a TOTAL FLOOR of 0.8 — even a 0-0 grind has λ_total ≥ 0.8.
//
// Returns BOTH the capped final xG AND the capped "base" xG (xG before
// L5-L13 boosts) so downstream code (calibration, market scoring) can
// reference both. This is used by the Layer-2 shift detector elsewhere
// to flag "engine pushed xG far from base" situations.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum, round3 } from '../shared';

export const PER_TEAM_FLOOR = 0.2;
export const TOTAL_FLOOR = 0.8;

export const CAP_HIGH_SCORING_THRESHOLD = 0.35;
export const CAP_TYPICAL_THRESHOLD = 0.25;

export const CAP_HIGH_PER_TEAM = 3.5;
export const CAP_HIGH_TOTAL = 7.0;
export const CAP_TYPICAL_PER_TEAM = 3.0;
export const CAP_TYPICAL_TOTAL = 6.0;
export const CAP_LOW_PER_TEAM = 2.5;
export const CAP_LOW_TOTAL = 5.0;

export interface CappedXg {
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  totalExpectedGoals: number;
  baseHomeXg: number;
  baseAwayXg: number;
}

/** Determine cap tier from league over_3.5 rate. */
export function getLeagueCapTier(leagueOver35Rate: number): { perTeam: number; total: number } {
  if (leagueOver35Rate > CAP_HIGH_SCORING_THRESHOLD) {
    return { perTeam: CAP_HIGH_PER_TEAM, total: CAP_HIGH_TOTAL };
  }
  if (leagueOver35Rate >= CAP_TYPICAL_THRESHOLD) {
    return { perTeam: CAP_TYPICAL_PER_TEAM, total: CAP_TYPICAL_TOTAL };
  }
  return { perTeam: CAP_LOW_PER_TEAM, total: CAP_LOW_TOTAL };
}

function capPair(h: number, a: number, perTeam: number, total: number): { h: number; a: number } {
  h = clamp(h, PER_TEAM_FLOOR, perTeam);
  a = clamp(a, PER_TEAM_FLOOR, perTeam);
  const t = h + a;
  if (t > total) {
    const s = total / t;
    h *= s;
    a *= s;
  }
  if (t < TOTAL_FLOOR) {
    const s = TOTAL_FLOOR / t;
    h *= s;
    a *= s;
  }
  return { h, a };
}

export function capXg(homeXg: number, awayXg: number, baseHome: number, baseAway: number, fv: any): CappedXg {
  const leagueOver35 = safeNum(fv?.leagueOver35Rate, 0.30);
  const { perTeam, total } = getLeagueCapTier(leagueOver35);

  const fh = capPair(homeXg, awayXg, perTeam, total);
  const bh = capPair(baseHome, baseAway, perTeam, total);

  return {
    homeExpectedGoals: round3(fh.h),
    awayExpectedGoals: round3(fh.a),
    totalExpectedGoals: round3(fh.h + fh.a),
    baseHomeXg: round3(bh.h),
    baseAwayXg: round3(bh.a),
  };
}
