// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Market Intelligence
//
// The market KNOWS things. Bookmakers have analysts, data, and sharp
// bettors moving lines. A punter who ignores the market is a fool.
//
// Key principles:
// - If the market disagrees with you, ask WHY before betting
// - Large odds movements = sharp money = someone knows something
// - Low overround = efficient market = harder to find value
// - High overround = recreational market = more value opportunities
// - When our model AND the market agree = SAFEST bet
// ═══════════════════════════════════════════════════════════════════════

import type { MarketData, ValueBet } from '../types';
import { impliedProbability, calculateOverround, kellyCriterion, clamp } from '../utils';

/**
 * Build MarketData from BSD odds response.
 */
export function buildMarketData(odds: {
  home_win: number | null;
  draw: number | null;
  away_win: number | null;
  over_25_goals: number | null;
  under_25_goals: number | null;
  btts_yes: number | null;
  over_15_goals: number | null;
  over_35_goals: number | null;
}): MarketData {
  const homeWinOdds = odds.home_win;
  const drawOdds = odds.draw;
  const awayWinOdds = odds.away_win;

  const impliedHomeWin = homeWinOdds ? impliedProbability(homeWinOdds) : null;
  const impliedDraw = drawOdds ? impliedProbability(drawOdds) : null;
  const impliedAwayWin = awayWinOdds ? impliedProbability(awayWinOdds) : null;

  // Calculate overround
  const validOdds = [homeWinOdds, drawOdds, awayWinOdds].filter((o): o is number => o !== null);
  const overround = calculateOverround(validOdds);

  // Market confidence: how tight/efficient is the market?
  // Lower overround = more efficient = higher confidence
  let marketConfidence = 0.5; // Default moderate confidence
  if (overround !== null) {
    if (overround < 0.03) marketConfidence = 0.9; // Very efficient (sharp market)
    else if (overround < 0.05) marketConfidence = 0.8;
    else if (overround < 0.08) marketConfidence = 0.65;
    else if (overround < 0.12) marketConfidence = 0.5;
    else marketConfidence = 0.35; // Very inefficient (recreational market)
  }

  // If no odds at all, very low confidence
  if (!homeWinOdds && !awayWinOdds) marketConfidence = 0.1;

  return {
    homeWinOdds,
    drawOdds,
    awayWinOdds,
    over25Odds: odds.over_25_goals,
    under25Odds: odds.under_25_goals,
    bttsYesOdds: odds.btts_yes,
    over15Odds: odds.over_15_goals,
    over35Odds: odds.over_35_goals,
    impliedHomeWin,
    impliedDraw,
    impliedAwayWin,
    overround,
    marketConfidence,
  };
}

/**
 * Detect value bets by comparing model probabilities vs market.
 *
 * A punter only bets when there's VALUE — not just when they think
 * a team will win. The question is: "Is the price RIGHT?"
 *
 * Edge = Model Probability - Implied Probability
 * Only bet when edge > threshold AND confidence supports it.
 */
export function detectValueBets(
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  over25Prob: number,
  over15Prob: number,
  over35Prob: number,
  bttsProb: number,
  market: MarketData,
  homeTeam: string,
  awayTeam: string,
  confidence: number,
  riskLevel: string
): ValueBet[] {
  const valueBets: ValueBet[] = [];

  // Dynamic edge threshold based on market efficiency
  // More efficient markets need less edge (sharper prices)
  // Less efficient markets need more edge (we might be wrong)
  const baseEdgeThreshold = market.overround !== null && market.overround < 0.05
    ? 0.04 // Sharp market — small edge is meaningful
    : 0.06; // Recreational market — need bigger edge

  // Risk-adjusted threshold: higher risk = need more edge
  const riskMultiplier = riskLevel === 'very-high' || riskLevel === 'avoid'
    ? 2.0
    : riskLevel === 'high'
      ? 1.5
      : riskLevel === 'medium'
        ? 1.0
        : 0.8;
  const edgeThreshold = baseEdgeThreshold * riskMultiplier;

  // ── 1x2 Markets ─────────────────────────────────────────────────
  if (market.homeWinOdds) {
    valueBets.push(
      ...evaluateMarket(
        '1x2',
        homeTeam,
        homeWinProb,
        market.homeWinOdds,
        edgeThreshold,
        confidence,
        riskLevel
      )
    );
  }

  if (market.drawOdds) {
    valueBets.push(
      ...evaluateMarket(
        '1x2',
        'Draw',
        drawProb,
        market.drawOdds,
        edgeThreshold,
        confidence,
        riskLevel
      )
    );
  }

  if (market.awayWinOdds) {
    valueBets.push(
      ...evaluateMarket(
        '1x2',
        awayTeam,
        awayWinProb,
        market.awayWinOdds,
        edgeThreshold,
        confidence,
        riskLevel
      )
    );
  }

  // ── Over/Under Markets ──────────────────────────────────────────
  if (market.over25Odds) {
    valueBets.push(
      ...evaluateMarket(
        'Over/Under 2.5',
        'Over 2.5',
        over25Prob,
        market.over25Odds,
        edgeThreshold,
        confidence,
        riskLevel
      )
    );
  }

  if (market.over15Odds) {
    valueBets.push(
      ...evaluateMarket(
        'Over/Under 1.5',
        'Over 1.5',
        over15Prob,
        market.over15Odds,
        edgeThreshold,
        confidence,
        riskLevel
      )
    );
  }

  if (market.over35Odds) {
    valueBets.push(
      ...evaluateMarket(
        'Over/Under 3.5',
        'Over 3.5',
        over35Prob,
        market.over35Odds,
        edgeThreshold,
        confidence,
        riskLevel
      )
    );
  }

  // ── BTTS Market ─────────────────────────────────────────────────
  if (market.bttsYesOdds) {
    valueBets.push(
      ...evaluateMarket(
        'BTTS',
        'Yes',
        bttsProb,
        market.bttsYesOdds,
        edgeThreshold,
        confidence,
        riskLevel
      )
    );
  }

  // Sort by edge descending
  valueBets.sort((a, b) => b.edge - a.edge);

  return valueBets;
}

