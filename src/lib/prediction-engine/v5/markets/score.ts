// ═══════════════════════════════════════════════════════════════════════
// scoreMarketCandidates — the heavy-weight scoring function
//
// Computes a final score in [-0.5, 1.0] for each candidate based on:
//
//   POSITIVE COMPONENTS                       weight
//   ───────────────────                       ──────
//   modelConfidenceScore (model prob)          0.12
//   marketEdgeComponent (edge × bookmaker EV)  0.19
//   tacticalFitComponent                       0.12
//   predictabilityComponent (data × chaos)     0.08
//   dataSupportComponent                       0.07
//   formMomentumComponent                      0.03
//   volatilityAdjustment (variable)            ±0.08
//   EV bonus (when edge ≥ 5%)                  +0.08
//
//   NEGATIVE COMPONENTS                       weight
//   ───────────────────                       ──────
//   riskPenaltyScore (vol × market type)       up to ~0.5
//   productPenaltyScore (bad-market filter)    0.14 × (0..1)
//
// Also emits per-candidate `advisor_status` (BET / ACCA / SKIP),
// `ev`, `tacticalFitScore`, `badMarketPenalty`, `volatilityAdjustment`.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum } from '../xg/shared';
import type { MarketCandidate, ScriptOutput } from '../types';
import { getTacticalFit } from './tactical-fit';

// ─────────────────────────────────────────────────────────────────────
// SCORING CONSTANTS — single source of truth
// ─────────────────────────────────────────────────────────────────────

// Component weights (must sum to less than 1 — penalties absorb the rest)
export const W_MODEL_CONFIDENCE = 0.12;
export const W_MARKET_EDGE = 0.19;
export const W_TACTICAL_FIT = 0.12;
export const W_PREDICTABILITY = 0.08;
export const W_DATA_SUPPORT = 0.07;
export const W_FORM_MOMENTUM = 0.03;

// Edge sub-component weights (inside W_MARKET_EDGE)
export const EDGE_RAW_WEIGHT = 0.4;
export const EDGE_EV_WEIGHT = 0.6;
export const EDGE_SCALE = 5;      // raw edge multiplier
export const EV_SCALE = 3;        // EV multiplier

// Predictability composition
export const PRED_DATA_WEIGHT = 0.5;
export const PRED_INV_CHAOS_WEIGHT = 0.3;
export const PRED_INV_UPSET_WEIGHT = 0.2;

// Tactical matchup bonuses (when tacticalMatchup feature present)
export const TACTICAL_MATCHUP_BONUS = 0.2;

// Volatility-as-market-signal
export const VOL_TRIGGER_THRESHOLD = 0.55;
export const VOL_OVERS_BOOST_SCALE = 0.15;
export const VOL_OVERS_BOOST_CAP = 0.08;
export const VOL_UNDERS_PENALTY_SCALE = 0.10;
export const VOL_UNDERS_PENALTY_CAP = 0.06;
export const VOL_WINS_PENALTY_SCALE = 0.12;
export const VOL_WINS_PENALTY_CAP = 0.08;

// Script mismatch penalty
export const SCRIPT_MISMATCH_PENALTY = 0.5;
export const W_SCRIPT_MISMATCH = 0.12;

// Data starvation
export const DATA_STARVATION_MIN_MATCHES = 5;
export const DATA_STARVATION_PENALTY = 0.35;

// Risk penalty weights
export const W_RISK_OVERS_VOL = 0.08;
export const W_RISK_GENERAL_VOL = 0.14;

// Form momentum
export const FORM_GAP_THRESHOLD = 0.2;
export const FORM_MOMENTUM_BASE = 0.3;
export const FORM_MOMENTUM_BOOSTED = 0.6;

// EV bonus
export const EV_BONUS_EDGE_THRESHOLD = 0.05;
export const EV_BONUS_VALUE = 0.08;

// Bad-market product penalty weight
export const W_BAD_MARKET_PENALTY = 0.14;

// Final score clamp
export const FINAL_SCORE_MIN = -0.5;
export const FINAL_SCORE_MAX = 1.0;

// Advisor status thresholds
export const ADVISOR_FIRE_PROB = 0.72;
export const ADVISOR_FIRE_ODDS = 1.30;
export const ADVISOR_PRED_LOW_FOR_ACCA = 0.20;
export const ADVISOR_BAND2_PROB = 0.58;
export const ADVISOR_BAND2_MIN_ODDS = 1.30;
export const ADVISOR_BAND2_MAX_ODDS = 1.65;
export const ADVISOR_BAND3_PROB = 0.60;
export const ADVISOR_BAND3_MIN_ODDS = 1.25;
export const ADVISOR_BAND4_PROB = 0.50;

// ─────────────────────────────────────────────────────────────────────
// BAD-MARKET PENALTIES — markets with known bias toward poor ROI
// ─────────────────────────────────────────────────────────────────────

