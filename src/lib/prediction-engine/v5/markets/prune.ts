// ═══════════════════════════════════════════════════════════════════════
// pruneWeakCandidates — discard candidates that don't meet selection floors
//
// Each market has its own minimum probability gate (MARKET_MIN_PROB).
// Markets without a specific gate use DEFAULT_MIN_PROB.
//
// A SMART RISK EXCEPTION lets a candidate slightly below its market floor
// through IF it has positive EV + high tactical fit + good data + isn't a
// "comfort market" (where low odds combined with high prob = low ROI).
//
// Additional safety filters:
//   • Value trap: edge > 35% almost always means stale odds — kill it
//   • Under 3.5 comfort guard: requires ≥74% prob (this market is a
//     "comfort blanket" and over-picked when allowed)
//   • Over 1.5 comfort guard: short-odds + weak score → discard
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import type { MarketCandidate, ScriptOutput } from '../types';

export const DEFAULT_MIN_PROB = 0.42;
export const MIN_TACTICAL_FIT = 0.05;

/** Per-market minimum probability — overrides DEFAULT_MIN_PROB. */
export const MARKET_MIN_PROB: Record<string, number> = {
  btts_yes: 0.48, btts_no: 0.50,
  double_chance_home: 0.52, double_chance_away: 0.52,
  draw: 0.42, home_win: 0.42, away_win: 0.42,
  dnb_home: 0.45, dnb_away: 0.45,
  over_25: 0.42, under_25: 0.42,
  over_15: 0.45, under_35: 0.55, over_35: 0.45,
};

// Smart risk exception thresholds
export const SMART_RISK_MIN_EV = 0.02;
export const SMART_RISK_MIN_TACTICAL = 0.65;
export const SMART_RISK_MIN_DATA = 0.40;
export const SMART_RISK_PROB_TOLERANCE = 0.08;

// "Comfort markets" never get the smart-risk exception
export const COMFORT_MARKETS = new Set([
  'under_35', 'over_15',
  'double_chance_home', 'double_chance_away',
  'home_over_05', 'away_over_05',
]);

// Value trap: edge > this likely means stale odds
export const VALUE_TRAP_EDGE = 0.35;

// Under 3.5 hard prob floor (additional comfort guard on top of MARKET_MIN_PROB)
export const UNDER35_HARD_FLOOR = 0.58;

// Over 1.5 comfort guards
export const OVER15_REJECT_SHORT_ODDS = 1.25;
export const OVER15_WEAK_SCORE_ODDS_THRESHOLD = 1.40;
export const OVER15_WEAK_SCORE_THRESHOLD = 0.35;

export function pruneWeakCandidates(
  scored: MarketCandidate[],
  fv: any,
  _script: ScriptOutput,
): MarketCandidate[] {
  const pruned: MarketCandidate[] = [];

  for (const c of scored) {
    const prob = safeNum(c.modelProbability, 0);
    const tactical = safeNum(c.tacticalFitScore, 0);
    const score = safeNum(c.finalScore, 0);
    const edge = safeNum(c.edge, 0);
    const odds = safeNum(c.bookmakerOdds, 0);
    const ev = odds > 1.0 ? prob * odds - 1 : 0;

    const marketFloor = MARKET_MIN_PROB[c.marketKey] ?? DEFAULT_MIN_PROB;

    // Probability floor (with smart-risk exception)
    if (prob < marketFloor) {
      const dataCompleteness = safeNum(fv.dataCompletenessScore, 0.5);
      const isComfortMarket = COMFORT_MARKETS.has(c.marketKey);
      const smartRiskException =
           ev >= SMART_RISK_MIN_EV
        && tactical >= SMART_RISK_MIN_TACTICAL
        && !isComfortMarket
        && prob >= marketFloor - SMART_RISK_PROB_TOLERANCE
        && dataCompleteness >= SMART_RISK_MIN_DATA;
      if (!smartRiskException) continue;
    }

    // Value trap
    if (edge > VALUE_TRAP_EDGE) continue;

    // Under 3.5 hard guard
    if (c.marketKey === 'under_35' && prob < UNDER35_HARD_FLOOR) continue;

    // Over 1.5 guards
    if (c.marketKey === 'over_15') {
      if (odds > 1.0 && odds < OVER15_REJECT_SHORT_ODDS) continue;
      if (odds >= OVER15_REJECT_SHORT_ODDS
          && odds < OVER15_WEAK_SCORE_ODDS_THRESHOLD
          && score < OVER15_WEAK_SCORE_THRESHOLD) continue;
    }

    if (tactical < MIN_TACTICAL_FIT) continue;
    if (score <= 0) continue;

    pruned.push(c);
  }

  return pruned;
}
