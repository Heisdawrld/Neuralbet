// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — The Meta-Decision Engine
//
// This is where ALL the intelligence comes together.
// The Punter Brain doesn't just predict — it DECIDES.
//
// The decision framework:
// 1. What do the stats say? (5 models → ensemble)
// 2. What does the situation say? (contextual adjustments)
// 3. What does the market say? (value detection)
// 4. What's the risk? (risk assessment)
// 5. DECISION: Bet, small bet, watch, or PASS
//
// A punter's hierarchy:
// - PASS when risk is too high (capital preservation)
// - WATCH when there's potential but not enough conviction
// - SMALL BET when there's value but low confidence
// - BET when there's clear value with decent confidence
// - STRONG BET when everything aligns (rare, maybe 2-3 per week)
// ═══════════════════════════════════════════════════════════════════════

import type {
  ModelPrediction,
  SituationalFactors,
  MarketData,
  RiskAssessment,
  PunterDecision,
  DecisionAction,
} from './types';
import { modelMarketAlignment } from './intelligence/market';
import { clamp } from './utils';

const ENGINE_VERSION = '2.0.0';

// ── Dynamic Model Weights ─────────────────────────────────────────────
// These aren't static. They adapt based on data availability and quality.
// xG is king when available. Form is noisy. Elo is reliable but slow.

const DEFAULT_WEIGHTS = {
  elo: 0.22,
  poisson: 0.22,
  xg: 0.25,
  form: 0.13,
  attackDefense: 0.18,
};

interface EnsembleInput {
  models: {
    elo: ModelPrediction;
    poisson: ModelPrediction;
    xg: ModelPrediction;
    form: ModelPrediction;
    attackDefense: ModelPrediction;
  };
  hasStatsData: boolean;
  hasXgData: boolean;
  homeFormLength: number;
  awayFormLength: number;
  hasHomeElo: boolean;
  hasAwayElo: boolean;
}

/**
 * Calculate dynamic weights based on data quality and availability.
 *
 * A punter trusts the data that's EARNED trust:
 * - xG with 20 matches = heavy weight
 * - xG with 3 matches = reduced weight
 * - Form with 2 matches = barely count it
 * - Elo with 0 matches = just a starting point
 */
export function calculateDynamicWeights(input: EnsembleInput): {
  elo: number;
  poisson: number;
  xg: number;
  form: number;
  attackDefense: number;
} {
  let weights = { ...DEFAULT_WEIGHTS };

  // ── xG Data Quality ─────────────────────────────────────────────
  // xG is the most predictive model when we have enough data
  if (input.hasXgData) {
    weights.xg = 0.28; // Boost xG when data is good
    weights.poisson = 0.20; // Reduce Poisson (redundant with xG)
  } else {
    weights.xg = 0.08; // Very low weight without data
    weights.poisson = 0.28; // Fall back to Poisson
  }

  // ── Form Data Quality ───────────────────────────────────────────
  const minFormLength = Math.min(input.homeFormLength, input.awayFormLength);
  if (minFormLength < 3) {
    weights.form = 0.06; // Almost useless with <3 matches
    // Redistribute to more reliable models
    const redistributed = DEFAULT_WEIGHTS.form - 0.06;
    weights.elo += redistributed * 0.35;
    weights.poisson += redistributed * 0.3;
    weights.xg += redistributed * 0.35;
  } else if (minFormLength >= 5) {
    weights.form = 0.15; // Decent weight with 5+ matches
  }

  // ── Elo Data Quality ────────────────────────────────────────────
  if (!input.hasHomeElo || !input.hasAwayElo) {
    weights.elo = 0.10; // Default Elo is just a guess
    const redistributed = DEFAULT_WEIGHTS.elo - 0.10;
    weights.poisson += redistributed * 0.4;
    weights.xg += redistributed * 0.3;
    weights.attackDefense += redistributed * 0.3;
  }

  // ── No Stats Data At All ────────────────────────────────────────
  if (!input.hasStatsData) {
    weights.poisson = 0.10;
    weights.attackDefense = 0.10;
    weights.xg = 0.05;
    weights.elo = 0.40;
    weights.form = 0.35;
  }

  // Normalize weights to sum to 1
  const total = weights.elo + weights.poisson + weights.xg + weights.form + weights.attackDefense;
  if (total > 0) {
    weights.elo /= total;
    weights.poisson /= total;
    weights.xg /= total;
    weights.form /= total;
    weights.attackDefense /= total;
  }

  return {
    elo: Math.round(weights.elo * 1000) / 1000,
    poisson: Math.round(weights.poisson * 1000) / 1000,
    xg: Math.round(weights.xg * 1000) / 1000,
    form: Math.round(weights.form * 1000) / 1000,
    attackDefense: Math.round(weights.attackDefense * 1000) / 1000,
  };
}

