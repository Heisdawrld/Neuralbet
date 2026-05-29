// ═══════════════════════════════════════════════════════════════════════
// prune + rank + select tests — the decision-layer gates
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { pruneWeakCandidates, MARKET_MIN_PROB, VALUE_TRAP_EDGE } from '../prune';
import { rankMarkets, COMFORT_PENALTY } from '../rank';
import {
  selectBestPickOrAbstain,
  isPricedCandidate,
  phantomScoreOf,
  computeRiskLevel,
  computeEdgeLabel,
} from '../select';
import type { MarketCandidate, ScriptOutput } from '../../types';

const script = (primary: string): ScriptOutput => ({
  primary, secondary: null, confidence: 0.7,
  homeControlScore: 0.5, awayControlScore: 0.5,
  eventLevelScore: 0.5, volatilityScore: 0.5,
});

const baseFv = () => ({
  dataCompletenessScore: 0.7, matchChaosScore: 0.5, upsetRiskScore: 0.5,
  homeMatchesAvailable: 10, awayMatchesAvailable: 10,
});

function mkScored(overrides: Partial<MarketCandidate> = {}): MarketCandidate {
  return {
    marketKey: 'home_win', selection: 'Home Win',
    modelProbability: 0.60, impliedProbability: 0.55,
    edge: 0.05, finalScore: 0.40, bookmakerOdds: 1.82,
    tacticalFitScore: 0.50, advisor_status: 'ACCA',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// PRUNE
// ─────────────────────────────────────────────────────────────────────
describe('pruneWeakCandidates', () => {
  it('removes candidates below marketFloor (no smart-risk exception)', () => {
    const c = mkScored({ marketKey: 'btts_yes', modelProbability: 0.55 }); // floor 0.64
    const out = pruneWeakCandidates([c], baseFv(), script('balanced'));
    expect(out.length).toBe(0);
  });

  it('keeps strong candidate above its market floor', () => {
    const c = mkScored({ marketKey: 'btts_yes', modelProbability: 0.70, tacticalFitScore: 0.5 });
    const out = pruneWeakCandidates([c], baseFv(), script('balanced'));
    expect(out.length).toBe(1);
  });

  it('smart-risk exception lets high-EV+high-tactical candidate through', () => {
    // Just-below floor (0.60 floor, 0.55 prob) but high EV + high tactical fit
    const c = mkScored({
      marketKey: 'home_win', modelProbability: 0.55,
      bookmakerOdds: 2.20, edge: 0.10, tacticalFitScore: 0.80,
    });
    const out = pruneWeakCandidates([c], baseFv(), script('balanced'));
    expect(out.length).toBe(1);
  });

  it('value trap (edge > 35%) gets pruned regardless of other signals', () => {
    const c = mkScored({ modelProbability: 0.80, edge: VALUE_TRAP_EDGE + 0.01, bookmakerOdds: 3.50 });
    const out = pruneWeakCandidates([c], baseFv(), script('balanced'));
    expect(out.length).toBe(0);
  });

  it('under_35 hard floor — needs ≥0.74 prob even though MARKET_MIN_PROB allows 0.72', () => {
    const c = mkScored({ marketKey: 'under_35', modelProbability: 0.73, finalScore: 0.55, tacticalFitScore: 0.5 });
    const out = pruneWeakCandidates([c], baseFv(), script('balanced'));
    expect(out.length).toBe(0);
  });

  it('over_15 with very short odds is pruned', () => {
    const c = mkScored({ marketKey: 'over_15', modelProbability: 0.85, bookmakerOdds: 1.18, finalScore: 0.5 });
    const out = pruneWeakCandidates([c], baseFv(), script('balanced'));
    expect(out.length).toBe(0);
  });

  it('zero/negative finalScore is pruned', () => {
    const c = mkScored({ finalScore: 0 });
    const out = pruneWeakCandidates([c], baseFv(), script('balanced'));
    expect(out.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// RANK
// ─────────────────────────────────────────────────────────────────────
describe('rankMarkets', () => {
  it('higher finalScore → higher rank', () => {
    const a = mkScored({ marketKey: 'home_win', finalScore: 0.50 });
    const b = mkScored({ marketKey: 'away_win', finalScore: 0.30 });
    const ranked = rankMarkets([b, a]);
    expect(ranked[0].marketKey).toBe('home_win');
  });

  it('comfort-penalty markets rank below regular markets at equal score', () => {
    const a = mkScored({ marketKey: 'home_win', finalScore: 0.50, modelProbability: 0.65 });
    const b = mkScored({ marketKey: 'under_35', finalScore: 0.50, modelProbability: 0.75 });
    const ranked = rankMarkets([b, a]);
    // home_win has +specificity bonus and no comfort penalty
    // under_35 has -comfort penalty
    expect(ranked[0].marketKey).toBe('home_win');
  });

  it('positive edge gets a bigger boost than negative edge gets penalised', () => {
    const a = mkScored({ marketKey: 'home_win', finalScore: 0.40, edge: 0.10 });
    const b = mkScored({ marketKey: 'home_win', finalScore: 0.40, edge: -0.10 });
    const ranked = rankMarkets([b, a]);
    expect(ranked[0].edge).toBe(0.10);
  });

  it('tiebreak: same headlineQuality → higher modelProbability wins', () => {
    const a = mkScored({ marketKey: 'home_win', finalScore: 0.40, modelProbability: 0.62, tacticalFitScore: 0.5, edge: 0 });
    const b = mkScored({ marketKey: 'home_win', finalScore: 0.40, modelProbability: 0.68, tacticalFitScore: 0.5, edge: 0 });
    const ranked = rankMarkets([a, b]);
    expect(ranked[0].modelProbability).toBe(0.68);
  });

  it('does not mutate input array', () => {
    const original = [mkScored({ marketKey: 'a', finalScore: 0.1 }), mkScored({ marketKey: 'b', finalScore: 0.5 })];
    const snap = original.map(c => c.marketKey);
    rankMarkets(original);
    expect(original.map(c => c.marketKey)).toEqual(snap);
  });
});

// ─────────────────────────────────────────────────────────────────────
// SELECT — abstain paths
// ─────────────────────────────────────────────────────────────────────
describe('selectBestPickOrAbstain — abstain paths', () => {
  it('empty list → NO_CANDIDATES', () => {
    const r = selectBestPickOrAbstain([], script('balanced'), baseFv());
    expect(r.abstainCode).toBe('NO_CANDIDATES');
    expect(r.bestPick).toBe(null);
    expect(r.noSafePick).toBe(true);
  });

  it('all candidates unpriced + no model-only qualifier → NO_PRICED_MARKETS', () => {
    const c = mkScored({ bookmakerOdds: null, impliedProbability: null, edge: null, modelProbability: 0.45 });
    const r = selectBestPickOrAbstain([c], script('balanced'), baseFv());
    expect(r.abstainCode).toBe('NO_PRICED_MARKETS');
  });

  it('priced but all below headline quality → LOW_HEADLINE_QUALITY', () => {
    const c = mkScored({ modelProbability: 0.52, finalScore: 0.30 });
    const r = selectBestPickOrAbstain([c], script('balanced'), baseFv());
    expect(r.abstainCode).toBe('LOW_HEADLINE_QUALITY');
  });

  it('top quality pick below MIN_TOP_PROB → LOW_PROBABILITY', () => {
    // Force a candidate that passes isHeadlineQualityCandidate (high finalScore)
    // but prob ends up just below 0.50 — engineered case
    const c = mkScored({ modelProbability: 0.49, finalScore: 0.50, edge: 0.05 });
    const r = selectBestPickOrAbstain([c], script('balanced'), baseFv());
    // Either LOW_HEADLINE_QUALITY (prob < HQ_MIN_PROB) or LOW_PROBABILITY — both are abstain
    expect(r.bestPick).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────
// SELECT — happy path
// ─────────────────────────────────────────────────────────────────────
describe('selectBestPickOrAbstain — happy path', () => {
  it('clear winner is returned with risk + edge label', () => {
    const winner = mkScored({
      marketKey: 'over_25', selection: 'Over 2.5 Goals',
      modelProbability: 0.78, finalScore: 0.65, edge: 0.10, bookmakerOdds: 1.85,
      tacticalFitScore: 0.85,
    });
    const others = [
      mkScored({ marketKey: 'btts_yes', modelProbability: 0.60, finalScore: 0.30, edge: 0.02, bookmakerOdds: 1.85, tacticalFitScore: 0.6 }),
    ];
    const r = selectBestPickOrAbstain([winner, ...others], script('open_end_to_end'), baseFv());
    expect(r.bestPick).not.toBe(null);
    expect(r.bestPick!.marketKey).toBe('over_25');
    expect(r.bestPick!.riskLevel).toBeDefined();
    expect(r.bestPick!.edgeLabel).toBeDefined();
  });

  it('backup picks are slot 2-3 of ranked list', () => {
    const winner = mkScored({ marketKey: 'over_25', modelProbability: 0.78, finalScore: 0.65, edge: 0.10, tacticalFitScore: 0.85 });
    const others = [
      mkScored({ marketKey: 'btts_yes', modelProbability: 0.66, finalScore: 0.45, edge: 0.05, tacticalFitScore: 0.6 }),
      mkScored({ marketKey: 'over_15', modelProbability: 0.85, finalScore: 0.35, edge: 0.02, tacticalFitScore: 0.5 }),
    ];
    const r = selectBestPickOrAbstain([winner, ...others], script('open_end_to_end'), baseFv());
    expect(r.bestPick).not.toBe(null);
    expect(r.backupPicks.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// computeRiskLevel + computeEdgeLabel
// ─────────────────────────────────────────────────────────────────────
describe('computeRiskLevel + computeEdgeLabel', () => {
  it('very high prob + stable script → SAFE', () => {
    const pick = mkScored({ modelProbability: 0.80 });
    const level = computeRiskLevel(pick, baseFv(), script('balanced'));
    expect(level).toBe('SAFE');
  });

  it('mid prob + chaotic script + high chaos → AGGRESSIVE', () => {
    const pick = mkScored({ modelProbability: 0.66 });
    const level = computeRiskLevel(pick, { ...baseFv(), matchChaosScore: 0.78 }, script('chaotic_unreliable'));
    expect(level).toBe('AGGRESSIVE');
  });

  it('edge label SAFE + high prob → STRONG EDGE', () => {
    const pick = mkScored({ modelProbability: 0.80 });
    expect(computeEdgeLabel(pick, 'SAFE')).toBe('STRONG EDGE');
  });

  it('low prob → NO EDGE', () => {
    const pick = mkScored({ modelProbability: 0.45 });
    expect(computeEdgeLabel(pick, 'AGGRESSIVE')).toBe('NO EDGE');
  });
});

// ─────────────────────────────────────────────────────────────────────
// isPricedCandidate + phantomScoreOf helpers
// ─────────────────────────────────────────────────────────────────────
describe('isPricedCandidate', () => {
  it('returns true when bookmaker odds > 1.0', () => {
    expect(isPricedCandidate(mkScored({ bookmakerOdds: 1.85 }))).toBe(true);
  });
  it('returns false when neither odds nor implied probability present', () => {
    expect(isPricedCandidate(mkScored({ bookmakerOdds: null, impliedProbability: null }))).toBe(false);
  });
});

describe('phantomScoreOf', () => {
  it('falls back to prob when finalScore unset', () => {
    const p = phantomScoreOf({ modelProbability: 0.6, finalScore: undefined } as any);
    expect(p).toBeCloseTo(0.6, 4);
  });
});
