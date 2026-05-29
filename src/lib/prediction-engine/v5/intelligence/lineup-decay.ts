// ═══════════════════════════════════════════════════════════════════════
// Intelligence: Lineup confidence decay over time-to-kickoff
//
// THE EFFECT — predicted lineups (BSD-generated) are LESS RELIABLE the
// further from kickoff you are. A predicted lineup 12 hours out has high
// reliability; one 5 days out is mostly guesswork.
//
// V5 already has a `lineupCertaintyScore` (0-1) from the lineup sync,
// but the engine treats it as a static signal. This module ADDITIONALLY
// dampens that score based on hoursToKickoff, which feeds downstream
// confidence calibration:
//
//   ≤ 4 hours:    no extra decay (BSD predicted lineup is near-final)
//   ≤ 24 hours:   decay 0% to 10%
//   ≤ 72 hours:   decay 10% to 30%
//   > 72 hours:   decay 30% (saturates)
//
// EFFECT ON THE ENGINE
//   The decayed certainty is fed into `lineupCertaintyScore` which is
//   read by:
//     - the script classifier (boosts chaotic_unreliable when low)
//     - the abstain logic (more abstains on low-data fixtures)
//   So this module pushes the engine toward HUMILITY when far from kickoff.
//
// HARD GUARDS
//   - hoursToKickoff must be finite + non-negative
//   - lineupCertaintyScore must be present (otherwise no-op)
//   - When lineup_status is 'confirmed' (post-publication ~1hr before),
//     no decay applied — confirmed lineups are confirmed.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import { isIntelligenceEnabled } from './flags';

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────

/** Hours before kickoff after which no extra decay is applied. */
export const DECAY_TIGHT_WINDOW_HOURS = 4;

/** Hours before kickoff for the medium-decay band. */
export const DECAY_MEDIUM_WINDOW_HOURS = 24;

/** Hours before kickoff for the long-decay band start. */
export const DECAY_LONG_WINDOW_HOURS = 72;

/** Maximum certainty decay (saturates beyond DECAY_LONG_WINDOW_HOURS). */
export const MAX_DECAY = 0.30;

/** Decay applied at the medium boundary (24h). */
export const MEDIUM_DECAY = 0.10;

// ─────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────

export interface LineupDecayContext {
  isActive: boolean;
  hoursToKickoff: number | null;
  decayFraction: number;        // 0 = no decay, 0.30 = full decay
  adjustedHomeCertainty: number;
  adjustedAwayCertainty: number;
}

/** Linear interpolation between (x1,y1) and (x2,y2) at point x. */
function lerp(x: number, x1: number, y1: number, x2: number, y2: number): number {
  if (x2 === x1) return y1;
  const t = (x - x1) / (x2 - x1);
  return y1 + (y2 - y1) * t;
}

/**
 * Compute the decay fraction for a given hoursToKickoff:
 *   [0, 4h]    → 0
 *   (4, 24h]   → 0 → 10% (linear)
 *   (24, 72h]  → 10% → 30% (linear)
 *   > 72h      → 30%
 */
export function decayFractionForHours(hoursToKickoff: number): number {
  if (!Number.isFinite(hoursToKickoff) || hoursToKickoff < 0) return 0;
  if (hoursToKickoff <= DECAY_TIGHT_WINDOW_HOURS) return 0;
  if (hoursToKickoff <= DECAY_MEDIUM_WINDOW_HOURS) {
    return lerp(hoursToKickoff, DECAY_TIGHT_WINDOW_HOURS, 0, DECAY_MEDIUM_WINDOW_HOURS, MEDIUM_DECAY);
  }
  if (hoursToKickoff <= DECAY_LONG_WINDOW_HOURS) {
    return lerp(hoursToKickoff, DECAY_MEDIUM_WINDOW_HOURS, MEDIUM_DECAY, DECAY_LONG_WINDOW_HOURS, MAX_DECAY);
  }
  return MAX_DECAY;
}

export function deriveLineupDecayContext(fv: any): LineupDecayContext {
  const noop: LineupDecayContext = {
    isActive: false,
    hoursToKickoff: null,
    decayFraction: 0,
    adjustedHomeCertainty: safeNum(fv?.lineupCertaintyScore, 0.5),
    adjustedAwayCertainty: safeNum(fv?.lineupCertaintyScore, 0.5),
  };

  if (!isIntelligenceEnabled('lineup_decay')) return noop;
  if (fv == null) return noop;

  // Confirmed lineups: no decay
  const status = String(fv.lineupStatus || fv.homeLineupStatus || '').toLowerCase();
  if (status === 'confirmed') return noop;

  const hoursToKickoff = safeNum(fv.hoursToKickoff, -1);
  if (hoursToKickoff < 0) return noop;
  if (hoursToKickoff <= DECAY_TIGHT_WINDOW_HOURS) return noop;

  const decay = decayFractionForHours(hoursToKickoff);
  if (decay <= 0) return noop;

  const baseCertainty = safeNum(fv.lineupCertaintyScore, 0.5);
  const adjusted = baseCertainty * (1 - decay);

  return {
    isActive: true,
    hoursToKickoff,
    decayFraction: decay,
    adjustedHomeCertainty: adjusted,
    adjustedAwayCertainty: adjusted,
  };
}

/**
 * Returns the adjusted lineup certainty score for a fixture.
 * When inactive, returns the original score unchanged.
 */
export function adjustLineupCertainty(fv: any): number {
  const ctx = deriveLineupDecayContext(fv);
  return ctx.adjustedHomeCertainty;
}
