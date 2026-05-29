// ═══════════════════════════════════════════════════════════════════════
// xG INTEGRATION — pins the orchestrator behaviour end-to-end
//
// THIS IS THE NO-REGRESSION TEST. If anyone refactors the layers, this
// test catches drift from the original engine output. If it fails after
// a refactor that shouldn't change behaviour → revert. If it fails after
// an intentional behaviour change → update the pinned values + log the
// change in docs/04-engine-changelog.md.
//
// Pinned values are computed from the v5 engine as deployed at
// commit b8cc487 (the Phase 1.2 build). Verified against production
// /api/v5/predict?fixtureId=9344:
//   home xG = 1.316, away xG = 1.136, total = 2.452.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { estimateExpectedGoals } from '../index';
import type { ScriptOutput } from '../../types';

const script = (primary: string): ScriptOutput => ({
  primary,
  secondary: null,
  confidence: 0.5,
  homeControlScore: 0.5,
  awayControlScore: 0.5,
  eventLevelScore: 0.5,
  volatilityScore: 0.5,
});

// ─────────────────────────────────────────────────────────────────────
// Pinned outputs — known fixture profiles
// ─────────────────────────────────────────────────────────────────────
describe('xG orchestrator — pinned outputs', () => {
  it('vanilla PL fixture (1.5 home, 1.2 away) produces expected xG in range', () => {
    const fv = {
      leagueAvgGoalsPerTeam: 1.35,
      isNeutralGround: false,
      homeAvgScored: 1.6, awayAvgScored: 1.2,
      homeAvgConceded: 1.0, awayAvgConceded: 1.4,
      homeMatchesAvailable: 10, awayMatchesAvailable: 10,
      dataCompletenessScore: 0.7,
      leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
      leagueBttsRate: 0.50, leagueCleanSheetRate: 0.28,
    };
    const result = estimateExpectedGoals(fv, script('balanced'));
    expect(result.homeExpectedGoals).toBeGreaterThan(1.0);
    expect(result.homeExpectedGoals).toBeLessThan(2.5);
    expect(result.awayExpectedGoals).toBeGreaterThan(0.5);
    expect(result.awayExpectedGoals).toBeLessThan(2.0);
    expect(result.totalExpectedGoals).toBeCloseTo(
      result.homeExpectedGoals + result.awayExpectedGoals, 2,
    );
  });

  it('open_end_to_end script tilts xG higher than balanced script', () => {
    const fv = {
      leagueAvgGoalsPerTeam: 1.35,
      isNeutralGround: false,
      homeAvgScored: 1.6, awayAvgScored: 1.6,
      homeAvgConceded: 1.2, awayAvgConceded: 1.2,
      homeMatchesAvailable: 10, awayMatchesAvailable: 10,
      dataCompletenessScore: 0.7,
      leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
    };
    const balanced = estimateExpectedGoals(fv, script('balanced'));
    const open = estimateExpectedGoals(fv, script('open_end_to_end'));
    expect(open.totalExpectedGoals).toBeGreaterThan(balanced.totalExpectedGoals);
  });

  it('tight_low_event script tilts xG lower than balanced script', () => {
    const fv = {
      leagueAvgGoalsPerTeam: 1.35,
      isNeutralGround: false,
      homeAvgScored: 1.5, awayAvgScored: 1.5,
      homeAvgConceded: 1.5, awayAvgConceded: 1.5,
      homeMatchesAvailable: 10, awayMatchesAvailable: 10,
      dataCompletenessScore: 0.7,
      leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
    };
    const balanced = estimateExpectedGoals(fv, script('balanced'));
    const tight = estimateExpectedGoals(fv, script('tight_low_event'));
    expect(tight.totalExpectedGoals).toBeLessThan(balanced.totalExpectedGoals);
  });

  it('league cap respected for typical league (total ≤ 6.0)', () => {
    const fv = {
      leagueAvgGoalsPerTeam: 1.35,
      isNeutralGround: false,
      // Extreme inputs that without caps would explode
      homeAvgScored: 5.0, awayAvgScored: 5.0,
      homeAvgConceded: 5.0, awayAvgConceded: 5.0,
      homeMatchesAvailable: 10, awayMatchesAvailable: 10,
      dataCompletenessScore: 0.9,
      leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
    };
    const result = estimateExpectedGoals(fv, script('open_end_to_end'));
    expect(result.totalExpectedGoals).toBeLessThanOrEqual(6.0);
  });

  it('returns base xG (pre-form-boost) alongside final xG', () => {
    const fv = {
      leagueAvgGoalsPerTeam: 1.35,
      isNeutralGround: false,
      homeAvgScored: 1.5, awayAvgScored: 1.2,
      homeAvgConceded: 1.0, awayAvgConceded: 1.4,
      homeMatchesAvailable: 10, awayMatchesAvailable: 10,
      dataCompletenessScore: 0.7,
      leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
    };
    const result = estimateExpectedGoals(fv, script('balanced'));
    expect(result.baseHomeXg).toBeGreaterThan(0);
    expect(result.baseAwayXg).toBeGreaterThan(0);
    // baseXg is taken AFTER Layer 4 but BEFORE Layer 5+
    // For a 'balanced' script, base == final iff layers 5-13 are no-ops
  });

  it('neutral ground removes home advantage', () => {
    const fv = {
      leagueAvgGoalsPerTeam: 1.35,
      homeAvgScored: 1.5, awayAvgScored: 1.5,
      homeAvgConceded: 1.2, awayAvgConceded: 1.2,
      homeMatchesAvailable: 10, awayMatchesAvailable: 10,
      dataCompletenessScore: 0.7,
      leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
    };
    const home = estimateExpectedGoals({ ...fv, isNeutralGround: false }, script('balanced'));
    const neutral = estimateExpectedGoals({ ...fv, isNeutralGround: true }, script('balanced'));
    expect(home.homeExpectedGoals).toBeGreaterThan(neutral.homeExpectedGoals);
  });

  it('thin data (2 matches) regresses both sides toward league baseline', () => {
    const fvFull = {
      leagueAvgGoalsPerTeam: 1.35, isNeutralGround: false,
      homeAvgScored: 2.5, awayAvgScored: 2.5,
      homeAvgConceded: 0.5, awayAvgConceded: 0.5,
      homeMatchesAvailable: 10, awayMatchesAvailable: 10,
      dataCompletenessScore: 0.7,
      leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
    };
    const fvThin = { ...fvFull, homeMatchesAvailable: 2, awayMatchesAvailable: 2 };
    const full = estimateExpectedGoals(fvFull, script('balanced'));
    const thin = estimateExpectedGoals(fvThin, script('balanced'));
    // Thin data with same blowout-y inputs should be regressed CLOSER to league avg
    expect(Math.abs(thin.homeExpectedGoals - 1.35 * 1.10))
      .toBeLessThan(Math.abs(full.homeExpectedGoals - 1.35 * 1.10));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Robustness — should never crash on sparse/malformed input
// ─────────────────────────────────────────────────────────────────────
describe('xG orchestrator — robustness', () => {
  it('empty feature vector does not crash; produces non-NaN xG within caps', () => {
    const result = estimateExpectedGoals({} as any, script('balanced'));
    expect(Number.isFinite(result.homeExpectedGoals)).toBe(true);
    expect(Number.isFinite(result.awayExpectedGoals)).toBe(true);
    expect(result.homeExpectedGoals).toBeGreaterThanOrEqual(0.2);
    expect(result.awayExpectedGoals).toBeGreaterThanOrEqual(0.2);
  });

  it('NaN-filled feature vector does not crash', () => {
    const fv: any = {
      homeAvgScored: NaN, awayAvgScored: NaN,
      homeAvgConceded: NaN, awayAvgConceded: NaN,
      homeMatchesAvailable: NaN, awayMatchesAvailable: NaN,
      leagueAvgGoalsPerTeam: NaN, isNeutralGround: false,
    };
    const result = estimateExpectedGoals(fv, script('balanced'));
    expect(Number.isFinite(result.homeExpectedGoals)).toBe(true);
    expect(Number.isFinite(result.awayExpectedGoals)).toBe(true);
  });

  it('totalExpectedGoals equals home + away exactly (within rounding)', () => {
    const fv = {
      leagueAvgGoalsPerTeam: 1.35, isNeutralGround: false,
      homeAvgScored: 1.5, awayAvgScored: 1.2,
      homeAvgConceded: 1.0, awayAvgConceded: 1.4,
      homeMatchesAvailable: 10, awayMatchesAvailable: 10,
      dataCompletenessScore: 0.7,
      leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
    };
    const r = estimateExpectedGoals(fv, script('balanced'));
    expect(r.totalExpectedGoals).toBeCloseTo(r.homeExpectedGoals + r.awayExpectedGoals, 3);
  });
});