/**
 * Combine model predictions using dynamic weights.
 *
 * Unlike v1, we weight by model RELIABILITY too, not just data availability.
 * A reliable model that says 60% is worth more than an unreliable one that says 80%.
 */
export function combineModels(
  models: EnsembleInput['models'],
  weights: ReturnType<typeof calculateDynamicWeights>
): {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
} {
  const modelList = [
    models.elo,
    models.poisson,
    models.xg,
    models.form,
    models.attackDefense,
  ];
  const weightList = [
    weights.elo,
    weights.poisson,
    weights.xg,
    weights.form,
    weights.attackDefense,
  ];

  // Reliability-weighted combination
  // Each model's weight is multiplied by its reliability
  let totalReliabilityWeight = 0;
  const adjustedWeights = weightList.map((w, i) => {
    const adjW = w * modelList[i].reliability;
    totalReliabilityWeight += adjW;
    return adjW;
  });

  // If all reliabilities are 0, fall back to equal weights
  if (totalReliabilityWeight === 0) {
    return {
      homeWinProb: 0.42,
      drawProb: 0.28,
      awayWinProb: 0.30,
      homeExpectedGoals: 1.35,
      awayExpectedGoals: 1.15,
    };
  }

  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  let homeExpectedGoals = 0;
  let awayExpectedGoals = 0;

  for (let i = 0; i < modelList.length; i++) {
    const w = adjustedWeights[i] / totalReliabilityWeight;
    homeWinProb += w * modelList[i].homeWinProb;
    drawProb += w * modelList[i].drawProb;
    awayWinProb += w * modelList[i].awayWinProb;
    homeExpectedGoals += w * modelList[i].homeExpectedGoals;
    awayExpectedGoals += w * modelList[i].awayExpectedGoals;
  }

  // Normalize
  const total = homeWinProb + drawProb + awayWinProb;
  if (total === 0) {
    return {
      homeWinProb: 0.42,
      drawProb: 0.28,
      awayWinProb: 0.30,
      homeExpectedGoals: 1.35,
      awayExpectedGoals: 1.15,
    };
  }

  return {
    homeWinProb: homeWinProb / total,
    drawProb: drawProb / total,
    awayWinProb: awayWinProb / total,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
  };
}

/**
 * THE PUNTER'S DECISION.
 *
 * This is where a human punter would sit back, look at everything,
 * and decide: "Do I bet this? How much? Or do I walk away?"
 *
 * Decision framework:
 * 1. STRONG BET: High confidence + clear value + low risk + model & market agree
 * 2. BET: Good confidence + value exists + manageable risk
 * 3. SMALL BET: Some value but lower confidence or higher risk
 * 4. WATCH: Interesting but too many unknowns — follow the result
 * 5. PASS: Not worth the risk — walk away
 *
 * The hardest skill in betting is knowing when to PASS.
 * Most money is lost on bets that should have been passes.
 */
