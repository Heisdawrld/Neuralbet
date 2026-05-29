// ═══════════════════════════════════════════════════════════════════════
// Layer 15: Neural Adjustment — Tests
//
// Tests the neural network layer for:
//   1. Feature extraction normalisation
//   2. Forward pass produces finite output in valid range
//   3. NaN safety — NaN inputs → identity (no adjustment)
//   4. Output clamping — adjustment bounded to ±0.5
//   5. Total floor maintained
//   6. Determinism — same inputs → same outputs
//   7. Property-based: random inputs never crash or produce NaN
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  extractNeuralFeatures,
  neuralForward,
  applyNeuralAdjustment,
  NEURAL_LAYER_META,
} from '../layers/15-neural-adjustment';

// ── Feature Extraction ──────────────────────────────────────────────

describe('extractNeuralFeatures', () => {
  it('produces a Float64Array of length 12', () => {
    const features = extractNeuralFeatures({}, 1.5, 1.2);
    expect(features).toBeInstanceOf(Float64Array);
    expect(features.length).toBe(12);
  });

  it('normalises home xG to [0, 1]', () => {
    const features = extractNeuralFeatures({}, 2.0, 1.0);
    expect(features[0]).toBeCloseTo(0.5, 2); // 2.0 / 4.0
  });

  it('normalises away xG to [0, 1]', () => {
    const features = extractNeuralFeatures({}, 1.0, 3.0);
    expect(features[1]).toBeCloseTo(0.75, 2); // 3.0 / 4.0
  });

  it('xG difference is clamped to [-1, 1]', () => {
    const features = extractNeuralFeatures({}, 4.0, 0.5);
    expect(features[2]).toBeLessThanOrEqual(1);
    expect(features[2]).toBeGreaterThanOrEqual(-1);
  });

  it('handles missing fv fields with safe defaults', () => {
    const features = extractNeuralFeatures({}, 1.5, 1.2);
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true);
    }
  });

  it('handles NaN xG inputs gracefully', () => {
    const features = extractNeuralFeatures({}, NaN, 1.2);
    expect(Number.isFinite(features[0])).toBe(true); // safeNum catches NaN
  });
});

// ── Forward Pass ────────────────────────────────────────────────────

describe('neuralForward', () => {
  it('produces finite homeAdjust and awayAdjust', () => {
    const features = new Float64Array(12).fill(0.5);
    const result = neuralForward(features);
    expect(Number.isFinite(result.homeAdjust)).toBe(true);
    expect(Number.isFinite(result.awayAdjust)).toBe(true);
  });

  it('output is bounded to ±0.5', () => {
    const features = new Float64Array(12).fill(1.0);
    const result = neuralForward(features);
    expect(result.homeAdjust).toBeGreaterThanOrEqual(-0.5);
    expect(result.homeAdjust).toBeLessThanOrEqual(0.5);
    expect(result.awayAdjust).toBeGreaterThanOrEqual(-0.5);
    expect(result.awayAdjust).toBeLessThanOrEqual(0.5);
  });

  it('zero input produces near-zero (bias-only) output', () => {
    const features = new Float64Array(12).fill(0);
    const result = neuralForward(features);
    // With zero inputs, only biases contribute → small values
    expect(Math.abs(result.homeAdjust)).toBeLessThan(0.2);
    expect(Math.abs(result.awayAdjust)).toBeLessThan(0.2);
  });

  it('is deterministic — same inputs → same outputs', () => {
    const features = new Float64Array([0.3, 0.4, 0.1, 0.5, 0.6, 0.4, 0.54, 0.5, 0.5, 0.8, 0.7, 0.3]);
    const r1 = neuralForward(features);
    const r2 = neuralForward(features);
    expect(r1.homeAdjust).toBe(r2.homeAdjust);
    expect(r1.awayAdjust).toBe(r2.awayAdjust);
  });
});

// ── applyNeuralAdjustment ───────────────────────────────────────────

