// ═══════════════════════════════════════════════════════════════════════
// scoreMarketCandidates + getTacticalFit tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { scoreMarketCandidates, BAD_MARKET_PENALTY, computeAdvisorStatus, FINAL_SCORE_MIN, FINAL_SCORE_MAX } from '../score';
import { getTacticalFit, CHAOTIC_TACTICAL_FIT, DEFAULT_TACTICAL_FIT } from '../tactical-fit';
import type { MarketCandidate, ScriptOutput } from '../../types';

const script = (primary: string, secondary: string | null = null): ScriptOutput => ({
  primary, secondary, confidence: 0.7,
  homeControlScore: 0.5, awayControlScore: 0.5,
  eventLevelScore: 0.5, volatilityScore: 0.5,
});

const baseFv = () => ({
  dataCompletenessScore: 0.7, matchChaosScore: 0.5, upsetRiskScore: 0.5,
  homeMatchesAvailable: 10, awayMatchesAvailable: 10,
  homePointsLast5: 9, awayPointsLast5: 6,
});

function mkCandidate(overrides: Partial<MarketCandidate>): MarketCandidate {
  return {
    marketKey: 'home_win', selection: 'Home Win',
    modelProbability: 0.55, impliedProbability: 0.50,
    edge: 0.05, finalScore: 0, bookmakerOdds: 2.00,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tactical fit
// ─────────────────────────────────────────────────────────────────────
describe('getTacticalFit', () => {
  it('chaotic script → constant 0.15 for everything', () => {
    expect(getTacticalFit('home_win', script('chaotic_unreliable'))).toBe(CHAOTIC_TACTICAL_FIT);
    expect(getTacticalFit('over_25', script('chaotic_unreliable'))).toBe(CHAOTIC_TACTICAL_FIT);
  });

  it('open_end_to_end → high fit for overs/BTTS', () => {
    expect(getTacticalFit('btts_yes', script('open_end_to_end'))).toBeGreaterThan(0.85);
    expect(getTacticalFit('over_25', script('open_end_to_end'))).toBeGreaterThan(0.85);
  });

  it('open_end_to_end → low fit for unders/BTTS no', () => {
    expect(getTacticalFit('under_25', script('open_end_to_end'))).toBeLessThan(0.20);
    expect(getTacticalFit('btts_no', script('open_end_to_end'))).toBeLessThan(0.20);
  });

  it('tight_low_event → high fit for unders/BTTS no', () => {
    expect(getTacticalFit('under_25', script('tight_low_event'))).toBeGreaterThan(0.85);
    expect(getTacticalFit('btts_no', script('tight_low_event'))).toBeGreaterThan(0.85);
  });

  it('unknown market under primary script → default 0.4', () => {
    expect(getTacticalFit('handicap_away_plus1', script('open_end_to_end'))).toBe(DEFAULT_TACTICAL_FIT);
  });

  it('secondary script falls through with 0.7× weight', () => {
    // dominant_home pricelist has home_win at 0.92
    const primaryOnly = getTacticalFit('home_win', script('dominant_home_pressure'));
    const secondaryOnly = getTacticalFit('home_win', script('open_end_to_end', 'dominant_home_pressure'));
    // primary doesn't know home_win for open_end_to_end → falls to secondary
    expect(secondaryOnly).toBeCloseTo(0.92 * 0.7, 3);
    expect(primaryOnly).toBe(0.92);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BAD_MARKET_PENALTY
// ─────────────────────────────────────────────────────────────────────
describe('BAD_MARKET_PENALTY', () => {
  it('home_over_05 always returns 0.9', () => {
    expect(BAD_MARKET_PENALTY.home_over_05(mkCandidate({ marketKey: 'home_over_05' }))).toBe(0.9);
  });
  it('under_35 penalty escalates above 0.72 prob', () => {
    const low = BAD_MARKET_PENALTY.under_35(mkCandidate({ marketKey: 'under_35', modelProbability: 0.70 }));
    const high = BAD_MARKET_PENALTY.under_35(mkCandidate({ marketKey: 'under_35', modelProbability: 0.85 }));
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(low);
  });
  it('over_15 with short odds is heavily penalised', () => {
    const short = BAD_MARKET_PENALTY.over_15(mkCandidate({ marketKey: 'over_15', bookmakerOdds: 1.20, modelProbability: 0.85 }));
    expect(short).toBe(0.80);
  });
  it('over_15 with healthy odds has no penalty', () => {
    const ok = BAD_MARKET_PENALTY.over_15(mkCandidate({ marketKey: 'over_15', bookmakerOdds: 1.55, modelProbability: 0.75 }));
    expect(ok).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// scoreMarketCandidates
// ─────────────────────────────────────────────────────────────────────
describe('scoreMarketCandidates', () => {
  it('output has every candidate with finalScore in [-0.5, 1.0]', () => {
    const cands = [
      mkCandidate({ marketKey: 'home_win', modelProbability: 0.55, edge: 0.05 }),
      mkCandidate({ marketKey: 'over_25', modelProbability: 0.70, edge: 0.12, bookmakerOdds: 1.85 }),
      mkCandidate({ marketKey: 'under_35', modelProbability: 0.40, edge: -0.10, bookmakerOdds: 1.50 }),
    ];
    const scored = scoreMarketCandidates(cands, script('open_end_to_end'), baseFv());
    for (const s of scored) {
      expect(s.finalScore).toBeGreaterThanOrEqual(FINAL_SCORE_MIN);
      expect(s.finalScore).toBeLessThanOrEqual(FINAL_SCORE_MAX);
    }
  });

  it('positive edge increases finalScore vs negative edge', () => {
    const c1 = mkCandidate({ marketKey: 'over_25', edge: 0.15 });
    const c2 = mkCandidate({ marketKey: 'over_25', edge: -0.05 });
    const scored = scoreMarketCandidates([c1, c2], script('open_end_to_end'), baseFv());
    expect(scored[0].finalScore).toBeGreaterThan(scored[1].finalScore);
  });

  it('script-mismatched markets receive a heavier penalty', () => {
    const cand = mkCandidate({ marketKey: 'under_25', modelProbability: 0.55, edge: 0.05 });
    const tightFit = scoreMarketCandidates([cand], script('tight_low_event'), baseFv());
    const openMismatch = scoreMarketCandidates([cand], script('open_end_to_end'), baseFv());
    expect(tightFit[0].finalScore).toBeGreaterThan(openMismatch[0].finalScore);
  });

  it('data starvation drops every candidate score uniformly', () => {
    const cand = mkCandidate({});
    const full = scoreMarketCandidates([cand], script('balanced'), { ...baseFv(), homeMatchesAvailable: 10, awayMatchesAvailable: 10 });
    const starved = scoreMarketCandidates([cand], script('balanced'), { ...baseFv(), homeMatchesAvailable: 2, awayMatchesAvailable: 2 });
    expect(full[0].finalScore).toBeGreaterThan(starved[0].finalScore);
  });

  it('every candidate emits an advisor_status', () => {
    const cand = mkCandidate({});
    const scored = scoreMarketCandidates([cand], script('balanced'), baseFv());
    expect(['BET', 'ACCA', 'SKIP']).toContain(scored[0].advisor_status!);
  });

  it('NaN-safe — bad input does not produce NaN finalScore', () => {
    const cand = mkCandidate({ modelProbability: NaN as any, edge: NaN as any, bookmakerOdds: NaN as any });
    const scored = scoreMarketCandidates([cand], script('balanced'), baseFv());
    expect(Number.isFinite(scored[0].finalScore)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// computeAdvisorStatus
// ─────────────────────────────────────────────────────────────────────
describe('computeAdvisorStatus', () => {
  it('high prob + good odds → BET (when pred score healthy)', () => {
    expect(computeAdvisorStatus(0.78, 1.50, true, 0.7)).toBe('BET');
  });
  it('high prob but low pred → ACCA (engine signals caution)', () => {
    expect(computeAdvisorStatus(0.78, 1.50, true, 0.15)).toBe('ACCA');
  });
  it('mid prob + tight odds + positive EV → ACCA', () => {
    expect(computeAdvisorStatus(0.62, 1.45, true, 0.6)).toBe('ACCA');
  });
  it('low prob → SKIP', () => {
    expect(computeAdvisorStatus(0.40, 2.00, true, 0.6)).toBe('SKIP');
  });
  it('priced market with negative EV → SKIP', () => {
    expect(computeAdvisorStatus(0.55, 1.40, false, 0.6)).toBe('SKIP');
  });
});
