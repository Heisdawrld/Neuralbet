// ═══════════════════════════════════════════════════════════════════════
// Match script classifier orchestrator
//
// Reads a FeatureVector → extracts the inputs the classifier needs →
// scores all 5 categories independently → picks primary (highest) and
// secondary (anything within SECONDARY_PROXIMITY of primary) → returns
// the final ScriptOutput with confidence + control + volatility scores.
//
// PIPELINE INVARIANT: the orchestrator MUST produce bit-for-bit identical
// ScriptOutput to the original inline classifier. Pinned by tests.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum, clamp } from '../xg/shared';
import type { ScriptOutput } from '../types';
import type { ScriptInputs, CategoryScores, ScriptCategory } from './types';

import { scoreDominantHome } from './categories/dominant-home';
import { scoreDominantAway } from './categories/dominant-away';
import { scoreOpenEndToEnd } from './categories/open-end-to-end';
import { scoreTightLowEvent } from './categories/tight-low-event';
import { scoreChaoticUnreliable } from './categories/chaotic-unreliable';

// ─────────────────────────────────────────────────────────────────────
// ORCHESTRATOR CONSTANTS — single source of truth
// ─────────────────────────────────────────────────────────────────────

/** Default values for FeatureVector fields the classifier reads.
 *  Used when fv doesn't supply the field OR supplies NaN/Infinity.    */
export const DEFAULTS = {
  homeStrengthGap: 0,
  awayStrengthGap: 0,
  homeDefensiveWeakness: 0.44,
  awayDefensiveWeakness: 0.44,
  homeAttackRating01: 0.4,
  awayAttackRating01: 0.4,
  homeAvgScored: 1.2,            // for homeHomeGoalsFor fallback
  awayAvgScored: 1.0,            // for awayAwayGoalsFor fallback
  homeAvgConceded: 1.1,
  awayAvgConceded: 1.1,
  matchChaosScore: 0.5,
  dataCompletenessScore: 0.5,
  upsetRiskScore: 0.5,
  combinedBttsRate: 0.45,
  h2hBttsRate: 0.45,
} as const;

/** A secondary script is recorded if its score is within this much of the primary. */
export const SECONDARY_PROXIMITY = 0.15;

/** Confidence clamps — even a unanimous primary call gets capped here. */
export const CONFIDENCE_FLOOR = 0.3;
export const CONFIDENCE_CEIL = 0.95;

/** Event-level scoring is goal-proxy divided by this scale. */
export const EVENT_LEVEL_GOALS_SCALE = 3.5;

/** Control-score sub-components for the primary attacking side. */
export const CONTROL_STRENGTH_GAP_SCALE = 0.5;
export const CONTROL_ATTACK_THRESHOLD = 0.5;
export const CONTROL_ATTACK_BONUS = 0.3;

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract the classifier's input slice from a FeatureVector.
 * Every read is NaN-safe via safeNum.
 */
export function extractScriptInputs(fv: any): ScriptInputs {
  const homeAvgScored = safeNum(fv?.homeAvgScored, DEFAULTS.homeAvgScored);
  const awayAvgScored = safeNum(fv?.awayAvgScored, DEFAULTS.awayAvgScored);
  const awayAvgConceded = safeNum(fv?.awayAvgConceded, DEFAULTS.awayAvgConceded);

  const homeHomeGoalsFor = safeNum(fv?.homeHomeGoalsFor, homeAvgScored);
  const awayAwayGoalsFor = safeNum(fv?.awayAwayGoalsFor, awayAvgScored);

  return {
    homeStrengthGap: safeNum(fv?.homeStrengthGap, DEFAULTS.homeStrengthGap),
    awayStrengthGap: safeNum(fv?.awayStrengthGap, DEFAULTS.awayStrengthGap),
    homeDefensiveWeakness: safeNum(fv?.homeDefensiveWeakness, DEFAULTS.homeDefensiveWeakness),
    awayDefensiveWeakness: safeNum(fv?.awayDefensiveWeakness, DEFAULTS.awayDefensiveWeakness),
    homeAttackRating01: safeNum(fv?.homeAttackRating01, DEFAULTS.homeAttackRating01),
    awayAttackRating01: safeNum(fv?.awayAttackRating01, DEFAULTS.awayAttackRating01),
    homeHomeGoalsFor,
    awayAwayGoalsFor,
    homeAvgConceded: safeNum(fv?.homeAvgConceded, DEFAULTS.homeAvgConceded),
    awayAvgConceded,
    awayAwayGoalsAgainst: safeNum(fv?.awayAwayGoalsAgainst, awayAvgConceded),
    matchChaosScore: safeNum(fv?.matchChaosScore, DEFAULTS.matchChaosScore),
    dataCompletenessScore: safeNum(fv?.dataCompletenessScore, DEFAULTS.dataCompletenessScore),
    upsetRiskScore: safeNum(fv?.upsetRiskScore, DEFAULTS.upsetRiskScore),
    combinedBttsRate: safeNum(fv?.combinedBttsRate, safeNum(fv?.h2hBttsRate, DEFAULTS.combinedBttsRate)),
    avgTotalGoalsProxy: homeHomeGoalsFor + awayAwayGoalsFor,
  };
}

