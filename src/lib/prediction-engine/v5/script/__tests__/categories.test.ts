// ═══════════════════════════════════════════════════════════════════════
// Per-category script scorer tests — pin each category's scoring contract
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { scoreDominantHome } from '../categories/dominant-home';
import { scoreDominantAway } from '../categories/dominant-away';
import { scoreOpenEndToEnd } from '../categories/open-end-to-end';
import { scoreTightLowEvent } from '../categories/tight-low-event';
import { scoreChaoticUnreliable } from '../categories/chaotic-unreliable';
import type { ScriptInputs } from '../types';

const balanced = (): ScriptInputs => ({
  homeStrengthGap: 0,
  awayStrengthGap: 0,
  homeDefensiveWeakness: 0.44,
  awayDefensiveWeakness: 0.44,
  homeAttackRating01: 0.4,
  awayAttackRating01: 0.4,
  homeHomeGoalsFor: 1.2,
  awayAwayGoalsFor: 1.0,
  homeAvgConceded: 1.1,
  awayAvgConceded: 1.1,
  awayAwayGoalsAgainst: 1.1,
  matchChaosScore: 0.5,
  dataCompletenessScore: 0.5,
  upsetRiskScore: 0.5,
  combinedBttsRate: 0.45,
  avgTotalGoalsProxy: 2.2,
});

