// ═══════════════════════════════════════════════════════════════════════
// Intelligence: Late-season motivation asymmetry
//
// THE EFFECT — well-documented across European leagues. In the final
// 3-6 matchdays of a league season, teams play with WILDLY different
// motivation levels depending on what they have left to play for:
//
//   FIGHTING FOR TITLE / EUROPEAN SPOTS / PROMOTION:
//     Outperform xG-baseline by ~5-10% (try harder, fewer rotations)
//
//   FIGHTING TO AVOID RELEGATION:
//     Outperform xG-baseline by ~5-8% (lives on the line, desperate runs)
//
//   ALREADY SAFE / SECURE / NOTHING TO PLAY FOR ("dead rubber"):
//     UNDERPERFORM xG-baseline by ~7-12% (rotations, lower intensity)
//
//   MID-TABLE NO PARTICULAR STAKE:
//     No correction (the model's baseline is fine for ambivalent teams)
//
// INPUT — derived from league standings (already in DB):
//   homePosition / awayPosition       (current league position)
//   homePoints  / awayPoints          (points so far)
//   leagueTeamCount                    (size of league — derived from standings)
//   isLateSeason                       (current matchday >= 80% of season)
//
// The module computes a "motivation score" for each side based on position
// + remaining matchdays + points gap to the relevant boundary (top X for
// Europe, bottom X for relegation, etc.). Maps to an xG multiplier.
//
// NB: this signal SHOULD be hard to wire in V5 today because we don't
// track matchdays-remaining authoritatively. We derive it from
// round_number on the event vs the max round seen so far for that league.
// When that data is missing, we fail-safe to no-op.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import { isIntelligenceEnabled } from './flags';

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────

/** Fraction of season completed before "late season" tactics kick in. */
export const LATE_SEASON_THRESHOLD = 0.80; // last 20% of matchdays

/** Position rank bands for league size 18-20 (covers most top divisions). */
export const POSITION_BANDS = {
  TITLE: { topRank: 2 },          // 1st-2nd: title fight
  EUROPE: { topRank: 6 },         // 1st-6th: European spots
  RELEGATION: { bottomRank: 3 },  // bottom 3: relegation battle
} as const;

/** Bonus multipliers (positive = team motivated above baseline). */
export const TITLE_BONUS = 1.07;        // +7%
export const EUROPE_BONUS = 1.05;       // +5%
export const RELEGATION_BONUS = 1.06;   // +6% (desperation)
export const DEAD_RUBBER_PENALTY = 0.92; // -8%
export const SECURE_MID_PENALTY = 0.95;  // -5% (mid-table with nothing left)

/** Points gap from the relevant boundary required to be "secure".
 *  Example: a team in 4th place needs to be ≥9 pts clear of 7th
 *  to be "Europe-secure" with 3 matches left. */
export const SECURITY_GAP_POINTS_PER_MATCH = 3;

// ─────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────

export type MotivationState =
  | 'title_fight'        // top, fighting for #1
  | 'european_spot'      // top-half, fighting for Europe
  | 'relegation_battle'  // bottom, fighting to stay up
  | 'dead_rubber_secure' // already qualified for Europe, nothing more to gain
  | 'dead_rubber_safe'   // mid-table, already mathematically safe from relegation
  | 'neutral';

export interface MotivationContext {
  isActive: boolean;
  homeState: MotivationState;
  awayState: MotivationState;
  homeXgMultiplier: number;
  awayXgMultiplier: number;
}

interface TeamMotivationInputs {
  position: number;
  points: number;
  leagueTeamCount: number;
  matchesRemaining: number;
  /** Points held by the leader / safety-boundary side for security calcs. */
  topPoints?: number;
  relegationBoundaryPoints?: number;
}