/** A bad-market penalty function returns a value in [0, 1] — higher = worse.
 *  The final penalty is multiplied by W_BAD_MARKET_PENALTY. */
export const BAD_MARKET_PENALTY: Record<string, (c: MarketCandidate) => number> = {
  home_over_05: () => 0.9,
  away_over_05: () => 0.9,
  home_under_15: () => 0.45,
  away_under_15: () => 0.45,
  win_either_half_home: () => 0.3,
  win_either_half_away: () => 0.3,

  // Under 3.5 only OK above 0.72 prob (high model conviction). Below that, penalise.
  under_35: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.72) * 2.5, 0, 0.65),

  // Over 1.5: penalise when odds are short (no value) or short + low score.
  over_15: (c) => {
    const odds = safeNum(c.bookmakerOdds, 0);
    const prob = safeNum(c.modelProbability, 0);
    if (odds > 1.0 && odds < 1.30) return 0.80;
    if (odds >= 1.30 && odds < 1.40) return clamp(0.25 + (0.40 - prob) * 1.5, 0.10, 0.45);
    return 0;
  },

  // DNB: penalise hubris (very high model prob in a binary market).
  dnb_home: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.60) * 1.0, 0, 0.4),
  dnb_away: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.60) * 1.0, 0, 0.4),

  // Double chance: penalise hubris more aggressively (very high prob already priced in).
  double_chance_home: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.60) * 1.8, 0, 0.8),
  double_chance_away: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.60) * 1.8, 0, 0.8),
};

// ─────────────────────────────────────────────────────────────────────
// Helper: rounded scalar
// ─────────────────────────────────────────────────────────────────────
function round3(num: number): number {
  return Math.round(num * 1000) / 1000;
}
function round4(num: number): number {
  return Math.round(num * 10000) / 10000;
}

// ─────────────────────────────────────────────────────────────────────
// Advisor status
// ─────────────────────────────────────────────────────────────────────
export function computeAdvisorStatus(
  prob: number, odds: number, isPositiveEV: boolean, predScore: number,
): 'BET' | 'ACCA' | 'SKIP' {
  if (prob >= ADVISOR_FIRE_PROB && odds >= ADVISOR_FIRE_ODDS) {
    return predScore < ADVISOR_PRED_LOW_FOR_ACCA ? 'ACCA' : 'BET';
  }
  if (prob >= ADVISOR_BAND2_PROB
      && odds >= ADVISOR_BAND2_MIN_ODDS && odds <= ADVISOR_BAND2_MAX_ODDS) {
    return isPositiveEV ? 'ACCA' : 'SKIP';
  }
  if (prob >= ADVISOR_BAND3_PROB && odds >= ADVISOR_BAND3_MIN_ODDS) {
    return isPositiveEV ? 'ACCA' : 'SKIP';
  }
  if (prob >= ADVISOR_BAND4_PROB && isPositiveEV) return 'ACCA';
  return 'SKIP';
}

