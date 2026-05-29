// ═══════════════════════════════════════════════════════════════════════
// rankMarkets — produce the final ordered list of candidates
//
// Ranking score = "headline quality" — a weighted recombination of:
//   finalScore × 0.45                  (engine's overall score)
//   modelProbability × 0.18            (confidence)
//   tacticalFit × 0.12                 (script alignment)
//   edge × 0.25 (capped) or × 0.12     (positive vs negative edge)
//   + specificityBonus                 (markets we prefer to headline)
//   - comfortPenalty                   (markets that look easy but pay poor)
//
// Tiebreak: when two candidates are within 0.003 headline quality of each
// other, use modelProbability as a stable secondary sort.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum } from '../xg/shared';
import type { MarketCandidate } from '../types';

// Weighting
export const W_FINAL_SCORE = 0.45;
export const W_PROBABILITY = 0.18;
export const W_TACTICAL_FIT = 0.12;
export const W_EDGE_POS = 0.25;
export const W_EDGE_NEG = 0.12;
export const EDGE_POS_CAP = 0.18;
export const EDGE_NEG_FLOOR = -0.12;

// Tiebreak threshold
export const TIEBREAK_EPSILON = 0.003;

// Markets that "feel safe" but historically deliver poor ROI — get a penalty
// so they don't headline when something better is available.
export const COMFORT_PENALTY: Record<string, number> = {
  under_35: 0.150,
  over_15: 0.100,
  double_chance_home: 0.080,
  double_chance_away: 0.080,
  home_over_05: 0.120,
  away_over_05: 0.120,
  dnb_home: 0.040,
  dnb_away: 0.040,
};

// Markets we PREFER to headline (specific, clean, easy to understand)
export const SPECIFICITY_BONUS: Record<string, number> = {
  home_win: 0.060, away_win: 0.060,
  over_25: 0.050, under_25: 0.035,
  btts_yes: 0.045, btts_no: 0.025,
  home_over_15: 0.030, away_over_15: 0.030,
};

function round4(num: number): number {
  return Math.round(num * 10000) / 10000;
}

export function rankMarkets(candidates: MarketCandidate[]): MarketCandidate[] {
  return [...candidates]
    .map((c) => {
      const finalScore = safeNum(c.finalScore, 0);
      const probability = safeNum(c.modelProbability, 0);
      const tacticalFit = safeNum(c.tacticalFitScore, 0.4);
      const edge = safeNum(c.edge, 0);

      const comfortPenalty = COMFORT_PENALTY[c.marketKey] || 0;
      const specificityBonus = SPECIFICITY_BONUS[c.marketKey] || 0;
      const edgeComponent = edge > 0
        ? Math.min(edge, EDGE_POS_CAP) * W_EDGE_POS
        : Math.max(edge, EDGE_NEG_FLOOR) * W_EDGE_NEG;

      const headlineQualityScore =
          finalScore * W_FINAL_SCORE
        + probability * W_PROBABILITY
        + tacticalFit * W_TACTICAL_FIT
        + edgeComponent
        + specificityBonus
        - comfortPenalty;

      return { ...c, headlineQualityScore: round4(headlineQualityScore) };
    })
    .sort((a, b) => {
      const qualityGap = safeNum(b.headlineQualityScore, 0) - safeNum(a.headlineQualityScore, 0);
      if (Math.abs(qualityGap) > TIEBREAK_EPSILON) return qualityGap;
      return safeNum(b.modelProbability, 0) - safeNum(a.modelProbability, 0);
    });
}
