// ═══════════════════════════════════════════════════════════════════════
// Compute implied probabilities from bookmaker odds + derive engine edge
//
// edge = modelProbability - impliedProbability
//
// Positive edge means the engine thinks the outcome is more likely than
// the bookmaker is pricing — i.e. potential value bet.
//
// Naming variants: bookmakers/sources use many spellings for the same
// market. ODDS_MAP normalises them so the engine can look up by canonical
// marketKey regardless of upstream snapshot shape.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import type { MarketCandidate } from '../types';

/** All odds-key spellings BSD/Bzzoiro and other sources have used.
 *  Add new aliases here as they appear — DO NOT scatter the lookup logic. */
export const ODDS_MAP: Record<string, string[]> = {
  home_win: ['home_win', 'homeWin', 'home'],
  draw: ['draw', 'x', 'X'],
  away_win: ['away_win', 'awayWin', 'away'],
  over_15: ['over_15', 'over_1_5', 'over15', 'over_15_goals'],
  over_25: ['over_25', 'over_2_5', 'over25', 'over_25_goals'],
  over_35: ['over_35', 'over_3_5', 'over35', 'over_35_goals'],
  under_15: ['under_15', 'under_1_5', 'under15', 'under_15_goals'],
  under_25: ['under_25', 'under_2_5', 'under25', 'under_25_goals'],
  under_35: ['under_35', 'under_3_5', 'under35', 'under_35_goals'],
  btts_yes: ['btts_yes', 'bttsYes'],
  btts_no: ['btts_no', 'bttsNo'],
  double_chance_home: ['double_chance_1x', 'double_chance_1X'],
  double_chance_away: ['double_chance_x2', 'double_chance_X2'],
  dnb_home: ['draw_no_bet_home', 'dnb_home'],
  dnb_away: ['draw_no_bet_away', 'dnb_away'],
};

/** Return decimal odds for a market from a snapshot, or null if not priced. */
export function lookupOdds(marketKey: string, oddsSnapshot: Record<string, any> | null): number | null {
  if (!oddsSnapshot) return null;
  const keys = ODDS_MAP[marketKey] || [marketKey];
  for (const k of keys) {
    if (oddsSnapshot[k] != null) {
      const val = safeNum(oddsSnapshot[k], 0);
      if (val > 1.0) return val;
    }
  }
  return null;
}

function round4(num: number): number {
  return Math.round(num * 10000) / 10000;
}

/** Annotate each candidate with implied prob + edge + bookmaker odds. */
export function computeImpliedProbabilities(
  candidates: MarketCandidate[],
  oddsSnapshot: Record<string, any> | null,
): MarketCandidate[] {
  return candidates.map((candidate) => {
    const decimalOdds = lookupOdds(candidate.marketKey, oddsSnapshot);
    if (decimalOdds && decimalOdds > 1.0) {
      const impliedProbability = round4(1 / decimalOdds);
      const edge = round4(candidate.modelProbability - impliedProbability);
      return { ...candidate, impliedProbability, edge, bookmakerOdds: decimalOdds };
    }
    return { ...candidate, impliedProbability: null, edge: null, bookmakerOdds: null };
  });
}
