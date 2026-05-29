// ═══════════════════════════════════════════════════════════════════════
// Tactical fit — how well a market fits a classified game script
//
// SCRIPT_MARKET_FIT maps script.primary → market.marketKey → fit score (0-1).
// Markets not listed default to 0.4 (mild lean). The secondary script
// (when set) also contributes, with 0.7x weight.
//
// Chaotic-script fixtures get a fixed 0.15 fit for everything — engine
// signal that no market is well-suited because the match itself is noise.
// ═══════════════════════════════════════════════════════════════════════

import type { ScriptOutput } from '../types';

export const CHAOTIC_TACTICAL_FIT = 0.15;
export const DEFAULT_TACTICAL_FIT = 0.4;
export const SECONDARY_SCRIPT_WEIGHT = 0.7;

export const SCRIPT_MARKET_FIT: Record<string, Record<string, number>> = {
  dominant_home_pressure: {
    home_win: 0.92, dnb_home: 0.85, home_over_15: 0.85,
    win_either_half_home: 0.80, handicap_home_minus1: 0.78,
    away_under_15: 0.78, double_chance_home: 0.72,
    under_25: 0.68, btts_no: 0.65, home_over_25: 0.60,
  },
  dominant_away_pressure: {
    away_win: 0.92, dnb_away: 0.85, away_over_15: 0.85,
    win_either_half_away: 0.80, handicap_away_minus1: 0.78,
    home_under_15: 0.78, double_chance_away: 0.72,
    under_25: 0.68, btts_no: 0.65, away_over_25: 0.60,
  },
  open_end_to_end: {
    btts_yes: 0.92, over_25: 0.88, over_35: 0.72,
    home_over_05: 0.70, away_over_05: 0.70, over_15: 0.65,
    home_over_15: 0.62, away_over_15: 0.62,
    under_25: 0.15, btts_no: 0.15,
  },
  tight_low_event: {
    under_25: 0.92, btts_no: 0.88, under_35: 0.75,
    away_under_15: 0.72, home_under_15: 0.72,
    dnb_home: 0.65, dnb_away: 0.65,
    double_chance_home: 0.60, double_chance_away: 0.60,
  },
  chaotic_unreliable: {},
};

export function getTacticalFit(marketKey: string, script: ScriptOutput): number {
  if (script.primary === 'chaotic_unreliable') return CHAOTIC_TACTICAL_FIT;

  const primaryMap = SCRIPT_MARKET_FIT[script.primary] || {};
  const primaryFit = primaryMap[marketKey];
  if (primaryFit != null) return primaryFit;

  if (script.secondary && script.secondary !== 'chaotic_unreliable') {
    const secondaryFit = (SCRIPT_MARKET_FIT[script.secondary] || {})[marketKey];
    if (secondaryFit != null) return secondaryFit * SECONDARY_SCRIPT_WEIGHT;
  }

  return DEFAULT_TACTICAL_FIT;
}
