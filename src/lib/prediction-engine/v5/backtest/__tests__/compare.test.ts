// ═══════════════════════════════════════════════════════════════════════
// compare.ts (ablation) — tests for the diff harness
//
// We exercise the verdict classifier + comparison structure with
// synthetic BacktestReport objects so we don't depend on a live DB.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  formatComparison,
  VERDICT_NEUTRAL_THRESHOLD,
  type AblationResult,
} from '../compare';
import type { BacktestReport } from '../runner';

function mkReport(brier: number, samples = 100): BacktestReport {
  return {
    options: { from: '2026-01-01', to: '2026-03-01', markets: 'all',
               maxFixtures: 1000, threshold: 0.5, useCache: false } as any,
    fixturesScored: samples,
    fixturesSkipped: 0,
    overallBrier: brier,
    overallLogLoss: brier * 2.5,
    perMarket: [
      { market: 'over_25', samples, brier, logLoss: brier * 2.5,
        hitRate: 0.55, hitRateBeliefs: 50, hitRateHits: 27,
        roi: 0.05, roiBets: 50, roiProfit: 2.5, roiStaked: 50 },
    ],
    calibration: [],
    runMs: 100,
    generatedAt: '2026-05-29T06:00:00Z',
  };
}

function mkAblation(brierOn: number, brierOff: number): AblationResult {
  const onReport = mkReport(brierOn);
  const offReport = mkReport(brierOff);
  return {
    module: 'derby',
    fixturesScored: 100,
    overall: {
      brierOn, brierOff,
      brierDelta: brierOn - brierOff,
      logLossOn: brierOn * 2.5, logLossOff: brierOff * 2.5,
      logLossDelta: (brierOn - brierOff) * 2.5,
    },
    perMarket: [{
      market: 'over_25',
      samplesOn: 100, samplesOff: 100,
      brierOn, brierOff,
      brierDelta: brierOn - brierOff,
      hitRateOn: 0.55, hitRateOff: 0.54,
      roiOn: 0.05, roiOff: 0.02,
    }],
    verdict: brierOn < brierOff - VERDICT_NEUTRAL_THRESHOLD ? 'IMPROVES'
           : brierOn > brierOff + VERDICT_NEUTRAL_THRESHOLD ? 'REGRESSES'
           : 'NEUTRAL',
    verdictMagnitude: Math.abs(brierOn - brierOff),
    reportOn: onReport, reportOff: offReport,
    runMs: 50,
  };
}

describe('formatComparison', () => {
  it('IMPROVES verdict produces ✅ + "KEEP THE MODULE" message', () => {
    const result = mkAblation(0.220, 0.235); // module ON improves Brier by 0.015
    const out = formatComparison(result);
    expect(out).toContain('✅');
    expect(out).toContain('KEEP THE MODULE');
  });

  it('REGRESSES verdict produces ❌ + "REVERT THE MODULE"', () => {
    const result = mkAblation(0.250, 0.230);
    result.verdict = 'REGRESSES';
    const out = formatComparison(result);
    expect(out).toContain('❌');
    expect(out).toContain('REVERT');
  });

  it('NEUTRAL verdict produces ➖ + investigation message', () => {
    const result = mkAblation(0.2335, 0.2340); // tiny delta below threshold
    result.verdict = 'NEUTRAL';
    const out = formatComparison(result);
    expect(out).toContain('➖');
    expect(out).toContain('NEUTRAL');
  });

  it('output includes module name, fixture count, and per-market table', () => {
    const result = mkAblation(0.22, 0.24);
    const out = formatComparison(result);
    expect(out).toContain('derby');
    expect(out).toContain('Fixtures scored: 100');
    expect(out).toContain('over_25');
  });
});

describe('VERDICT_NEUTRAL_THRESHOLD', () => {
  it('is small enough to be meaningful for Brier improvements', () => {
    // Brier scores typically range [0.18, 0.25] for football models.
    // A 0.001 threshold = ~0.5% relative improvement minimum.
    expect(VERDICT_NEUTRAL_THRESHOLD).toBeGreaterThan(0);
    expect(VERDICT_NEUTRAL_THRESHOLD).toBeLessThan(0.01);
  });
});