// ─────────────────────────────────────────────────────────────────────
// All scorers: output always in [0, 1]
// ─────────────────────────────────────────────────────────────────────
describe('all category scorers — output in [0, 1]', () => {
  const scorers = {
    scoreDominantHome, scoreDominantAway, scoreOpenEndToEnd,
    scoreTightLowEvent, scoreChaoticUnreliable,
  };
  for (const [name, fn] of Object.entries(scorers)) {
    it(`${name}: clamped to [0, 1]`, () => {
      fc.assert(
        fc.property(
          fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 3, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          (strengthGap, defWeakness, goals, chaos) => {
            const inputs: ScriptInputs = {
              ...balanced(),
              homeStrengthGap: strengthGap, awayStrengthGap: -strengthGap,
              homeDefensiveWeakness: defWeakness, awayDefensiveWeakness: defWeakness,
              homeHomeGoalsFor: goals, awayAwayGoalsFor: goals,
              homeAvgConceded: goals, awayAvgConceded: goals,
              awayAwayGoalsAgainst: goals,
              matchChaosScore: chaos, dataCompletenessScore: chaos, upsetRiskScore: chaos,
              avgTotalGoalsProxy: goals * 2,
            };
            const s = fn(inputs);
            return s >= 0 && s <= 1;
          },
        ),
        { numRuns: 100 },
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Dominant home
// ─────────────────────────────────────────────────────────────────────
describe('scoreDominantHome', () => {
  it('balanced fixture → low/moderate score', () => {
    expect(scoreDominantHome(balanced())).toBeLessThan(0.5);
  });
  it('strong home + leaky away → high score', () => {
    const s = scoreDominantHome({
      ...balanced(),
      homeStrengthGap: 0.4,
      awayDefensiveWeakness: 0.75,
      homeHomeGoalsFor: 2.0,
      awayAwayGoalsAgainst: 1.6,
      matchChaosScore: 0.4,
    });
    expect(s).toBeGreaterThan(0.8);
  });
  it('strong home but high volatility → score dampened', () => {
    const stable = scoreDominantHome({ ...balanced(), homeStrengthGap: 0.4, matchChaosScore: 0.4 });
    const chaotic = scoreDominantHome({ ...balanced(), homeStrengthGap: 0.4, matchChaosScore: 0.8 });
    expect(stable).toBeGreaterThan(chaotic);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Dominant away
// ─────────────────────────────────────────────────────────────────────
describe('scoreDominantAway', () => {
  it('balanced fixture → low score', () => {
    expect(scoreDominantAway(balanced())).toBeLessThan(0.5);
  });
  it('strong away + leaky home → high score', () => {
    const s = scoreDominantAway({
      ...balanced(),
      awayStrengthGap: 0.3,
      homeDefensiveWeakness: 0.70,
      awayAwayGoalsFor: 1.8,
    });
    expect(s).toBeGreaterThan(0.7);
  });
  it('away threshold (0.20) is lower than home threshold (0.25) — diagnostic', () => {
    // At exactly 0.22 strength gap, away triggers but home wouldn't
    const awayTriggered = scoreDominantAway({ ...balanced(), awayStrengthGap: 0.22, homeDefensiveWeakness: 0.6 });
    const homeNotTriggered = scoreDominantHome({ ...balanced(), homeStrengthGap: 0.22, awayDefensiveWeakness: 0.6 });
    // away gets the +0.35 bonus, home does NOT get its +0.30 bonus
    expect(awayTriggered).toBeGreaterThan(homeNotTriggered);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Open end-to-end
// ─────────────────────────────────────────────────────────────────────
describe('scoreOpenEndToEnd', () => {
  it('balanced fixture → low score', () => {
    expect(scoreOpenEndToEnd(balanced())).toBeLessThan(0.5);
  });
  it('both attacks + both leaky + high BTTS → near 1.0', () => {
    const s = scoreOpenEndToEnd({
      ...balanced(),
      homeAttackRating01: 0.7, awayAttackRating01: 0.7,
      homeAvgConceded: 1.5, awayAvgConceded: 1.5,
      combinedBttsRate: 0.65,
      avgTotalGoalsProxy: 3.0,
    });
    expect(s).toBeGreaterThan(0.9);
  });
  it('one-sided attack does NOT trigger high score', () => {
    const s = scoreOpenEndToEnd({
      ...balanced(),
      homeAttackRating01: 0.8, awayAttackRating01: 0.3,
      combinedBttsRate: 0.30,
    });
    expect(s).toBeLessThan(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Tight low event
// ─────────────────────────────────────────────────────────────────────
describe('scoreTightLowEvent', () => {
  it('balanced fixture → low/moderate score', () => {
    expect(scoreTightLowEvent(balanced())).toBeLessThan(0.6);
  });
  it('Italian-style fixture (low scoring, strong defences) → near 1.0', () => {
    const s = scoreTightLowEvent({
      ...balanced(),
      homeHomeGoalsFor: 0.9, awayAwayGoalsFor: 0.8,
      homeAvgConceded: 0.7, awayAvgConceded: 0.8,
      homeAttackRating01: 0.35, awayAttackRating01: 0.35,
    });
    expect(s).toBeGreaterThan(0.9);
  });
  it('high-scoring fixture → low score', () => {
    const s = scoreTightLowEvent({
      ...balanced(),
      homeHomeGoalsFor: 2.0, awayAwayGoalsFor: 1.8,
      homeAvgConceded: 1.5, awayAvgConceded: 1.5,
    });
    expect(s).toBeLessThanOrEqual(0.25);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Chaotic unreliable
// ─────────────────────────────────────────────────────────────────────
describe('scoreChaoticUnreliable', () => {
  it('balanced fixture → low/moderate score', () => {
    expect(scoreChaoticUnreliable(balanced())).toBeLessThan(0.5);
  });
  it('high volatility alone → high score', () => {
    const s = scoreChaoticUnreliable({ ...balanced(), matchChaosScore: 0.85 });
    expect(s).toBeGreaterThan(0.7);
  });
  it('low data quality alone → high score', () => {
    const s = scoreChaoticUnreliable({ ...balanced(), dataCompletenessScore: 0.20 });
    expect(s).toBeGreaterThan(0.5);
  });
  it('all three signals together → saturates at 1.0', () => {
    const s = scoreChaoticUnreliable({
      ...balanced(),
      matchChaosScore: 0.9, dataCompletenessScore: 0.1, upsetRiskScore: 0.85,
    });
    expect(s).toBe(1.0);
  });
});