export function makePunterDecision(
  confidence: number,
  risk: RiskAssessment,
  situation: SituationalFactors,
  market: MarketData,
  bestValueBet: { edge: number; valueRating: number } | null,
  homeWinProb: number,
  awayWinProb: number
): PunterDecision {
  // ── Decision Logic ───────────────────────────────────────────────

  const maxProb = Math.max(homeWinProb, awayWinProb);
  const alignment = modelMarketAlignment(homeWinProb, awayWinProb, market);

  // Start with the assumption: PASS (default safe)
  let action: DecisionAction = 'pass';
  let reasoning = '';
  let decisionConfidence = 0;
  let isContrarian = false;
  let isSafePlay = false;
  let riskRewardScore = 0;

  // ── Absolute Blocks — Always PASS ────────────────────────────────
  if (risk.riskLevel === 'avoid') {
    return {
      action: 'pass',
      reasoning: 'Too risky — ' + risk.riskFactors.slice(0, 2).join(', '),
      primaryRecommendation: null,
      decisionConfidence: 0.9,
      isContrarian: false,
      isSafePlay: false,
      riskRewardScore: 0,
    };
  }

  if (situation.homeMotivation === 'dead-rubber' && situation.awayMotivation === 'dead-rubber') {
    return {
      action: 'pass',
      reasoning: 'Both teams have nothing to play for — too unpredictable',
      primaryRecommendation: null,
      decisionConfidence: 0.85,
      isContrarian: false,
      isSafePlay: false,
      riskRewardScore: 0.1,
    };
  }

  if (confidence < 0.2) {
    return {
      action: 'pass',
      reasoning: 'Very low confidence — models disagree or data is insufficient',
      primaryRecommendation: null,
      decisionConfidence: 0.7,
      isContrarian: false,
      isSafePlay: false,
      riskRewardScore: 0.1,
    };
  }

  // ── Value Assessment ─────────────────────────────────────────────
  const hasValue = bestValueBet !== null && bestValueBet.edge > 0.05;
  const hasStrongValue = bestValueBet !== null && bestValueBet.edge > 0.10;
  const hasDecentValue = bestValueBet !== null && bestValueBet.edge > 0.07;

  // ── Safety Assessment ────────────────────────────────────────────
  isSafePlay = alignment.aligned && hasValue && risk.riskLevel === 'low' || risk.riskLevel === 'very-low';
  isContrarian = !alignment.aligned && hasValue && confidence > 0.5;

  // ── Risk-Reward Score ────────────────────────────────────────────
  if (hasValue && bestValueBet) {
    // Risk-reward = edge × confidence / risk
    const riskMultiplier = risk.riskLevel === 'very-low' ? 1.2
      : risk.riskLevel === 'low' ? 1.0
      : risk.riskLevel === 'medium' ? 0.7
      : risk.riskLevel === 'high' ? 0.4
      : 0.2;
    riskRewardScore = clamp(bestValueBet.edge * confidence * riskMultiplier * 5, 0, 1);
  }

  // ── Decision Tree ────────────────────────────────────────────────

  // STRONG BET: Everything aligns
  if (
    confidence > 0.65 &&
    hasStrongValue &&
    (risk.riskLevel === 'very-low' || risk.riskLevel === 'low') &&
    alignment.aligned &&
    maxProb > 0.45
  ) {
    action = 'strong-bet';
    reasoning = 'High confidence, strong value, low risk — the punter goes big';
    decisionConfidence = 0.85;
  }
  // BET: Good alignment
  else if (
    confidence > 0.5 &&
    hasDecentValue &&
    (risk.riskLevel === 'very-low' || risk.riskLevel === 'low' || risk.riskLevel === 'medium') &&
    maxProb > 0.4
  ) {
    action = 'bet';
    reasoning = alignment.aligned
      ? 'Good confidence with value — model and market agree'
      : 'Good value detected despite market disagreement — contrarian play';
    decisionConfidence = 0.7;
  }
  // SMALL BET: Some edge but concerns
  else if (
    confidence > 0.35 &&
    hasValue &&
    risk.riskLevel !== 'very-high' &&
    maxProb > 0.38
  ) {
    action = 'small-bet';
    reasoning = risk.situationalRisk
      ? 'Value exists but situational risk — keep stakes small'
      : 'Moderate confidence with edge — worth a small punt';
    decisionConfidence = 0.55;
  }
  // WATCH: Interesting but not enough conviction
  else if (
    confidence > 0.3 &&
    (hasValue || maxProb > 0.45)
  ) {
    action = 'watch';
    reasoning = risk.dataReliabilityIssue
      ? 'Potential value but data is thin — watch and learn'
      : 'Interesting match but not enough conviction to bet';
    decisionConfidence = 0.4;
  }
  // PASS: The default
  else {
    action = 'pass';
    if (!hasValue) {
      reasoning = 'No value detected — market has this priced right';
    } else if (risk.riskLevel === 'high' || risk.riskLevel === 'very-high') {
      reasoning = 'Value exists but risk is too high — the punter walks away';
    } else {
      reasoning = 'Not enough confidence or value — sit this one out';
    }
    decisionConfidence = 0.6;
  }

  // ── Primary Recommendation ───────────────────────────────────────
  let primaryRecommendation: string | null = null;
  if (action !== 'pass' && action !== 'watch' && bestValueBet) {
    const favorite = homeWinProb > awayWinProb ? 'Home' : 'Away';
    primaryRecommendation = `${favorite} win at value`;
  }

  return {
    action,
    reasoning,
    primaryRecommendation,
    decisionConfidence,
    isContrarian,
    isSafePlay,
    riskRewardScore,
  };
}

export { ENGINE_VERSION };
