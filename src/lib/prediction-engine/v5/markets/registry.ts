// ═══════════════════════════════════════════════════════════════════════
// Market registry — the catalogue of every market the engine knows about
//
// Two pieces:
//   1. MARKET_REGISTRY: per-market config flags (selectable, requiresOdds,
//      headlineEligible). headlineEligible = whether this market is allowed
//      to be THE displayed top pick. Some markets (draw, dnb, home_over_25)
//      are model-internal only — they inform but never headline.
//   2. MARKET_DEFINITIONS: how to extract a candidate's modelProbability
//      from a calibrated probabilities map. Either a direct probKey lookup
//      or a `compute()` function for derived markets (double chance, DNB,
//      win-either-half).
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';

export interface MarketConfig {
  selectable: boolean;
  requiresOdds: boolean;
  headlineEligible: boolean;
}

export const MARKET_REGISTRY: Record<string, MarketConfig> = {
  home_win: { selectable: true, requiresOdds: true, headlineEligible: true },
  away_win: { selectable: true, requiresOdds: true, headlineEligible: true },
  draw: { selectable: true, requiresOdds: true, headlineEligible: false },
  over_15: { selectable: true, requiresOdds: true, headlineEligible: true },
  over_25: { selectable: true, requiresOdds: true, headlineEligible: true },
  over_35: { selectable: true, requiresOdds: true, headlineEligible: false },
  under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  under_25: { selectable: true, requiresOdds: true, headlineEligible: true },
  under_35: { selectable: true, requiresOdds: true, headlineEligible: true },
  btts_yes: { selectable: true, requiresOdds: true, headlineEligible: true },
  btts_no: { selectable: true, requiresOdds: true, headlineEligible: true },
  double_chance_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  double_chance_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_05: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_25: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_05: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_25: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  win_either_half_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  win_either_half_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  dnb_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  dnb_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  handicap_home_minus1: { selectable: true, requiresOdds: true, headlineEligible: true },
  handicap_away_minus1: { selectable: true, requiresOdds: true, headlineEligible: true },
  handicap_home_plus1: { selectable: true, requiresOdds: true, headlineEligible: false },
  handicap_away_plus1: { selectable: true, requiresOdds: true, headlineEligible: false },
};

export function isHeadlineEligibleMarket(marketKey: string): boolean {
  return MARKET_REGISTRY[marketKey]?.headlineEligible === true;
}

/** Approximation for "Win Either Half (home)": ~75% of home's chance to score at all. */
export const WIN_EITHER_HALF_HOME_FACTOR = 0.75;
/** Approximation for "Win Either Half (away)": ~70% of away's chance to score at all. */
export const WIN_EITHER_HALF_AWAY_FACTOR = 0.7;

export interface MarketDefinition {
  marketKey: string;
  selection: string;
  probKey?: string | null;
  compute?: (probs: Record<string, number>) => number;
}

export const MARKET_DEFINITIONS: MarketDefinition[] = [
  // 1X2
  { marketKey: 'home_win', selection: 'Home Win', probKey: 'homeWin' },
  { marketKey: 'away_win', selection: 'Away Win', probKey: 'awayWin' },
  { marketKey: 'draw', selection: 'Draw', probKey: 'draw' },
  // Double chance — derived
  { marketKey: 'double_chance_home', selection: 'Double Chance 1X',
    compute: (p) => safeNum(p.homeWin, 0) + safeNum(p.draw, 0) },
  { marketKey: 'double_chance_away', selection: 'Double Chance X2',
    compute: (p) => safeNum(p.awayWin, 0) + safeNum(p.draw, 0) },
  // Draw No Bet — derived (home win conditional on no draw)
  { marketKey: 'dnb_home', selection: 'Home Win (DNB)',
    compute: (p) => {
      const h = safeNum(p.homeWin, 0);
      const a = safeNum(p.awayWin, 0);
      const d = h + a;
      return d > 0.01 ? h / d : 0;
    } },
  { marketKey: 'dnb_away', selection: 'Away Win (DNB)',
    compute: (p) => {
      const h = safeNum(p.homeWin, 0);
      const a = safeNum(p.awayWin, 0);
      const d = h + a;
      return d > 0.01 ? a / d : 0;
    } },
  // Totals
  { marketKey: 'over_15', selection: 'Over 1.5 Goals', probKey: 'over15' },
  { marketKey: 'over_25', selection: 'Over 2.5 Goals', probKey: 'over25' },
  { marketKey: 'over_35', selection: 'Over 3.5 Goals', probKey: 'over35' },
  { marketKey: 'under_15', selection: 'Under 1.5 Goals', probKey: 'under15' },
  { marketKey: 'under_25', selection: 'Under 2.5 Goals', probKey: 'under25' },
  { marketKey: 'under_35', selection: 'Under 3.5 Goals', probKey: 'under35' },
  // BTTS
  { marketKey: 'btts_yes', selection: 'BTTS Yes', probKey: 'bttsYes' },
  { marketKey: 'btts_no', selection: 'BTTS No', probKey: 'bttsNo' },
  // Team totals
  { marketKey: 'home_over_05', selection: 'Home Over 0.5 Goals', probKey: 'homeOver05' },
  { marketKey: 'home_over_15', selection: 'Home Over 1.5 Goals', probKey: 'homeOver15' },
  { marketKey: 'home_over_25', selection: 'Home Over 2.5 Goals', probKey: 'homeOver25' },
  { marketKey: 'home_under_15', selection: 'Home Under 1.5 Goals', probKey: 'homeUnder15' },
  { marketKey: 'away_over_05', selection: 'Away Over 0.5 Goals', probKey: 'awayOver05' },
  { marketKey: 'away_over_15', selection: 'Away Over 1.5 Goals', probKey: 'awayOver15' },
  { marketKey: 'away_over_25', selection: 'Away Over 2.5 Goals', probKey: 'awayOver25' },
  { marketKey: 'away_under_15', selection: 'Away Under 1.5 Goals', probKey: 'awayUnder15' },
  // Win-either-half — derived approximations
  { marketKey: 'win_either_half_home', selection: 'Home Win Either Half',
    compute: (p) => safeNum(p.homeOver05, 0) * WIN_EITHER_HALF_HOME_FACTOR },
  { marketKey: 'win_either_half_away', selection: 'Away Win Either Half',
    compute: (p) => safeNum(p.awayOver05, 0) * WIN_EITHER_HALF_AWAY_FACTOR },
  // Asian handicaps
  { marketKey: 'handicap_home_minus1', selection: 'Home -1 (Handicap)', probKey: 'handicapHome1' },
  { marketKey: 'handicap_away_minus1', selection: 'Away -1 (Handicap)', probKey: 'handicapAwayMinus1' },
  { marketKey: 'handicap_home_plus1', selection: 'Home +1 (Handicap)', probKey: 'handicapHomePlus1' },
  { marketKey: 'handicap_away_plus1', selection: 'Away +1 (Handicap)', probKey: 'handicapAway1' },
];
