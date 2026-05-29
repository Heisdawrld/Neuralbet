// ═══════════════════════════════════════════════════════════════════════
// buildMarketCandidates + computeImpliedProbabilities tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildMarketCandidates } from '../build-candidates';
import { computeImpliedProbabilities, lookupOdds } from '../implied-odds';

const fullProbs = {
  homeWin: 0.50, draw: 0.25, awayWin: 0.25,
  over15: 0.78, over25: 0.55, over35: 0.28,
  under15: 0.22, under25: 0.45, under35: 0.72,
  bttsYes: 0.58, bttsNo: 0.42,
  homeOver05: 0.85, homeOver15: 0.50, homeOver25: 0.18,
  homeUnder15: 0.50,
  awayOver05: 0.75, awayOver15: 0.35, awayOver25: 0.10,
  awayUnder15: 0.65,
  handicapHome1: 0.20, handicapAwayMinus1: 0.10,
  handicapHomePlus1: 0.80, handicapAway1: 0.50,
};

// ─────────────────────────────────────────────────────────────────────
// buildMarketCandidates
// ─────────────────────────────────────────────────────────────────────
describe('buildMarketCandidates', () => {
  it('builds a candidate for every market with a defined probKey or compute', () => {
    const candidates = buildMarketCandidates(fullProbs);
    expect(candidates.length).toBeGreaterThanOrEqual(28);
  });

  it('every candidate has modelProbability in [0, 1]', () => {
    const candidates = buildMarketCandidates(fullProbs);
    for (const c of candidates) {
      expect(c.modelProbability, `${c.marketKey} out of range`).toBeGreaterThanOrEqual(0);
      expect(c.modelProbability, `${c.marketKey} out of range`).toBeLessThanOrEqual(1);
    }
  });

  it('every candidate starts with null implied/edge/odds and finalScore=0', () => {
    const candidates = buildMarketCandidates(fullProbs);
    for (const c of candidates) {
      expect(c.impliedProbability).toBe(null);
      expect(c.edge).toBe(null);
      expect(c.bookmakerOdds).toBe(null);
      expect(c.finalScore).toBe(0);
    }
  });

  it('derived markets (double-chance, DNB) reflect their compute formula', () => {
    const candidates = buildMarketCandidates(fullProbs);
    const dcHome = candidates.find(c => c.marketKey === 'double_chance_home')!;
    const dnbHome = candidates.find(c => c.marketKey === 'dnb_home')!;
    expect(dcHome.modelProbability).toBeCloseTo(fullProbs.homeWin + fullProbs.draw, 3);
    expect(dnbHome.modelProbability).toBeCloseTo(fullProbs.homeWin / (fullProbs.homeWin + fullProbs.awayWin), 3);
  });

  it('handles empty/missing probs without crashing', () => {
    const candidates = buildMarketCandidates({});
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(Number.isFinite(c.modelProbability)).toBe(true);
    }
  });

  it('handles null calibratedProbs without crashing', () => {
    const candidates = buildMarketCandidates(null as any);
    expect(candidates.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// lookupOdds
// ─────────────────────────────────────────────────────────────────────
describe('lookupOdds', () => {
  const snapshot = {
    home_win: 1.85, draw: 3.40, away_win: 4.20,
    over_25: 1.91, under_25: 1.89,
    btts_yes: 1.80, btts_no: 2.00,
  };

  it('returns decimal odds for known market', () => {
    expect(lookupOdds('home_win', snapshot)).toBe(1.85);
    expect(lookupOdds('over_25', snapshot)).toBe(1.91);
  });

  it('returns null for null snapshot', () => {
    expect(lookupOdds('home_win', null)).toBe(null);
  });

  it('returns null for unpriced market', () => {
    expect(lookupOdds('handicap_home_minus1', snapshot)).toBe(null);
  });

  it('handles alternative spellings (under_2_5, over25, etc.)', () => {
    const alt = { 'over_2_5': 1.91, 'btts_yes': 1.80 };
    expect(lookupOdds('over_25', alt)).toBe(1.91);
  });

  it('rejects odds ≤ 1.0 (invalid)', () => {
    expect(lookupOdds('home_win', { home_win: 1.0 })).toBe(null);
    expect(lookupOdds('home_win', { home_win: 0.5 })).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────
// computeImpliedProbabilities
// ─────────────────────────────────────────────────────────────────────
describe('computeImpliedProbabilities', () => {
  it('annotates priced candidates with implied prob + edge + odds', () => {
    const cands = buildMarketCandidates(fullProbs);
    const enriched = computeImpliedProbabilities(cands, { home_win: 2.00 });
    const home = enriched.find(c => c.marketKey === 'home_win')!;
    expect(home.bookmakerOdds).toBe(2.00);
    expect(home.impliedProbability).toBe(0.5);
    expect(home.edge).toBeCloseTo(fullProbs.homeWin - 0.5, 3);
  });

  it('leaves unpriced candidates with null implied/edge/odds', () => {
    const cands = buildMarketCandidates(fullProbs);
    const enriched = computeImpliedProbabilities(cands, { home_win: 2.00 });
    const draw = enriched.find(c => c.marketKey === 'draw')!;
    expect(draw.bookmakerOdds).toBe(null);
    expect(draw.impliedProbability).toBe(null);
    expect(draw.edge).toBe(null);
  });

  it('handles null odds snapshot — every candidate stays unpriced', () => {
    const cands = buildMarketCandidates(fullProbs);
    const enriched = computeImpliedProbabilities(cands, null);
    expect(enriched.every(c => c.bookmakerOdds === null)).toBe(true);
    expect(enriched.every(c => c.edge === null)).toBe(true);
  });

  it('positive edge when model prob > implied prob', () => {
    const cands = [
      { marketKey: 'home_win', selection: 'Home Win', modelProbability: 0.60,
        impliedProbability: null, edge: null, finalScore: 0, bookmakerOdds: null },
    ];
    const enriched = computeImpliedProbabilities(cands, { home_win: 2.50 }); // implied = 0.40
    expect(enriched[0].edge).toBeCloseTo(0.20, 3);
  });

  it('negative edge when model prob < implied prob', () => {
    const cands = [
      { marketKey: 'home_win', selection: 'Home Win', modelProbability: 0.30,
        impliedProbability: null, edge: null, finalScore: 0, bookmakerOdds: null },
    ];
    const enriched = computeImpliedProbabilities(cands, { home_win: 1.50 }); // implied ≈ 0.667
    expect(enriched[0].edge).toBeCloseTo(0.30 - 0.6667, 2);
  });
});
