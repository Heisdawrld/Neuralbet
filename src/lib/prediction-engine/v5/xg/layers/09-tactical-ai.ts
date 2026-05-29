// ═══════════════════════════════════════════════════════════════════════
// Layer 9: Advanced tactical AI
//
// Three sub-signals here, each independently capable of moving xG:
//   1. POLYMARKET anchor — when available, treats Polymarket prediction-
//      market consensus on over/under 2.5 as a sharp signal (often
//      sharper than traditional bookmakers because real money + low fees).
//      Weight: 72% engine / 28% Polymarket. Scale clamped to [0.82, 1.18].
//   2. MANAGER TACTICAL STYLE — if a manager's style tag matches
//      "anti-football / low block / conservative", multiply that side's
//      xG by 0.85. If it matches "attacking / positional / gegenpressing",
//      multiply by 1.05. These are crude but well-documented signals.
//   3. COUNTER vs HIGH LINE matchup — if one team plays high line and
//      the other plays direct/counter football, the latter gets +10% xG
//      because their attacking pattern exploits the former's structural
//      weakness.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum, type XgPair } from '../shared';
import type { ManagerProfile } from '../../types';

export const POLY_MODEL_WEIGHT = 0.72;
export const POLY_MARKET_WEIGHT = 0.28;
export const POLY_IMPLIED_FLOOR = 0.05;
export const POLY_IMPLIED_CEIL = 0.95;
export const POLY_IMPLIED_MIN_TOTAL_XG = 1.2;
export const POLY_SCALE_MIN = 0.82;
export const POLY_SCALE_MAX = 1.18;

export const MANAGER_CONSERVATIVE_MULT = 0.85;
export const MANAGER_ATTACKING_MULT = 1.05;
export const COUNTER_VS_HIGH_LINE_MULT = 1.10;

const CONSERVATIVE_STYLE_KEYWORDS = [
  'terrorist', 'anti-football', 'park the bus', 'low block', 'conservative',
];
const ATTACKING_STYLE_KEYWORDS = [
  'positional', 'gegenpressing', 'attacking',
];

function managerStyleMultiplier(manager: ManagerProfile | undefined): number {
  if (!manager) return 1.0;
  const styles = Array.isArray(manager.tactical_styles)
    ? manager.tactical_styles.map(s => (s.code || s.name)).join(' ').toLowerCase()
    : String(manager.tactical_styles || '').toLowerCase();
  if (CONSERVATIVE_STYLE_KEYWORDS.some(k => styles.includes(k))) return MANAGER_CONSERVATIVE_MULT;
  if (ATTACKING_STYLE_KEYWORDS.some(k => styles.includes(k))) return MANAGER_ATTACKING_MULT;
  return 1.0;
}

export function applyAdvancedTacticalAI(homeXg: number, awayXg: number, fv: any): XgPair {
  let h = homeXg, a = awayXg;

  // (1) Polymarket anchor
  const polyOver25 = safeNum(fv.polymarketOdds?.odds?.over_under?.over_25, 0);
  if (polyOver25 > POLY_IMPLIED_FLOOR && polyOver25 < POLY_IMPLIED_CEIL) {
    const sharpTotalXg = Math.max(POLY_IMPLIED_MIN_TOTAL_XG,
      -2.1 * Math.log(Math.max(0.01, 1 - polyOver25)));
    const currentTotal = h + a;
    const blendedTotal = currentTotal * POLY_MODEL_WEIGHT + sharpTotalXg * POLY_MARKET_WEIGHT;
    const scale = clamp(
      Math.max(0.5, blendedTotal) / Math.max(0.5, currentTotal),
      POLY_SCALE_MIN, POLY_SCALE_MAX,
    );
    h *= scale;
    a *= scale;
  }

  // (2) Manager tactical styles
  h *= managerStyleMultiplier(fv.homeManager);
  a *= managerStyleMultiplier(fv.awayManager);

  // (3) Counter vs high line
  if (fv.homeManager?.defensive_line === 'high'
      && (fv.awayManager?.team_style === 'direct' || fv.awayManager?.team_style === 'counter')) {
    a *= COUNTER_VS_HIGH_LINE_MULT;
  }
  if (fv.awayManager?.defensive_line === 'high'
      && (fv.homeManager?.team_style === 'direct' || fv.homeManager?.team_style === 'counter')) {
    h *= COUNTER_VS_HIGH_LINE_MULT;
  }

  return { homeXg: h, awayXg: a };
}