describe('applyNeuralAdjustment', () => {
  it('returns adjusted xG values', () => {
    const result = applyNeuralAdjustment(1.5, 1.2, {
      homeFormScore: 0.6,
      awayFormScore: 0.4,
      leagueAvgGoalsPerTeam: 1.35,
      impliedOver25: 0.55,
      h2hAvgGoals: 2.8,
      dataCompletenessScore: 0.85,
      lineupCertaintyScore: 0.7,
      matchChaosScore: 0.3,
    });
    expect(Number.isFinite(result.homeXg)).toBe(true);
    expect(Number.isFinite(result.awayXg)).toBe(true);
    expect(result.homeXg).toBeGreaterThan(0);
    expect(result.awayXg).toBeGreaterThan(0);
  });

  it('adjustment is bounded — never swings more than ±0.5 from input', () => {
    const homeIn = 1.5;
    const awayIn = 1.2;
    const result = applyNeuralAdjustment(homeIn, awayIn, {});
    expect(result.homeXg).toBeGreaterThanOrEqual(homeIn - 0.5 - 0.01);
    expect(result.homeXg).toBeLessThanOrEqual(homeIn + 0.5 + 0.01);
    expect(result.awayXg).toBeGreaterThanOrEqual(awayIn - 0.5 - 0.01);
    expect(result.awayXg).toBeLessThanOrEqual(awayIn + 0.5 + 0.01);
  });

  it('NaN homeXg → returns identity', () => {
    const result = applyNeuralAdjustment(NaN, 1.2, {});
    expect(result.homeXg).toBeNaN(); // identity means return the NaN as-is
    expect(result.awayXg).toBe(1.2);
  });

  it('NaN awayXg → returns identity', () => {
    const result = applyNeuralAdjustment(1.5, NaN, {});
    expect(result.homeXg).toBe(1.5);
    expect(result.awayXg).toBeNaN();
  });

  it('Infinity → returns identity', () => {
    const result = applyNeuralAdjustment(Infinity, 1.2, {});
    expect(result.homeXg).toBe(Infinity);
  });

  it('total floor of 0.5 is maintained', () => {
    // Very low inputs
    const result = applyNeuralAdjustment(0.15, 0.15, {});
    expect(result.homeXg + result.awayXg).toBeGreaterThanOrEqual(0.5 - 0.01);
  });

  it('both outputs are always positive', () => {
    const result = applyNeuralAdjustment(0.2, 0.3, {});
    expect(result.homeXg).toBeGreaterThanOrEqual(0.1);
    expect(result.awayXg).toBeGreaterThanOrEqual(0.1);
  });
});

// ── Property-based: Random Inputs ───────────────────────────────────

describe('neural layer — property-based fuzz', () => {
  it('100 random feature vectors never produce NaN or Infinity', () => {
    for (let i = 0; i < 100; i++) {
      const features = new Float64Array(12);
      for (let j = 0; j < 12; j++) {
        features[j] = Math.random() * 2 - 0.5; // [-0.5, 1.5] range
      }
      const result = neuralForward(features);
      expect(Number.isFinite(result.homeAdjust)).toBe(true);
      expect(Number.isFinite(result.awayAdjust)).toBe(true);
      expect(result.homeAdjust).toBeGreaterThanOrEqual(-0.5);
      expect(result.homeAdjust).toBeLessThanOrEqual(0.5);
    }
  });

  it('100 random xG inputs + feature vectors → valid output', () => {
    for (let i = 0; i < 100; i++) {
      const homeXg = Math.random() * 4;
      const awayXg = Math.random() * 4;
      const fv = {
        homeFormScore: Math.random(),
        awayFormScore: Math.random(),
        leagueAvgGoalsPerTeam: 0.8 + Math.random() * 1.5,
        impliedOver25: Math.random(),
        h2hAvgGoals: Math.random() * 5,
        dataCompletenessScore: Math.random(),
        lineupCertaintyScore: Math.random(),
        matchChaosScore: Math.random(),
      };
      const result = applyNeuralAdjustment(homeXg, awayXg, fv);
      expect(Number.isFinite(result.homeXg)).toBe(true);
      expect(Number.isFinite(result.awayXg)).toBe(true);
      expect(result.homeXg).toBeGreaterThanOrEqual(0.1);
      expect(result.awayXg).toBeGreaterThanOrEqual(0.1);
    }
  });
});

// ── Metadata ────────────────────────────────────────────────────────

describe('NEURAL_LAYER_META', () => {
  it('has correct architecture string', () => {
    expect(NEURAL_LAYER_META.architecture).toBe('12→16(ReLU)→8(ReLU)→2(tanh)');
  });

  it('parameter count matches weight arrays', () => {
    // W1: 16×12 = 192, b1: 16, W2: 8×16 = 128, b2: 8, W3: 2×8 = 16, b3: 2
    expect(NEURAL_LAYER_META.parameters).toBe(192 + 16 + 128 + 8 + 16 + 2);
  });

  it('maxAdjustment is 0.5', () => {
    expect(NEURAL_LAYER_META.maxAdjustment).toBe(0.5);
  });
});