// ─────────────────────────────────────────────────────────────────────
// Main scorer
// ─────────────────────────────────────────────────────────────────────
export function scoreMarketCandidates(
  candidates: MarketCandidate[],
  script: ScriptOutput,
  fv: any,
): MarketCandidate[] {
  // Match-level signals (computed once per fixture)
  const dataSupportScore = clamp(safeNum(fv.dataCompletenessScore, 0.5), 0, 1);
  const volatilityPenalty = clamp(safeNum(fv.matchChaosScore, 0.5), 0, 1);
  const homeMatches = safeNum(fv.homeMatchesAvailable, 10);
  const awayMatches = safeNum(fv.awayMatchesAvailable, 10);
  const isDataStarved = homeMatches < DATA_STARVATION_MIN_MATCHES || awayMatches < DATA_STARVATION_MIN_MATCHES;
  const starvationPenalty = isDataStarved ? DATA_STARVATION_PENALTY : 0;

  const matchChaos = safeNum(fv.matchChaosScore, 0.5);
  const upsetRisk = safeNum(fv.upsetRiskScore, 0.5);
  const predScore = dataSupportScore * PRED_DATA_WEIGHT
                  + (1 - matchChaos) * PRED_INV_CHAOS_WEIGHT
                  + (1 - upsetRisk) * PRED_INV_UPSET_WEIGHT;

  const homePointsLast5 = safeNum(fv.homePointsLast5, 5);
  const awayPointsLast5 = safeNum(fv.awayPointsLast5, 5);
  const formGap = (homePointsLast5 - awayPointsLast5) / 15;

  return candidates.map((candidate) => {
    const marketKey = candidate.marketKey;
    const modelConfidenceScore = clamp(safeNum(candidate.modelProbability, 0), 0, 1);
    const rawEdge = safeNum(candidate.edge, 0);
    const edgeScore = candidate.edge != null ? clamp(rawEdge * EDGE_SCALE, -1, 1) : 0;
    const evScore = candidate.bookmakerOdds && candidate.bookmakerOdds > 1.0
      ? clamp((candidate.modelProbability * candidate.bookmakerOdds - 1) * EV_SCALE, -1, 1)
      : 0;
    const combinedEdgeScore = edgeScore * EDGE_RAW_WEIGHT + evScore * EDGE_EV_WEIGHT;

    // Tactical fit (+matchup bonus when available)
    let tacticalFitScore = getTacticalFit(marketKey, script);
    if (fv.tacticalMatchup) {
      const tm = fv.tacticalMatchup;
      if (marketKey.includes('home') && tm.homeStyleEdge > 0) tacticalFitScore += TACTICAL_MATCHUP_BONUS;
      if (marketKey.includes('away') && tm.awayStyleEdge > 0) tacticalFitScore += TACTICAL_MATCHUP_BONUS;
      tacticalFitScore = clamp(tacticalFitScore, 0, 1);
    }

    // Volatility-as-market-signal
    let volatilityAdjustment = 0;
    if (volatilityPenalty > VOL_TRIGGER_THRESHOLD) {
      if (marketKey.includes('over') || marketKey === 'btts_yes') {
        volatilityAdjustment = clamp(volatilityPenalty * VOL_OVERS_BOOST_SCALE, 0, VOL_OVERS_BOOST_CAP);
      } else if (marketKey.includes('under') || marketKey === 'btts_no') {
        volatilityAdjustment = -clamp(volatilityPenalty * VOL_UNDERS_PENALTY_SCALE, 0, VOL_UNDERS_PENALTY_CAP);
      } else if (marketKey.includes('win') && !marketKey.includes('either')) {
        volatilityAdjustment = -clamp(volatilityPenalty * VOL_WINS_PENALTY_SCALE, 0, VOL_WINS_PENALTY_CAP);
      }
    }

    // Bad-market product penalty
    const badMarketPenaltyFn = BAD_MARKET_PENALTY[marketKey];
    const badMarketPenalty = badMarketPenaltyFn ? badMarketPenaltyFn(candidate) : 0;

    // Script mismatch penalty
    let scriptMismatchPenalty = 0;
    if (script.primary === 'tight_low_event' && marketKey.includes('over')) {
      scriptMismatchPenalty = SCRIPT_MISMATCH_PENALTY;
    } else if (script.primary === 'open_end_to_end' && marketKey.includes('under')) {
      scriptMismatchPenalty = SCRIPT_MISMATCH_PENALTY;
    }

    // Form momentum
    let formMomentumScore = FORM_MOMENTUM_BASE;
    if (marketKey.includes('home') && formGap > FORM_GAP_THRESHOLD) {
      formMomentumScore = FORM_MOMENTUM_BOOSTED;
    } else if (marketKey.includes('away') && formGap < -FORM_GAP_THRESHOLD) {
      formMomentumScore = FORM_MOMENTUM_BOOSTED;
    }

    // Risk penalty composition
    const overSensitivity = marketKey.includes('over') || marketKey === 'btts_yes'
      ? W_RISK_OVERS_VOL : W_RISK_GENERAL_VOL;
    const riskPenaltyScore = overSensitivity * volatilityPenalty
                           + W_SCRIPT_MISMATCH * scriptMismatchPenalty
                           + starvationPenalty;
    const productPenaltyScore = W_BAD_MARKET_PENALTY * badMarketPenalty;

    // Final score
    let finalScore =
        W_MODEL_CONFIDENCE * modelConfidenceScore
      + W_MARKET_EDGE * combinedEdgeScore
      + W_TACTICAL_FIT * tacticalFitScore
      + W_PREDICTABILITY * predScore
      + W_DATA_SUPPORT * dataSupportScore
      + W_FORM_MOMENTUM * formMomentumScore
      + volatilityAdjustment
      - riskPenaltyScore
      - productPenaltyScore;

    // EV bonus
    if (candidate.impliedProbability && candidate.impliedProbability > 0 && (candidate.edge ?? 0) >= EV_BONUS_EDGE_THRESHOLD) {
      finalScore += EV_BONUS_VALUE;
    }

    // Advisor status
    const odds = safeNum(candidate.bookmakerOdds, 0);
    const prob = safeNum(candidate.modelProbability, 0);
    const ev = odds > 1.0 ? prob * odds - 1 : null;
    const isPositiveEV = ev != null && ev >= 0;
    const advisorStatus = computeAdvisorStatus(prob, odds, isPositiveEV, predScore);

    return {
      ...candidate,
      tacticalFitScore: round3(tacticalFitScore),
      badMarketPenalty: round3(badMarketPenalty),
      finalScore: round4(clamp(finalScore, FINAL_SCORE_MIN, FINAL_SCORE_MAX)),
      advisor_status: advisorStatus,
      ev: ev ?? null,
      volatilityAdjustment: round4(volatilityAdjustment),
    };
  });
}
