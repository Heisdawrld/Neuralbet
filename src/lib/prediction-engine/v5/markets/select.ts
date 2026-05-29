// ═══════════════════════════════════════════════════════════════════════
// selectBestPickOrAbstain — the engine's final go/no-go gate
//
// Given a ranked list of candidates, return either:
//   • A bestPick (with riskLevel + edgeLabel annotations)
//   • An abstain decision (bestPick=null, reason + abstain code)
//
// Abstain codes:
//   NO_CANDIDATES         — ranked list is empty
//   NO_PRICED_MARKETS     — nothing has bookmaker odds AND no model-only fallback qualifies
//   LOW_HEADLINE_QUALITY  — priced markets exist but none pass quality gates
//   LOW_PROBABILITY       — top pick model prob < 0.50
//   WEAK_SEPARATION       — top 2 picks too close in finalScore (no conviction)
//   NO_EDGE               — best pick has no edge AND odds exist for the field
//   THIN_THESIS           — borderline pick on shaky data + high volatility
//   CONFLICTING_EVIDENCE  — 3+ picks all bunched up with weak edges
//
// Risk level + edge label are auxiliary annotations used by the UI.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import type { MarketCandidate, ScriptOutput } from '../types';
import { isHeadlineEligibleMarket } from './registry';

// ─────────────────────────────────────────────────────────────────────
// RISK LEVEL + EDGE LABEL
// ─────────────────────────────────────────────────────────────────────

export const RISK_PROB_HIGH = 0.74;
export const RISK_PROB_MID = 0.65;
export const RISK_PROB_LOW = 0.58;
export const RISK_CHAOTIC_HIGH_THRESHOLD = 0.80;
export const RISK_CHAOTIC_MID_THRESHOLD = 0.72;
export const RISK_CHAOTIC_LOW_THRESHOLD = 0.68;
export const RISK_STABLE_CHAOS_CEIL = 0.55;

export const STABLE_MARKETS = new Set([
  'under_35', 'under_25',
  'double_chance_home', 'double_chance_away',
  'dnb_home', 'dnb_away',
]);
export const VOLATILE_MARKETS = new Set([
  'btts_yes', 'over_35', 'over_25', 'home_over_25', 'away_over_25',
]);

export function computeRiskLevel(pick: MarketCandidate, fv: any, script: ScriptOutput): string {
  const prob = safeNum(pick.modelProbability, 0);
  const chaos = safeNum(fv.matchChaosScore, 0.5);
  const marketKey = pick.marketKey || '';
  const isChaoticScript = script.primary === 'chaotic_unreliable' || script.primary === 'open_end_to_end';
  const isStable = STABLE_MARKETS.has(marketKey);
  const isVolatile = VOLATILE_MARKETS.has(marketKey);

  if (prob >= RISK_PROB_HIGH) {
    if (isChaoticScript && chaos >= RISK_CHAOTIC_HIGH_THRESHOLD) return 'MODERATE';
    return 'SAFE';
  }
  if (prob >= RISK_PROB_MID) {
    if (isChaoticScript && chaos >= RISK_CHAOTIC_MID_THRESHOLD) return 'AGGRESSIVE';
    if (isStable && chaos < RISK_STABLE_CHAOS_CEIL) return 'SAFE';
    return 'MODERATE';
  }
  if (prob >= RISK_PROB_LOW) {
    if (isChaoticScript || chaos >= RISK_CHAOTIC_LOW_THRESHOLD || isVolatile) return 'AGGRESSIVE';
    return 'MODERATE';
  }
  return 'AGGRESSIVE';
}

export function computeEdgeLabel(pick: MarketCandidate, riskLevel: string): string {
  const prob = safeNum(pick.modelProbability, 0);
  if (prob >= RISK_PROB_HIGH) return riskLevel === 'SAFE' ? 'STRONG EDGE' : 'GAMBLE EDGE';
  if (prob >= RISK_PROB_MID) return 'MODERATE EDGE';
  if (prob >= 0.55) return 'LEAN';
  return 'NO EDGE';
}

// ─────────────────────────────────────────────────────────────────────
// QUALITY GATES
// ─────────────────────────────────────────────────────────────────────

export const PHANTOM_PROB_WEIGHT = 0.55;
export const PHANTOM_FINAL_WEIGHT = 0.45;

export function phantomScoreOf(candidate: MarketCandidate): number {
  const prob = safeNum(candidate.modelProbability, 0);
  const finalScore = safeNum(candidate.finalScore, prob);
  return prob * PHANTOM_PROB_WEIGHT + finalScore * PHANTOM_FINAL_WEIGHT;
}

export function isPricedCandidate(candidate: MarketCandidate): boolean {
  if (!candidate) return false;
  if (safeNum(candidate.bookmakerOdds, 0) > 1.0) return true;
  const impliedProbability = safeNum(candidate.impliedProbability, 0);
  return impliedProbability > 0 && impliedProbability < 1;
}

