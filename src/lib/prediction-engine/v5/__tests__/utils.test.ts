// ═══════════════════════════════════════════════════════════════════════
// v5/utils.ts — tests for impliedProbability
//
// This file's existence guards against the regression that caused silent
// production BUG #6: the previous utils.ts was deleted in Phase 1.8 and
// the missing import was masked by `next.config.ts: ignoreBuildErrors`.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { impliedProbability } from '../utils';

describe('impliedProbability', () => {
  it('1 / odds for normal positive odds', () => {
    expect(impliedProbability(2.0)).toBe(0.5);
    expect(impliedProbability(1.5)).toBeCloseTo(0.6667, 4);
    expect(impliedProbability(4.0)).toBe(0.25);
  });

  it('returns 0 for odds <= 1 (no quote signal)', () => {
    expect(impliedProbability(1)).toBe(0);
    expect(impliedProbability(0.5)).toBe(0);
    expect(impliedProbability(0)).toBe(0);
    expect(impliedProbability(-1)).toBe(0);
  });

  it('returns 0 for null / undefined / NaN / Infinity', () => {
    expect(impliedProbability(null)).toBe(0);
    expect(impliedProbability(undefined)).toBe(0);
    expect(impliedProbability(NaN)).toBe(0);
    expect(impliedProbability(Infinity)).toBe(0);
  });
});
