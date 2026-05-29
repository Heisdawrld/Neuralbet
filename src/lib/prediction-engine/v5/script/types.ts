// ═══════════════════════════════════════════════════════════════════════
// Script classifier types — local to the script/ module
// ═══════════════════════════════════════════════════════════════════════

/**
 * The five canonical match-script archetypes. Each one represents a
 * fundamentally different shape of football match, and unlocks different
 * downstream xG adjustments + market preferences.
 *
 * The classifier scores all five independently from the feature vector,
 * then picks the highest as primary. A secondary script is recorded if
 * its score is within 0.15 of the primary's (lets downstream code know
 * "this could go either way").
 */
export type ScriptCategory =
  | 'dominant_home_pressure'
  | 'dominant_away_pressure'
  | 'open_end_to_end'
  | 'tight_low_event'
  | 'chaotic_unreliable';

/** Per-category score (always 0-1) — produced by a category scorer. */
export type CategoryScores = Record<ScriptCategory, number>;

/**
 * Inputs the classifier reads from the FeatureVector. Decoupling here
 * means tests can construct minimal inputs without standing up the full
 * FeatureVector shape.
 */
export interface ScriptInputs {
  homeStrengthGap: number;
  awayStrengthGap: number;
  homeDefensiveWeakness: number;
  awayDefensiveWeakness: number;
  homeAttackRating01: number;
  awayAttackRating01: number;
  homeHomeGoalsFor: number;
  awayAwayGoalsFor: number;
  homeAvgConceded: number;
  awayAvgConceded: number;
  awayAwayGoalsAgainst: number;
  matchChaosScore: number;
  dataCompletenessScore: number;
  upsetRiskScore: number;
  combinedBttsRate: number;
  /** homeHomeGoalsFor + awayAwayGoalsFor — pre-computed for convenience */
  avgTotalGoalsProxy: number;
}