/**
 * Evaluate a single market for value.
 */
function evaluateMarket(
  market: string,
  selection: string,
  modelProb: number,
  odds: number,
  edgeThreshold: number,
  confidence: number,
  riskLevel: string
): ValueBet[] {
  const impliedProb = impliedProbability(odds);
  const edge = modelProb - impliedProb;

  if (edge <= edgeThreshold) return [];

  // Kelly Criterion — the theoretical optimal bet size
  const rawKelly = kellyCriterion(modelProb, odds);

  // Adjusted Kelly — the PUNTER'S Kelly
  // A real punter never bets full Kelly (too aggressive)
  // They scale by confidence and risk
  const confidenceMultiplier = clamp(confidence, 0.3, 1.0);
  const riskMultiplier = riskLevel === 'very-high' || riskLevel === 'avoid'
    ? 0.2
    : riskLevel === 'high'
      ? 0.4
      : riskLevel === 'medium'
        ? 0.6
        : 0.8;

  // Quarter Kelly base, scaled by confidence and risk
  const adjustedKelly = clamp(rawKelly * 0.25 * confidenceMultiplier * riskMultiplier, 0, 0.1);

  // Value rating (1-5 stars)
  // Based on edge × confidence — big edge with high confidence = 5 stars
  const edgeConfidence = edge * confidence;
  const valueRating = Math.min(5, Math.max(1, Math.round(edgeConfidence / 0.08 * 5)));

  // Is this actionable? A punter's criteria:
  // - Must have meaningful edge
  // - Must have reasonable confidence
  // - Must not be in a high-risk situation
  const isActionable =
    edge > edgeThreshold &&
    confidence > 0.3 &&
    riskLevel !== 'avoid' &&
    adjustedKelly > 0.005;

  return [{
    market,
    selection,
    modelProbability: modelProb,
    impliedProbability: impliedProb,
    odds,
    edge,
    kellyStake: rawKelly * 0.25, // Quarter Kelly (standard conservative)
    adjustedKelly,
    valueRating,
    isActionable,
  }];
}

/**
 * Check if our model agrees with the market direction.
 *
 * When model and market agree = SAFER bet (less contrarian risk)
 * When model disagrees with market = need more conviction
 */
export function modelMarketAlignment(
  homeWinProb: number,
  awayWinProb: number,
  market: MarketData
): {
  aligned: boolean;
  direction: string;
  disagreement: number;
} {
  if (!market.impliedHomeWin || !market.impliedAwayWin) {
    return { aligned: true, direction: 'unknown', disagreement: 0 };
  }

  const modelFavorite = homeWinProb > awayWinProb ? 'home' : 'away';
  const marketFavorite = market.impliedHomeWin > market.impliedAwayWin ? 'home' : 'away';

  const aligned = modelFavorite === marketFavorite;

  // How much do they disagree on the favorite's probability?
  const disagreement = Math.abs(
    Math.max(homeWinProb, awayWinProb) - Math.max(market.impliedHomeWin, market.impliedAwayWin)
  );

  return {
    aligned,
    direction: aligned ? 'same-favorite' : 'different-favorite',
    disagreement,
  };
}
