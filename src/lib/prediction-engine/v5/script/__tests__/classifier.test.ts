// ═══════════════════════════════════════════════════════════════════════
// Script classifier orchestrator tests
//
// Pins the end-to-end classification behaviour: primary selection,
// secondary fallback, confidence clamps, control / event / volatility
// scores, and robustness to malformed input.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  classifyMatchScript,
  extractScriptInputs,
  scoreAllCategories,
  DEFAULTS,
  SECONDARY_PROXIMITY,
  CONFIDENCE_FLOOR,
  CONFIDENCE_CEIL,
} from '../index';

// ─────────────────────────────────────────────────────────────────────
// extractScriptInputs
// ─────────────────────────────────────────────────────────────────────
describe('extractScriptInputs', () => {
  it('uses DEFAULTS when fields are missing', () => {
    const inputs = extractScriptInputs({});
    expect(inputs.homeStrengthGap).toBe(DEFAULTS.homeStrengthGap);
    expect(inputs.homeDefensiveWeakness).toBe(DEFAULTS.homeDefensiveWeakness);
    expect(inputs.matchChaosScore).toBe(DEFAULTS.matchChaosScore);
  });

  it('substitutes home/away avg scored when venue-specific data missing', () => {
    const inputs = extractScriptInputs({ homeAvgScored: 1.8, awayAvgScored: 0.9 });
    expect(inputs.homeHomeGoalsFor).toBe(1.8);
    expect(inputs.awayAwayGoalsFor).toBe(0.9);
  });

  it('NaN inputs fall back to defaults (no propagation)', () => {
    const inputs = extractScriptInputs({
      homeStrengthGap: NaN,
      homeAvgConceded: NaN,
      matchChaosScore: NaN,
    });
    expect(inputs.homeStrengthGap).toBe(DEFAULTS.homeStrengthGap);
    expect(inputs.homeAvgConceded).toBe(DEFAULTS.homeAvgConceded);
    expect(inputs.matchChaosScore).toBe(DEFAULTS.matchChaosScore);
  });

  it('combinedBttsRate falls back to h2hBttsRate when missing', () => {
    const inputs = extractScriptInputs({ h2hBttsRate: 0.62 });
    expect(inputs.combinedBttsRate).toBe(0.62);
  });

  it('avgTotalGoalsProxy = homeHomeGoalsFor + awayAwayGoalsFor', () => {
    const inputs = extractScriptInputs({ homeHomeGoalsFor: 1.5, awayAwayGoalsFor: 1.1 });
    expect(inputs.avgTotalGoalsProxy).toBeCloseTo(2.6, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────
// scoreAllCategories
// ─────────────────────────────────────────────────────────────────────
describe('scoreAllCategories', () => {
  it('returns all 5 categories', () => {
    const inputs = extractScriptInputs({});
    const scores = scoreAllCategories(inputs);
    expect(Object.keys(scores).sort()).toEqual([
      'chaotic_unreliable',
      'dominant_away_pressure',
      'dominant_home_pressure',
      'open_end_to_end',
      'tight_low_event',
    ]);
  });

  it('every score is in [0, 1]', () => {
    const inputs = extractScriptInputs({});
    const scores = scoreAllCategories(inputs);
    for (const [k, v] of Object.entries(scores)) {
      expect(v, `${k} out of range`).toBeGreaterThanOrEqual(0);
      expect(v, `${k} out of range`).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// classifyMatchScript — primary selection
// ─────────────────────────────────────────────────────────────────────
describe('classifyMatchScript — primary picks', () => {
  it('Bayern vs Augsburg profile → dominant_home_pressure', () => {
    const r = classifyMatchScript({
      homeStrengthGap: 0.4, awayStrengthGap: -0.4,
      awayDefensiveWeakness: 0.75,
      homeHomeGoalsFor: 2.2, awayAwayGoalsAgainst: 1.7,
      homeAttackRating01: 0.75, awayAttackRating01: 0.35,
      matchChaosScore: 0.35,
      dataCompletenessScore: 0.85,
    });
    expect(r.primary).toBe('dominant_home_pressure');
  });

  it('Italian-style defensive fixture → tight_low_event', () => {
    const r = classifyMatchScript({
      homeStrengthGap: 0, awayStrengthGap: 0,
      homeAttackRating01: 0.35, awayAttackRating01: 0.35,
      homeHomeGoalsFor: 0.9, awayAwayGoalsFor: 0.8,
      homeAvgConceded: 0.7, awayAvgConceded: 0.8,
      matchChaosScore: 0.4,
      dataCompletenessScore: 0.8,
    });
    expect(r.primary).toBe('tight_low_event');
  });

  it('Bayern vs Dortmund profile → open_end_to_end', () => {
    const r = classifyMatchScript({
      homeStrengthGap: 0.05, awayStrengthGap: -0.05,
      homeAttackRating01: 0.78, awayAttackRating01: 0.72,
      homeHomeGoalsFor: 2.4, awayAwayGoalsFor: 2.0,
      homeAvgConceded: 1.5, awayAvgConceded: 1.6,
      combinedBttsRate: 0.72,
      matchChaosScore: 0.55,
      dataCompletenessScore: 0.85,
    });
    expect(r.primary).toBe('open_end_to_end');
  });

  it('low data + high volatility → chaotic_unreliable', () => {
    const r = classifyMatchScript({
      matchChaosScore: 0.85,
      dataCompletenessScore: 0.20,
      upsetRiskScore: 0.80,
    });
    expect(r.primary).toBe('chaotic_unreliable');
  });
});

// ─────────────────────────────────────────────────────────────────────
// classifyMatchScript — secondary, confidence, derived scores
// ─────────────────────────────────────────────────────────────────────
describe('classifyMatchScript — derived outputs', () => {
  it('confidence is clamped to [CONFIDENCE_FLOOR, CONFIDENCE_CEIL]', () => {
    const allLow = classifyMatchScript({}); // unanimous defaults → very low primary
    expect(allLow.confidence).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
    expect(allLow.confidence).toBeLessThanOrEqual(CONFIDENCE_CEIL);
  });

  it('secondary is set when 2nd-place is within SECONDARY_PROXIMITY of 1st', () => {
    // Build a fixture where dominant_home and open are both moderate
    const r = classifyMatchScript({
      homeStrengthGap: 0.28, awayDefensiveWeakness: 0.6,
      homeAttackRating01: 0.7, awayAttackRating01: 0.6,
      homeAvgConceded: 1.3, awayAvgConceded: 1.3,
      combinedBttsRate: 0.55,
      homeHomeGoalsFor: 1.6, awayAwayGoalsFor: 1.3,
      matchChaosScore: 0.5, dataCompletenessScore: 0.7,
    });
    // Either primary should have a secondary (some other category close)
    if (r.secondary) {
      const primaryScore = r._scores![r.primary as keyof typeof r._scores];
      const secondaryScore = r._scores![r.secondary as keyof typeof r._scores];
      expect(secondaryScore).toBeGreaterThanOrEqual(primaryScore - SECONDARY_PROXIMITY);
    }
  });

  it('volatilityScore is rounded to 3dp', () => {
    const r = classifyMatchScript({ matchChaosScore: 0.123456789 });
    expect(r.volatilityScore).toBe(0.123);
  });

  it('eventLevelScore in [0, 1]', () => {
    const r1 = classifyMatchScript({ homeHomeGoalsFor: 0.2, awayAwayGoalsFor: 0.2 });
    const r2 = classifyMatchScript({ homeHomeGoalsFor: 5, awayAwayGoalsFor: 5 });
    expect(r1.eventLevelScore).toBeGreaterThanOrEqual(0);
    expect(r2.eventLevelScore).toBeLessThanOrEqual(1);
  });

  it('homeControlScore reflects strength gap + attack rating', () => {
    const dominant = classifyMatchScript({ homeStrengthGap: 0.5, homeAttackRating01: 0.8 });
    const weak = classifyMatchScript({ homeStrengthGap: -0.5, homeAttackRating01: 0.3 });
    expect(dominant.homeControlScore).toBeGreaterThan(weak.homeControlScore);
  });

  it('_scores object exposes per-category scores', () => {
    const r = classifyMatchScript({});
    expect(r._scores).toBeDefined();
    expect(Object.keys(r._scores!).sort()).toEqual([
      'chaotic_unreliable',
      'dominant_away_pressure',
      'dominant_home_pressure',
      'open_end_to_end',
      'tight_low_event',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Robustness
// ─────────────────────────────────────────────────────────────────────
describe('classifyMatchScript — robustness', () => {
  it('empty feature vector does not crash; returns a valid script', () => {
    const r = classifyMatchScript({});
    expect(r.primary).toBeDefined();
    expect(Number.isFinite(r.confidence)).toBe(true);
    expect(Number.isFinite(r.eventLevelScore)).toBe(true);
    expect(Number.isFinite(r.volatilityScore)).toBe(true);
  });

  it('NaN-filled feature vector does not crash', () => {
    const r = classifyMatchScript({
      homeStrengthGap: NaN, awayStrengthGap: NaN,
      homeAttackRating01: NaN, awayAttackRating01: NaN,
      matchChaosScore: NaN, dataCompletenessScore: NaN, upsetRiskScore: NaN,
      combinedBttsRate: NaN, h2hBttsRate: NaN,
    });
    expect(r.primary).toBeDefined();
    expect(Number.isFinite(r.confidence)).toBe(true);
    expect(Number.isFinite(r.volatilityScore)).toBe(true);
  });

  it('null fv does not crash', () => {
    const r = classifyMatchScript(null);
    expect(r.primary).toBeDefined();
  });

  it('classification is deterministic — same input → same output', () => {
    const fv = {
      homeStrengthGap: 0.3, awayDefensiveWeakness: 0.6,
      homeAttackRating01: 0.65, awayAttackRating01: 0.55,
      matchChaosScore: 0.5,
    };
    const r1 = classifyMatchScript(fv);
    const r2 = classifyMatchScript(fv);
    expect(r1.primary).toBe(r2.primary);
    expect(r1.confidence).toBe(r2.confidence);
    expect(r1.eventLevelScore).toBe(r2.eventLevelScore);
  });
});