// Headline-quality gates
export const HQ_MIN_PROB = 0.50;
export const HQ_MIN_FINAL_SCORE = 0.36;
export const HQ_MIN_PHANTOM = 0.50;
export const HQ_MIN_DATA = 0.30;
export const HQ_VOLATILITY_HIGH = 0.70;
export const HQ_CHAOS_HIGH = 0.68;
export const HQ_AGG_MIN_PHANTOM = 0.55;
export const HQ_AGG_MIN_FINAL_SCORE = 0.42;
export const HQ_AGG_MIN_PROB = 0.65;
export const HQ_LOW_EDGE_CEILING = 0.01;
export const HQ_NO_EDGE_PROB_FLOOR = 0.72;

export function isHeadlineQualityCandidate(
  candidate: MarketCandidate, fv: any, script: ScriptOutput,
): boolean {
  const prob = safeNum(candidate.modelProbability, 0);
  const finalScore = safeNum(candidate.finalScore, 0);
  const phantomScore = phantomScoreOf(candidate);
  const dataScore = safeNum(fv.dataCompletenessScore, 0.5);
  const risk = computeRiskLevel(candidate, fv, script);
  const volatilityScore = safeNum(script.volatilityScore, 0.5);
  const isHighVolatility = volatilityScore > HQ_VOLATILITY_HIGH;
  const chaos = safeNum(fv.matchChaosScore, 0.5);
  const edge = safeNum(candidate.edge, 0);

  if (prob < HQ_MIN_PROB) return false;
  if (finalScore < HQ_MIN_FINAL_SCORE) return false;
  if (phantomScore < HQ_MIN_PHANTOM) return false;
  if (dataScore < HQ_MIN_DATA) return false;

  if (risk === 'AGGRESSIVE' || isHighVolatility || chaos >= HQ_CHAOS_HIGH) {
    if (phantomScore < HQ_AGG_MIN_PHANTOM) return false;
    if (finalScore < HQ_AGG_MIN_FINAL_SCORE) return false;
    if (prob < HQ_AGG_MIN_PROB) return false;
  }

  if ((candidate.impliedProbability ?? 0) > 0
      && edge < HQ_LOW_EDGE_CEILING
      && prob < HQ_NO_EDGE_PROB_FLOOR) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────
// MODEL-ONLY FALLBACK (when no priced market qualifies)
// ─────────────────────────────────────────────────────────────────────

export const MODEL_ONLY_MIN_PROB = 0.62;
export const MODEL_ONLY_MIN_FINAL = 0.42;
export const MODEL_ONLY_MIN_PHANTOM = 0.55;
export const MODEL_ONLY_MIN_DATA = 0.40;
export const MODEL_ONLY_BET_PROB = 0.72;
export const MODEL_ONLY_ACCA_PROB = 0.60;

// ─────────────────────────────────────────────────────────────────────
// ABSTAIN GATES
// ─────────────────────────────────────────────────────────────────────

export const ABSTAIN_MIN_TOP_PROB = 0.50;

// Separation
export const SEPARATION_MIN_GAP_WITH_ODDS = 0.010;
export const SEPARATION_MIN_GAP_NO_ODDS = 0.008;
export const SEPARATION_BOTH_STRONG_PROB = 0.60;

// Thin thesis
export const THIN_THESIS_FINAL = 0.48;
export const THIN_THESIS_EDGE = 0.02;
export const THIN_THESIS_DATA = 0.45;
export const THIN_THESIS_VOLATILITY = 0.62;

// Conflicting evidence
export const CONFLICT_TOP_GAP = 0.018;
export const CONFLICT_THIRD_GAP = 0.032;
export const CONFLICT_EDGE = 0.03;

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

export interface SelectionResult {
  bestPick: MarketCandidate | null;
  backupPicks: MarketCandidate[];
  noSafePick: boolean;
  noSafePickReason: string | null;
  abstainCode: string | null;
}

function abstain(
  reason: string, code: string, ranked: MarketCandidate[],
): SelectionResult {
  return {
    bestPick: null,
    backupPicks: ranked.slice(0, 2),
    noSafePick: true,
    noSafePickReason: reason,
    abstainCode: code,
  };
}

export function selectBestPickOrAbstain(
  ranked: MarketCandidate[],
  script: ScriptOutput,
  fv: any,
): SelectionResult {
  if (ranked.length === 0) return abstain('No candidates survived pruning', 'NO_CANDIDATES', ranked);

  const pricedRanked = ranked.filter(isPricedCandidate);
  const qualityPricedRanked = pricedRanked.filter((c) => isHeadlineQualityCandidate(c, fv, script));

  // ── Model-only fallback ──
  if (pricedRanked.length === 0) {
    const modelOnly = ranked.find((c) => {
      if (!isHeadlineEligibleMarket(c.marketKey)) return false;
      const prob = safeNum(c.modelProbability, 0);
      const fs = safeNum(c.finalScore, 0);
      const ps = phantomScoreOf(c);
      const ds = safeNum(fv.dataCompletenessScore, 0.5);
      return prob >= MODEL_ONLY_MIN_PROB && fs >= MODEL_ONLY_MIN_FINAL
          && ps >= MODEL_ONLY_MIN_PHANTOM && ds >= MODEL_ONLY_MIN_DATA;
    });
    if (modelOnly) {
      const riskLevel = computeRiskLevel(modelOnly, fv, script);
      const edgeLabel = computeEdgeLabel(modelOnly, riskLevel);
      const prob = safeNum(modelOnly.modelProbability, 0);
      const advisor = prob >= MODEL_ONLY_BET_PROB ? 'BET'
                    : prob >= MODEL_ONLY_ACCA_PROB ? 'ACCA' : 'SKIP';
      return {
        bestPick: { ...modelOnly, riskLevel, edgeLabel, isModelOnly: true, advisor_status: advisor },
        backupPicks: ranked.slice(0, 2),
        noSafePick: false,
        noSafePickReason: null,
        abstainCode: null,
      };
    }
    return abstain('No priced markets available', 'NO_PRICED_MARKETS', ranked);
  }

  if (qualityPricedRanked.length === 0) {
    const top = pricedRanked[0];
    return abstain(
      `No headline-quality priced market — top prob=${(safeNum(top.modelProbability, 0) * 100).toFixed(1)}%`,
      'LOW_HEADLINE_QUALITY', ranked,
    );
  }

  const top = qualityPricedRanked[0];
  const topProb = safeNum(top.modelProbability, 0);

  if (topProb < ABSTAIN_MIN_TOP_PROB) {
    return abstain(
      `Best pick probability too low (${(topProb * 100).toFixed(1)}%)`,
      'LOW_PROBABILITY', ranked,
    );
  }

  // Separation gate
  if (qualityPricedRanked.length >= 2) {
    const hasOdds = qualityPricedRanked.some((c) => c.edge != null && c.edge !== 0);
    const minGap = hasOdds ? SEPARATION_MIN_GAP_WITH_ODDS : SEPARATION_MIN_GAP_NO_ODDS;
    const gap = safeNum(top.finalScore, 0) - safeNum(qualityPricedRanked[1].finalScore, 0);
    if (gap < minGap) {
      const secondProb = safeNum(qualityPricedRanked[1].modelProbability, 0);
      const bothStrong = topProb >= SEPARATION_BOTH_STRONG_PROB
                      && secondProb >= SEPARATION_BOTH_STRONG_PROB;
      if (!bothStrong) {
        return abstain('Top two headline-quality markets too close', 'WEAK_SEPARATION', ranked);
      }
    }
  }

  // Annotate top pick
  const riskLevel = computeRiskLevel(top, fv, script);
  const edgeLabel = computeEdgeLabel(top, riskLevel);
  const annotatedTop = { ...top, riskLevel, edgeLabel };

  // No-edge gate (only when other quality picks have priced edges)
  const hasAnyOdds = qualityPricedRanked.some((c) => c.edge != null && c.edge !== 0);
  if (hasAnyOdds && annotatedTop.edgeLabel === 'NO EDGE') {
    return abstain('Best pick has NO EDGE', 'NO_EDGE', ranked);
  }

  // Thin thesis gate
  const topFinalScore = safeNum(top.finalScore, 0);
  const topEdge = safeNum(top.edge, 0);
  if (topFinalScore < THIN_THESIS_FINAL
      && topEdge < THIN_THESIS_EDGE
      && safeNum(fv.dataCompletenessScore, 0.5) < THIN_THESIS_DATA
      && safeNum(script.volatilityScore, 0.5) > THIN_THESIS_VOLATILITY) {
    return abstain('Thesis too thin — weak edge with shaky evidence quality', 'THIN_THESIS', ranked);
  }

  // Conflicting evidence gate
  if (qualityPricedRanked.length >= 3) {
    const topGap = topFinalScore - safeNum(qualityPricedRanked[1]?.finalScore, 0);
    const thirdGap = topFinalScore - safeNum(qualityPricedRanked[2]?.finalScore, 0);
    if (topGap < CONFLICT_TOP_GAP && thirdGap < CONFLICT_THIRD_GAP && topEdge < CONFLICT_EDGE) {
      return abstain('Evidence split across multiple market angles', 'CONFLICTING_EVIDENCE', ranked);
    }
  }

  return {
    bestPick: annotatedTop,
    backupPicks: ranked.slice(0, 3).filter((p) => p !== top).slice(0, 2),
    noSafePick: false,
    noSafePickReason: null,
    abstainCode: null,
  };
}
