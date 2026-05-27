// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Risk Intelligence
//
// The most important module. A punter's edge isn't in finding winners —
// it's in knowing when NOT to bet.
//
// Risk assessment determines:
// - Should I bet this at all?
// - How much should I risk?
// - What could go wrong?
// - Am I being overconfident?
//
// A good punter loses less on bad days than they win on good days.
// That's the secret. Risk management > prediction accuracy.
// ═══════════════════════════════════════════════════════════════════════

import type { ModelPrediction, SituationalFactors, MarketData, RiskAssessment, RiskLevel } from '../types';
import { weightedStdDev, clamp } from '../utils';

/**
 * Full risk assessment for a match prediction.
 *
 * Combines model disagreement, data quality, situational risks,
 * and market signals into a single risk picture.
 */
export function assessRisk(
  models: {
    elo: ModelPrediction;
    poisson: ModelPrediction;
    xg: ModelPrediction;
    form: ModelPrediction;
    attackDefense: ModelPrediction;
  },
  weights: {
    elo: number;
    poisson: number;
    xg: number;
    form: number;
    attackDefense: number;
  },
  situation: SituationalFactors,
  market: MarketData,
  baseConfidence: number
): RiskAssessment {
  const riskFactors: string[] = [];

  // ── Model Disagreement ───────────────────────────────────────────
  // How much do the models disagree on the favorite?
  const modelPredictions = [
    models.elo,
    models.poisson,
    models.xg,
    models.form,
    models.attackDefense,
  ];
  const modelWeights = [
    weights.elo,
    weights.poisson,
    weights.xg,
    weights.form,
    weights.attackDefense,
  ];

  // Calculate disagreement on home win probability
  const homeWinProbs = modelPredictions.map((m) => m.homeWinProb);
  const disagreement = weightedStdDev(homeWinProbs, modelWeights);

  if (disagreement > 0.1) {
    riskFactors.push('Models significantly disagree on outcome');
  }

  // ── Data Reliability Check ───────────────────────────────────────
  const dataReliabilityIssue = situation.dataQuality < 0.4;
  if (dataReliabilityIssue) {
    riskFactors.push('Insufficient data for reliable prediction');
  }
  if (situation.sampleSizeWarning) {
    riskFactors.push('Small sample size — stats may not be representative');
  }

  // ── Situational Risk ─────────────────────────────────────────────
  let situationalRisk = false;
  if (situation.isDerby) {
    situationalRisk = true;
    riskFactors.push('Derby match — unpredictable outcomes');
  }
  if (situation.homeMotivation === 'dead-rubber' || situation.awayMotivation === 'dead-rubber') {
    situationalRisk = true;
    riskFactors.push('Dead rubber — motivation uncertain');
  }
  if (situation.homeFatigue > 0.7 || situation.awayFatigue > 0.7) {
    situationalRisk = true;
    riskFactors.push('Fatigue risk — teams may rotate or underperform');
  }

  // ── Market Risk ──────────────────────────────────────────────────
  let marketRisk = false;

  // If market strongly disagrees with our model, something might be off
  if (market.impliedHomeWin && market.impliedAwayWin) {
    const ourFavorite = Math.max(homeWinProbs.reduce((s, p, i) => s + p * modelWeights[i], 0) / modelWeights.reduce((s, w) => s + w, 0), 0);
    const marketFavoriteProb = Math.max(market.impliedHomeWin, market.impliedAwayWin);

    if (Math.abs(ourFavorite - marketFavoriteProb) > 0.15) {
      marketRisk = true;
      riskFactors.push('Significant model vs market disagreement — market may know something');
    }
  }

  // Very efficient market = hard to beat
  if (market.overround !== null && market.overround < 0.03 && market.marketConfidence > 0.8) {
    riskFactors.push('Very efficient market — finding edge is difficult');
    marketRisk = true;
  }

  // No market data at all = can't assess value
  if (!market.homeWinOdds && !market.awayWinOdds) {
    riskFactors.push('No market odds available — cannot assess value');
    marketRisk = true;
  }

  // ── Overall Risk Score ───────────────────────────────────────────
  let riskScore = 0;

  // Model disagreement contribution (0-0.25)
  riskScore += clamp(disagreement * 2.5, 0, 0.25);

  // Data reliability contribution (0-0.25)
  if (dataReliabilityIssue) riskScore += clamp(1 - situation.dataQuality, 0, 0.25);

  // Situational risk contribution (0-0.25)
  if (situationalRisk) riskScore += 0.15;
  if (situation.isDerby) riskScore += 0.05;

  // Market risk contribution (0-0.25)
  if (marketRisk) riskScore += 0.15;
  if (!market.homeWinOdds) riskScore += 0.1;

  riskScore = clamp(riskScore, 0, 1);

  // ── Risk Level ───────────────────────────────────────────────────
  let riskLevel: RiskLevel;
  if (riskScore > 0.7) riskLevel = 'avoid';
  else if (riskScore > 0.55) riskLevel = 'very-high';
  else if (riskScore > 0.4) riskLevel = 'high';
  else if (riskScore > 0.25) riskLevel = 'medium';
  else if (riskScore > 0.1) riskLevel = 'low';
  else riskLevel = 'very-low';

  // ── Adjusted Confidence ──────────────────────────────────────────
  // Confidence after accounting for risk
  // A punter's real confidence = base confidence × risk discount
  const riskDiscount = 1 - riskScore * 0.6; // Risk reduces confidence by up to 60%
  const adjustedConfidence = clamp(baseConfidence * riskDiscount, 0.05, 1);

  return {
    riskLevel,
    riskScore,
    modelDisagreement: disagreement,
    dataReliabilityIssue,
    situationalRisk,
    marketRisk,
    riskFactors,
    adjustedConfidence,
  };
}