function classifyMotivation(inputs: TeamMotivationInputs): MotivationState {
  const { position, leagueTeamCount, matchesRemaining, points } = inputs;
  if (!Number.isFinite(position) || position <= 0) return 'neutral';

  const requiredGap = matchesRemaining * SECURITY_GAP_POINTS_PER_MATCH;

  // Top tier — fighting for title
  if (position <= POSITION_BANDS.TITLE.topRank) {
    // If clear by enough points, it becomes secure
    if (inputs.topPoints != null && Math.abs(inputs.topPoints - points) > requiredGap && position === 1) {
      return 'dead_rubber_secure';
    }
    return 'title_fight';
  }

  // European spots
  if (position <= POSITION_BANDS.EUROPE.topRank) {
    if (inputs.topPoints != null && Math.abs(inputs.topPoints - points) > requiredGap * 2) {
      return 'dead_rubber_secure';
    }
    return 'european_spot';
  }

  // Relegation battle (bottom N)
  const relegationCutoff = leagueTeamCount - POSITION_BANDS.RELEGATION.bottomRank;
  if (position > relegationCutoff) {
    return 'relegation_battle';
  }

  // Mid-table — possibly safe
  if (inputs.relegationBoundaryPoints != null
      && points - inputs.relegationBoundaryPoints > requiredGap) {
    return 'dead_rubber_safe';
  }
  return 'neutral';
}

function multiplierFor(state: MotivationState): number {
  switch (state) {
    case 'title_fight': return TITLE_BONUS;
    case 'european_spot': return EUROPE_BONUS;
    case 'relegation_battle': return RELEGATION_BONUS;
    case 'dead_rubber_secure': return DEAD_RUBBER_PENALTY;
    case 'dead_rubber_safe': return SECURE_MID_PENALTY;
    case 'neutral':
    default: return 1.0;
  }
}

/**
 * Compute the late-season motivation context for a fixture.
 * No-op when:
 *   - flag is OFF
 *   - season completion below LATE_SEASON_THRESHOLD
 *   - standings data missing for either team
 *   - matchesRemaining <= 0
 */
export function deriveMotivationContext(fv: any): MotivationContext {
  const noop: MotivationContext = {
    isActive: false,
    homeState: 'neutral',
    awayState: 'neutral',
    homeXgMultiplier: 1.0,
    awayXgMultiplier: 1.0,
  };

  if (!isIntelligenceEnabled('late_season_motivation')) return noop;
  if (fv == null) return noop;

  const totalMatches = safeNum(fv.leagueTotalMatchdays, 0);
  const matchday = safeNum(fv.eventMatchday, 0);
  if (totalMatches <= 0 || matchday <= 0) return noop;

  // Only fire in the late portion of the season
  if (matchday / totalMatches < LATE_SEASON_THRESHOLD) return noop;

  const homePos = safeNum(fv.homePosition, 0);
  const awayPos = safeNum(fv.awayPosition, 0);
  if (homePos <= 0 || awayPos <= 0) return noop;

  const leagueTeamCount = safeNum(fv.leagueTeamCount, 20);
  const matchesRemaining = Math.max(0, totalMatches - matchday);

  const homeState = classifyMotivation({
    position: homePos,
    points: safeNum(fv.homePoints, 0),
    leagueTeamCount,
    matchesRemaining,
    topPoints: fv.leagueTopPoints != null ? Number(fv.leagueTopPoints) : undefined,
    relegationBoundaryPoints: fv.leagueRelegationBoundaryPoints != null
      ? Number(fv.leagueRelegationBoundaryPoints) : undefined,
  });

  const awayState = classifyMotivation({
    position: awayPos,
    points: safeNum(fv.awayPoints, 0),
    leagueTeamCount,
    matchesRemaining,
    topPoints: fv.leagueTopPoints != null ? Number(fv.leagueTopPoints) : undefined,
    relegationBoundaryPoints: fv.leagueRelegationBoundaryPoints != null
      ? Number(fv.leagueRelegationBoundaryPoints) : undefined,
  });

  const homeMult = multiplierFor(homeState);
  const awayMult = multiplierFor(awayState);

  if (homeMult === 1.0 && awayMult === 1.0) return noop;

  return {
    isActive: true,
    homeState,
    awayState,
    homeXgMultiplier: homeMult,
    awayXgMultiplier: awayMult,
  };
}

export function applyMotivationToXg(homeXg: number, awayXg: number, fv: any) {
  const ctx = deriveMotivationContext(fv);
  if (!ctx.isActive) return { homeXg, awayXg };
  return {
    homeXg: homeXg * ctx.homeXgMultiplier,
    awayXg: awayXg * ctx.awayXgMultiplier,
  };
}
