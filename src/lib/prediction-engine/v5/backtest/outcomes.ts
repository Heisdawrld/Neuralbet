// ═══════════════════════════════════════════════════════════════════════
// Map a finished match (final score) to outcomes for every market
//
// Given (homeScore, awayScore) for a finished match, return a map of
// marketKey → 0/1 reflecting whether each market hit.
//
// This is the GROUND TRUTH the backtest scores predictions against.
// Pure function — same input → same output, always.
// ═══════════════════════════════════════════════════════════════════════

export type MarketOutcome = 0 | 1;

/**
 * Return outcome (0 = lost, 1 = won) for every market we predict, given
 * a finished match's final score. Markets we can't determine from goals
 * alone (cards, corners, halftime, etc.) are omitted.
 */
export function marketOutcomesFromScore(
  homeScore: number, awayScore: number,
): Record<string, MarketOutcome> {
  const total = homeScore + awayScore;
  const homeWin = homeScore > awayScore ? 1 : 0;
  const awayWin = awayScore > homeScore ? 1 : 0;
  const draw = homeScore === awayScore ? 1 : 0;
  const btts = homeScore > 0 && awayScore > 0 ? 1 : 0;
  const homeMargin = homeScore - awayScore;

  // Asian handicap helpers
  // homeMargin >= 2  → home -1 wins
  // homeMargin <= -2 → away -1 wins
  // homeMargin >= 0  → home +1 wins (home wins, draws, or only loses by 0 — i.e. not loses by 1+)
  // homeMargin >= -1 means home doesn't lose by 2+ — that's the +1 handicap

  return {
    // 1X2
    home_win: homeWin as MarketOutcome,
    draw: draw as MarketOutcome,
    away_win: awayWin as MarketOutcome,
    // Double chance
    double_chance_home: (homeWin || draw) as MarketOutcome,
    double_chance_away: (awayWin || draw) as MarketOutcome,
    // Draw No Bet — draw = push (we treat push as no outcome; backtest skips)
    // We include 0/1 for the cases where it's NOT a draw
    dnb_home: draw ? 0 : (homeWin as MarketOutcome),
    dnb_away: draw ? 0 : (awayWin as MarketOutcome),
    // Totals
    over_05: (total > 0.5 ? 1 : 0) as MarketOutcome,
    over_15: (total > 1.5 ? 1 : 0) as MarketOutcome,
    over_25: (total > 2.5 ? 1 : 0) as MarketOutcome,
    over_35: (total > 3.5 ? 1 : 0) as MarketOutcome,
    under_15: (total < 1.5 ? 1 : 0) as MarketOutcome,
    under_25: (total < 2.5 ? 1 : 0) as MarketOutcome,
    under_35: (total < 3.5 ? 1 : 0) as MarketOutcome,
    // BTTS
    btts_yes: btts as MarketOutcome,
    btts_no: (1 - btts) as MarketOutcome,
    // Team totals — home
    home_over_05: (homeScore > 0.5 ? 1 : 0) as MarketOutcome,
    home_over_15: (homeScore > 1.5 ? 1 : 0) as MarketOutcome,
    home_over_25: (homeScore > 2.5 ? 1 : 0) as MarketOutcome,
    home_under_15: (homeScore < 1.5 ? 1 : 0) as MarketOutcome,
    // Team totals — away
    away_over_05: (awayScore > 0.5 ? 1 : 0) as MarketOutcome,
    away_over_15: (awayScore > 1.5 ? 1 : 0) as MarketOutcome,
    away_over_25: (awayScore > 2.5 ? 1 : 0) as MarketOutcome,
    away_under_15: (awayScore < 1.5 ? 1 : 0) as MarketOutcome,
    // Asian handicaps
    handicap_home_minus1: (homeMargin >= 2 ? 1 : 0) as MarketOutcome,
    handicap_away_minus1: (homeMargin <= -2 ? 1 : 0) as MarketOutcome,
    handicap_home_plus1: (homeMargin >= 0 ? 1 : 0) as MarketOutcome,
    handicap_away_plus1: (homeMargin <= 0 ? 1 : 0) as MarketOutcome,
  };
}

/**
 * Map V5 calibratedProbs keys (camelCase) to backtest market keys (snake_case).
 * V5 emits both naming styles depending on the layer, so we normalise here.
 */
export const PROB_KEY_TO_MARKET_KEY: Record<string, string> = {
  homeWin: 'home_win',
  draw: 'draw',
  awayWin: 'away_win',
  over05: 'over_05',
  over15: 'over_15',
  over25: 'over_25',
  over35: 'over_35',
  under15: 'under_15',
  under25: 'under_25',
  under35: 'under_35',
  bttsYes: 'btts_yes',
  bttsNo: 'btts_no',
  homeOver05: 'home_over_05',
  homeOver15: 'home_over_15',
  homeOver25: 'home_over_25',
  homeUnder15: 'home_under_15',
  awayOver05: 'away_over_05',
  awayOver15: 'away_over_15',
  awayOver25: 'away_over_25',
  awayUnder15: 'away_under_15',
  handicapHome1: 'handicap_home_minus1',
  handicapAwayMinus1: 'handicap_away_minus1',
  handicapHomePlus1: 'handicap_home_plus1',
  handicapAway1: 'handicap_away_plus1',
};
