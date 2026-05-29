// ═══════════════════════════════════════════════════════════════════════
// Intelligence: Set-piece specialist boost
//
// THE EFFECT — a team with an elite dead-ball striker (penalties +
// free-kicks + corners) gains an asymmetric xG bump when:
//   (a) they're already projected to win corners / free-kicks
//   (b) the referee is strict (more fouls = more set-pieces)
//
// V5 doesn't track per-player dead-ball ability yet, so this module
// uses a PROXY: teams whose "set_piece_goal_rate" exceeds the league
// average. BSD doesn't expose this directly either, so for now we use:
//
//   - homeManagerCleanSheetPct (proxy for defensive set-piece strength)
//   - homeAvgScored vs leagueAvg (general scoring threat)
//   - refereeAvgCards (more cards/match → more set-pieces in dangerous
//     positions)
//
// MAGNITUDE
//   When referee is strict (avg_yellow_per_match ≥ 4.0) AND team scores
//   ≥10% above league avg:
//     +5% xG for the strong-scoring side
//
// HONESTY
//   This module fires conservatively. Without per-player set-piece
//   data, we can't claim Phantom-level precision. Phase 3+ should add
//   a BSD player-stats sync to enable a proper set-piece specialist
//   score (Aubameyang, Pascanha, etc.).
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import { isIntelligenceEnabled } from './flags';

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────

/** Referee yellow-cards/match threshold to be considered "strict". */
export const STRICT_REFEREE_YELLOWS_PER_MATCH = 4.0;

/** Team scoring lift over league average required to qualify. */
export const SCORING_LIFT_THRESHOLD_PCT = 0.10; // 10%

/** xG multiplier applied when the conditions hit. */
export const SET_PIECE_BONUS = 1.05; // +5%

// ─────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────

export interface SetPieceContext {
  isActive: boolean;
  homeBoostApplied: boolean;
  awayBoostApplied: boolean;
  homeXgMultiplier: number;
  awayXgMultiplier: number;
}

function teamQualifies(scored: number, leagueAvg: number, refYellows: number): boolean {
  if (refYellows < STRICT_REFEREE_YELLOWS_PER_MATCH) return false;
  if (!Number.isFinite(scored) || !Number.isFinite(leagueAvg) || leagueAvg <= 0) return false;
  return (scored - leagueAvg) / leagueAvg >= SCORING_LIFT_THRESHOLD_PCT;
}

export function deriveSetPieceContext(fv: any): SetPieceContext {
  const noop: SetPieceContext = {
    isActive: false,
    homeBoostApplied: false,
    awayBoostApplied: false,
    homeXgMultiplier: 1.0,
    awayXgMultiplier: 1.0,
  };

  if (!isIntelligenceEnabled('set_piece_specialist')) return noop;
  if (fv == null) return noop;

  // Need referee data
  const refYellows = safeNum(fv.refereeAvgYellowPerMatch, 0);
  if (refYellows < STRICT_REFEREE_YELLOWS_PER_MATCH) return noop;

  const leagueAvg = safeNum(fv.leagueAvgGoalsPerTeam, 0);
  if (leagueAvg <= 0) return noop;

  const homeQualifies = teamQualifies(safeNum(fv.homeAvgScored, 0), leagueAvg, refYellows);
  const awayQualifies = teamQualifies(safeNum(fv.awayAvgScored, 0), leagueAvg, refYellows);

  if (!homeQualifies && !awayQualifies) return noop;

  return {
    isActive: true,
    homeBoostApplied: homeQualifies,
    awayBoostApplied: awayQualifies,
    homeXgMultiplier: homeQualifies ? SET_PIECE_BONUS : 1.0,
    awayXgMultiplier: awayQualifies ? SET_PIECE_BONUS : 1.0,
  };
}

export function applySetPieceToXg(homeXg: number, awayXg: number, fv: any) {
  const ctx = deriveSetPieceContext(fv);
  if (!ctx.isActive) return { homeXg, awayXg };
  return {
    homeXg: homeXg * ctx.homeXgMultiplier,
    awayXg: awayXg * ctx.awayXgMultiplier,
  };
}