/** Score all 5 categories for a given inputs slice. Pure / deterministic. */
export function scoreAllCategories(inputs: ScriptInputs): CategoryScores {
  return {
    dominant_home_pressure: scoreDominantHome(inputs),
    dominant_away_pressure: scoreDominantAway(inputs),
    open_end_to_end: scoreOpenEndToEnd(inputs),
    tight_low_event: scoreTightLowEvent(inputs),
    chaotic_unreliable: scoreChaoticUnreliable(inputs),
  };
}

function round3(num: number): number {
  return Math.round(num * 1000) / 1000;
}

/**
 * Classify a FeatureVector into a ScriptOutput.
 *
 * Pipeline:
 *   1. extractScriptInputs(fv)        — NaN-safe input slice
 *   2. scoreAllCategories(inputs)     — score all 5 archetypes
 *   3. sort + pick primary/secondary  — winner + close-runner-up
 *   4. compute confidence + control + event-level + volatility scores
 */
export function classifyMatchScript(fv: any): ScriptOutput {
  const inputs = extractScriptInputs(fv);
  const scores = scoreAllCategories(inputs);

  // Rank
  const sorted = (Object.entries(scores) as Array<[ScriptCategory, number]>)
    .sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][0];
  const primaryScore = sorted[0][1];
  const secondaryEntry = sorted[1];
  const secondary = secondaryEntry && secondaryEntry[1] >= primaryScore - SECONDARY_PROXIMITY
    ? secondaryEntry[0] : null;

  // Derived scores
  const confidence = clamp(primaryScore, CONFIDENCE_FLOOR, CONFIDENCE_CEIL);
  const eventLevelScore = clamp(inputs.avgTotalGoalsProxy / EVENT_LEVEL_GOALS_SCALE, 0, 1);
  const homeControlScore = clamp(
    inputs.homeStrengthGap * CONTROL_STRENGTH_GAP_SCALE
      + (inputs.homeAttackRating01 > CONTROL_ATTACK_THRESHOLD ? CONTROL_ATTACK_BONUS : 0),
    0, 1,
  );
  const awayControlScore = clamp(
    inputs.awayStrengthGap * CONTROL_STRENGTH_GAP_SCALE
      + (inputs.awayAttackRating01 > CONTROL_ATTACK_THRESHOLD ? CONTROL_ATTACK_BONUS : 0),
    0, 1,
  );

  return {
    primary,
    secondary,
    confidence: round3(confidence),
    homeControlScore,
    awayControlScore,
    eventLevelScore: round3(eventLevelScore),
    volatilityScore: round3(inputs.matchChaosScore),
    _scores: scores,
  };
}

// Re-export category scorers + their constants so backtest / ablation
// code can compose them directly.
export { scoreDominantHome } from './categories/dominant-home';
export { scoreDominantAway } from './categories/dominant-away';
export { scoreOpenEndToEnd } from './categories/open-end-to-end';
export { scoreTightLowEvent } from './categories/tight-low-event';
export { scoreChaoticUnreliable } from './categories/chaotic-unreliable';
export type { ScriptInputs, CategoryScores, ScriptCategory } from './types';