/**
 * Calculate base confidence from model agreement.
 *
 * When all models point the same way = high confidence
 * When models disagree = low confidence (the punter is unsure)
 *
 * Also accounts for model reliability — don't give high confidence
 * if the most reliable models disagree.
 */
export function calculateBaseConfidence(
  models: {
    elo: ModelPrediction;
    poisson: ModelPrediction;
    xg: ModelPrediction;
    form: ModelPrediction;
    attackDefense: ModelPrediction;
  },
  weights: {
    elo: number;
    poisson: number;
    xg: number;
    form: number;
    attackDefense: number;
  }
): number {
  const modelPredictions = [
    models.elo,
    models.poisson,
    models.xg,
    models.form,
    models.attackDefense,
  ];
  const modelWeights = [
    weights.elo,
    weights.poisson,
    weights.xg,
    weights.form,
    weights.attackDefense,
  ];

  // Disagreement on home win prob
  const homeWinProbs = modelPredictions.map((m) => m.homeWinProb);
  const homeDisagreement = weightedStdDev(homeWinProbs, modelWeights);

  // Disagreement on draw prob
  const drawProbs = modelPredictions.map((m) => m.drawProb);
  const drawDisagreement = weightedStdDev(drawProbs, modelWeights);

  // Combined disagreement
  const totalDisagreement = (homeDisagreement + drawDisagreement) / 2;

  // Convert to confidence: less disagreement = more confidence
  let confidence = 1 - totalDisagreement * 4; // Scale factor
  confidence = clamp(confidence, 0.05, 0.95);

  // Boost from model reliability
  // Weight confidence by how reliable the models are
  const totalWeight = modelWeights.reduce((s, w) => s + w, 0);
  if (totalWeight > 0) {
    const reliabilityBoost = modelPredictions.reduce(
      (s, m, i) => s + m.reliability * (modelWeights[i] / totalWeight),
      0
    );
    confidence = confidence * 0.6 + reliabilityBoost * 0.4;
  }

  return clamp(confidence, 0.05, 0.95);
}
