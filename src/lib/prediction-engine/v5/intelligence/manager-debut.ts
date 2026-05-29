// ═══════════════════════════════════════════════════════════════════════
// Intelligence: Manager debut bonus
//
// THE EFFECT — well-documented across football analytics literature:
// in a new manager's first 3-4 games (especially at home), the team
// outperforms its xG-baseline by ~5-10%. Drivers:
//   - Players audition for the new boss → effort spikes
//   - Training freshens up; minor tactical tweaks confuse opponents
//   - Opponent has no recent tape on the new setup
//   - "New broom" press coverage lifts squad morale
//
// The effect IS NOT free goals. It's a small home-favourite tilt.
// The engine should:
//   - Bump home win probability +5-10% (scaled by how new the manager is)
//   - Reduce draw probability (the lift comes mostly from converted draws)
//   - Apply ONLY to the manager's home side (most documented)
//   - Decay to zero by match ~5
//
// INPUTS (new fields the feature-builder needs to populate):
//   homeManagerMatchesAtClub: how many league games this manager has had
//                              at this team so far. NULL if unknown.
//   homeManagerDaysAtClub:    days since date_from of the current tenure.
//                              Used as a secondary signal — long-tenure
//                              managers with low match counts (long
//                              suspensions, etc.) shouldn't trigger.
//
// SCALING
//   matches 0 (debut): +10% home win bonus (×0.6 to draw)
//   matches 1:         +7%
//   matches 2:         +5%
//   matches 3:         +3%
//   matches 4+:        0% (effect gone)
//
// And we ONLY trigger when daysAtClub <= 60 — covers "recent appointment"
// without firing for managers who've been suspended or on sabbatical.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum } from '../xg/shared';
import { isIntelligenceEnabled } from './flags';

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────

/** Per-match bonus applied to homeWin probability (additive %).
 *  Index = matches at club at the START of this match (0 = debut). */
export const HOME_WIN_BONUS_BY_MATCH: readonly number[] = [
  0.10, // debut (match 0)
  0.07, // match 1
  0.05, // match 2
  0.03, // match 3
  0,    // match 4+
];

/** Multiplier on draw probability — the lift comes from converted draws. */
export const DRAW_DAMPENER_BY_MATCH: readonly number[] = [
  0.85, // debut: -15% on draw
  0.90, // match 1
  0.93, // match 2
  0.96, // match 3
  1.00, // match 4+
];

/** Maximum days at club for the bonus to fire (filters edge cases). */
export const MAX_DAYS_FOR_DEBUT = 60;

/** Match index after which the bonus is fully decayed. */
export const DEBUT_DECAY_MATCHES = HOME_WIN_BONUS_BY_MATCH.length - 1;

// ─────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────

export interface ManagerDebutContext {
  isHomeDebut: boolean;
  homeMatchesAtClub: number | null;
  homeWinBonus: number;        // additive amount to add to homeWin
  drawDampener: number;        // multiplier on draw
}

/**
 * Read the manager-debut context from a feature vector.
 * Returns a no-op context when:
 *   - The flag is OFF
 *   - homeManagerMatchesAtClub is null/missing
 *   - homeManagerDaysAtClub > MAX_DAYS_FOR_DEBUT (long tenure, was elsewhere recently)
 *   - matches at club >= DEBUT_DECAY_MATCHES (effect has worn off)
 */
export function deriveManagerDebutContext(fv: any): ManagerDebutContext {
  const noop: ManagerDebutContext = {
    isHomeDebut: false,
    homeMatchesAtClub: null,
    homeWinBonus: 0,
    drawDampener: 1,
  };

  if (!isIntelligenceEnabled('manager_debut')) return noop;

  const matches = fv?.homeManagerMatchesAtClub;
  if (matches == null) return noop;
  const matchesNum = safeNum(matches, -1);
  if (matchesNum < 0) return noop;
  if (matchesNum >= DEBUT_DECAY_MATCHES) return noop;

  const days = fv?.homeManagerDaysAtClub;
  if (days != null) {
    const daysNum = safeNum(days, MAX_DAYS_FOR_DEBUT + 1);
    if (daysNum > MAX_DAYS_FOR_DEBUT) return noop;
  }

  const idx = Math.min(Math.floor(matchesNum), HOME_WIN_BONUS_BY_MATCH.length - 1);
  return {
    isHomeDebut: true,
    homeMatchesAtClub: matchesNum,
    homeWinBonus: HOME_WIN_BONUS_BY_MATCH[idx],
    drawDampener: DRAW_DAMPENER_BY_MATCH[idx],
  };
}

/**
 * Apply manager-debut adjustments to a calibrated probability map.
 * Strategy: add homeWinBonus to homeWin, dampen draw, renormalise 1X2
 * so the three sum to exactly 1.0 (probability-preserving — the bonus
 * effectively comes out of awayWin + draw, dominantly draw).
 *
 * Returns a NEW map; does not mutate input.
 */
export function applyManagerDebutToProbs(
  probs: Record<string, number>,
  fv: any,
): Record<string, number> {
  const ctx = deriveManagerDebutContext(fv);
  if (!ctx.isHomeDebut || ctx.homeWinBonus === 0) return probs;

  if (probs.homeWin == null || probs.draw == null || probs.awayWin == null) {
    return probs; // 1X2 not present — nothing safe to nudge
  }

  const updated = { ...probs };
  const newHome = clamp(updated.homeWin + ctx.homeWinBonus, 0.01, 0.99);
  const newDraw = clamp(updated.draw * ctx.drawDampener, 0.01, 0.99);
  // awayWin = whatever's left after home + draw take their share
  let newAway = 1 - newHome - newDraw;
  newAway = clamp(newAway, 0.01, 0.99);

  // Re-normalise to exactly 1.0 (defensive against rounding drift)
  const sum = newHome + newDraw + newAway;
  const scale = 1 / sum;
  updated.homeWin = round4(newHome * scale);
  updated.draw = round4(newDraw * scale);
  updated.awayWin = round4(newAway * scale);

  // Derived markets that depend on 1X2 need refreshing too
  if (updated.double_chance_home != null || (probs as any).doubleChanceHome != null) {
    // We don't use snake_case in the engine's probabilities map; key is camelCase
    // so this branch is defensive for any consumers that mirror snake_case.
  }
  // The engine's runProbabilityPipeline derives doubleChance/dnb downstream
  // from homeWin/draw/awayWin, so this nudge propagates naturally there.

  return updated;
}

function round4(num: number): number {
  return Math.round(num * 10000) / 10000;
}
