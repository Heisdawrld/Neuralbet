// ═══════════════════════════════════════════════════════════════════════
// Per-layer xG tests — pins the contract of every individual layer
//
// Each layer is tested in isolation so we can reason about it without
// running the full pipeline. When a layer changes, only its tests need
// to update — the integration test catches any cross-layer breakage.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { computeBaseXg, ATTACK_CLAMP_MAX } from '../layers/01-base';
import { applyThinDataRegression } from '../layers/02-thin-data-regression';
import { applyVenueAnchoring } from '../layers/03-venue-anchoring';
import { applyScriptAdjustments, SCRIPT_MULTIPLIERS } from '../layers/04-script-adjustments';
import { applyFormBoosts, computeFormDerivedBoosts, TOTAL_XG_BOOST_CAP } from '../layers/05-form-boosts';
import { applyOddsAnchor, impliedTotalXg, ODDS_SCALE_MIN, ODDS_SCALE_MAX } from '../layers/06-odds-anchor';
import { applyH2HBlend, H2H_MIN_SAMPLE } from '../layers/07-h2h-blend';
import { applyLeagueGoalRateAdjustment, LEAGUE_RATE_MAX_DELTA } from '../layers/08-league-goal-rate';
import { applyAdvancedTacticalAI, MANAGER_CONSERVATIVE_MULT, MANAGER_ATTACKING_MULT } from '../layers/09-tactical-ai';
import { applyBsdIntelligenceAdjustments } from '../layers/10-bsd-intelligence';
import { applyDeepBsdSignals } from '../layers/11-deep-bsd-signals';
import { applyBsdContextAdjustments, DERBY_DAMPENER } from '../layers/12-context-adjustments';
import { applySquadManagementAdjustments, ALREADY_SECURE_DAMPENER } from '../layers/13-squad-management';
import { capXg, getLeagueCapTier, TOTAL_FLOOR } from '../layers/14-cap';
import type { ScriptOutput } from '../../types';

const script = (primary: string): ScriptOutput => ({
  primary,
  secondary: null,
  confidence: 0.7,
  homeControlScore: 0.5,
  awayControlScore: 0.5,
  eventLevelScore: 0.5,
  volatilityScore: 0.5,
});

// Realistic mid-PL feature vector
const baseFv = (): any => ({
  leagueAvgGoalsPerTeam: 1.35,
  isNeutralGround: false,
  homeAvgScored: 1.6, awayAvgScored: 1.2,
  homeAvgConceded: 1.0, awayAvgConceded: 1.4,
  homeMatchesAvailable: 10, awayMatchesAvailable: 10,
  dataCompletenessScore: 0.7,
  leagueOver25Rate: 0.50, leagueOver35Rate: 0.30,
});

// ─────────────────────────────────────────────────────────────────────
// Layer 1: Base xG
// ─────────────────────────────────────────────────────────────────────
describe('Layer 1: computeBaseXg', () => {
  it('home advantage applied when NOT neutral ground', () => {
    const a = computeBaseXg({ ...baseFv(), isNeutralGround: false });
    const b = computeBaseXg({ ...baseFv(), isNeutralGround: true });
    expect(a.homeXg).toBeGreaterThan(b.homeXg);
    expect(a.awayXg).toBe(b.awayXg);
  });
  it('reasonable PL fixture produces home xG ∈ [1.0, 2.5]', () => {
    const { homeXg, awayXg } = computeBaseXg(baseFv());
    expect(homeXg).toBeGreaterThan(1.0);
    expect(homeXg).toBeLessThan(2.5);
    expect(awayXg).toBeGreaterThan(0.5);
    expect(awayXg).toBeLessThan(2.0);
  });
  it('extreme attack stats are clamped (no λ blowups)', () => {
    const extreme = computeBaseXg({
      ...baseFv(),
      homeAvgScored: 50, awayAvgScored: 50,
      homeAvgConceded: 50, awayAvgConceded: 50,
    });
    // Both ratios cap at ATTACK_CLAMP_MAX × DEFENCE_CLAMP_MAX × LEAGUE_AVG × HOME_ADV
    const ceiling = ATTACK_CLAMP_MAX * 1.80 * 1.35 * 1.10 + 0.1;
    expect(extreme.homeXg).toBeLessThanOrEqual(ceiling);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 2: Thin-data regression
// ─────────────────────────────────────────────────────────────────────
describe('Layer 2: applyThinDataRegression', () => {
  it('5+ matches → no change', () => {
    const result = applyThinDataRegression(2.0, 1.5, { ...baseFv(), homeMatchesAvailable: 10, awayMatchesAvailable: 10 });
    expect(result.homeXg).toBe(2.0);
    expect(result.awayXg).toBe(1.5);
  });
  it('<3 matches → 50% regression toward league baseline', () => {
    const fv = { ...baseFv(), homeMatchesAvailable: 2, awayMatchesAvailable: 2 };
    const result = applyThinDataRegression(2.5, 2.5, fv);
    // engine 2.5 blended 50/50 with leagueAvg(1.35) × homeAdv(1.10) ≈ 1.485
    expect(result.homeXg).toBeCloseTo(2.5 * 0.5 + 1.35 * 1.10 * 0.5, 3);
    expect(result.awayXg).toBeCloseTo(2.5 * 0.5 + 1.35 * 0.5, 3);
  });
  it('3-4 matches → 25% regression', () => {
    const fv = { ...baseFv(), homeMatchesAvailable: 4, awayMatchesAvailable: 4 };
    const result = applyThinDataRegression(2.0, 2.0, fv);
    expect(result.homeXg).toBeCloseTo(2.0 * 0.75 + 1.35 * 1.10 * 0.25, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 3: Venue anchoring
// ─────────────────────────────────────────────────────────────────────
describe('Layer 3: applyVenueAnchoring', () => {
  it('no venue data → no change', () => {
    const result = applyVenueAnchoring(1.5, 1.2, baseFv());
    expect(result.homeXg).toBe(1.5);
    expect(result.awayXg).toBe(1.2);
  });
  it('full venue data → blends 35% to splits', () => {
    const fv = { ...baseFv(),
      homeHomeGoalsFor: 2.5, homeHomeGoalsAgainst: 0.5,
      awayAwayGoalsFor: 0.5, awayAwayGoalsAgainst: 2.5,
    };
    const result = applyVenueAnchoring(1.5, 1.5, fv);
    // home xG should rise (strong home form + weak opponent away defence)
    expect(result.homeXg).toBeGreaterThan(1.5);
    // away xG should drop
    expect(result.awayXg).toBeLessThan(1.5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 4: Script adjustments
// ─────────────────────────────────────────────────────────────────────
describe('Layer 4: applyScriptAdjustments', () => {
  it('open_end_to_end: both sides +12%', () => {
    const result = applyScriptAdjustments(1.5, 1.5, script('open_end_to_end'), baseFv());
    expect(result.homeXg).toBeCloseTo(1.5 * SCRIPT_MULTIPLIERS.open_end_to_end.home, 3);
    expect(result.awayXg).toBeCloseTo(1.5 * SCRIPT_MULTIPLIERS.open_end_to_end.away, 3);
  });
  it('tight_low_event: both sides -10%', () => {
    const result = applyScriptAdjustments(1.5, 1.5, script('tight_low_event'), baseFv());
    expect(result.homeXg).toBeCloseTo(1.5 * SCRIPT_MULTIPLIERS.tight_low_event.home, 3);
  });
  it('dominant_home_pressure: home +4%, away -4%', () => {
    const result = applyScriptAdjustments(1.5, 1.5, script('dominant_home_pressure'), baseFv());
    expect(result.homeXg).toBeGreaterThan(1.5);
    expect(result.awayXg).toBeLessThan(1.5);
  });
  it('predicted strength < 1.0 dampens xG', () => {
    const fv = { ...baseFv(), homePredictedStrength: 0.85 };
    const result = applyScriptAdjustments(1.5, 1.5, script('balanced'), fv);
    expect(result.homeXg).toBeCloseTo(1.5 * 0.85, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 5: Form boosts
// ─────────────────────────────────────────────────────────────────────
describe('Layer 5: applyFormBoosts', () => {
  it('no form data + 0 matches → no boost (zero confidence)', () => {
    const fv = { ...baseFv(), homeMatchesAvailable: 0, awayMatchesAvailable: 0 };
    const { homeXgBoost, awayXgBoost } = computeFormDerivedBoosts(fv);
    expect(homeXgBoost).toBe(0);
    expect(awayXgBoost).toBe(0);
  });
  it('boost is always within ±20% (final cap)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 3.5, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 3.5, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 25 }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (homeScored, awayScored, matches, completeness) => {
          const fv = {
            ...baseFv(),
            homeAvgScored: homeScored, awayAvgScored: awayScored,
            homeMatchesAvailable: matches, awayMatchesAvailable: matches,
            dataCompletenessScore: completeness,
          };
          const { homeXgBoost, awayXgBoost } = computeFormDerivedBoosts(fv);
          return Math.abs(homeXgBoost) <= TOTAL_XG_BOOST_CAP + 1e-9
              && Math.abs(awayXgBoost) <= TOTAL_XG_BOOST_CAP + 1e-9;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 6: Odds anchor
// ─────────────────────────────────────────────────────────────────────
describe('Layer 6: applyOddsAnchor', () => {
  it('no implied odds → no change', () => {
    const result = applyOddsAnchor(1.5, 1.5, baseFv());
    expect(result.homeXg).toBe(1.5);
    expect(result.awayXg).toBe(1.5);
  });
  it('extreme implied odds (<5% or >95%) ignored', () => {
    const r1 = applyOddsAnchor(1.5, 1.5, { ...baseFv(), impliedOver25: 0.03 });
    const r2 = applyOddsAnchor(1.5, 1.5, { ...baseFv(), impliedOver25: 0.97 });
    expect(r1.homeXg).toBe(1.5);
    expect(r2.homeXg).toBe(1.5);
  });
  it('scale always clamped to [0.78, 1.25]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.6, max: 4.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.6, max: 4.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.10, max: 0.90, noNaN: true, noDefaultInfinity: true }),
        (h, a, implOver25) => {
          const r = applyOddsAnchor(h, a, { ...baseFv(), impliedOver25: implOver25 });
          const scale = r.homeXg / h;
          return scale >= ODDS_SCALE_MIN - 1e-9 && scale <= ODDS_SCALE_MAX + 1e-9;
        },
      ),
      { numRuns: 100 },
    );
  });
  it('impliedTotalXg increases with implied probability', () => {
    expect(impliedTotalXg(0.30)).toBeLessThan(impliedTotalXg(0.50));
    expect(impliedTotalXg(0.50)).toBeLessThan(impliedTotalXg(0.70));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 7: H2H blend
// ─────────────────────────────────────────────────────────────────────
describe('Layer 7: applyH2HBlend', () => {
  it('insufficient sample → no change', () => {
    const result = applyH2HBlend(1.5, 1.2, { ...baseFv(), h2hAvgGoals: 3.0, h2hMatchesAvailable: H2H_MIN_SAMPLE - 1 });
    expect(result.homeXg).toBe(1.5);
    expect(result.awayXg).toBe(1.2);
  });
  it('high H2H avg blends totals up while preserving share', () => {
    const beforeTotal = 1.5 + 1.2;       // 2.7
    const beforeShare = 1.5 / beforeTotal; // ~0.556
    const result = applyH2HBlend(1.5, 1.2, { ...baseFv(), h2hAvgGoals: 4.0, h2hMatchesAvailable: 7 });
    const afterTotal = result.homeXg + result.awayXg;
    const afterShare = result.homeXg / afterTotal;
    expect(afterTotal).toBeGreaterThan(beforeTotal);  // blended up toward 4.0
    expect(afterShare).toBeCloseTo(beforeShare, 4);   // share preserved
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 8: League goal-rate adjustment
// ─────────────────────────────────────────────────────────────────────
describe('Layer 8: applyLeagueGoalRateAdjustment', () => {
  it('high-scoring league → both sides up (capped)', () => {
    const result = applyLeagueGoalRateAdjustment(1.5, 1.5, { ...baseFv(), leagueOver35Rate: 0.50, leagueOver25Rate: 0.70 });
    expect(result.homeXg).toBeGreaterThan(1.5);
    expect(result.awayXg).toBeGreaterThan(1.5);
  });
  it('low-scoring league → both sides down (capped)', () => {
    const result = applyLeagueGoalRateAdjustment(1.5, 1.5, { ...baseFv(), leagueOver35Rate: 0.15, leagueOver25Rate: 0.35 });
    expect(result.homeXg).toBeLessThan(1.5);
    expect(result.awayXg).toBeLessThan(1.5);
  });
  it('multiplier always within (1 - cap, 1 + cap)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
        (over25, over35) => {
          const r = applyLeagueGoalRateAdjustment(1.0, 1.0, { ...baseFv(), leagueOver25Rate: over25, leagueOver35Rate: over35 });
          return r.homeXg >= 1.0 - LEAGUE_RATE_MAX_DELTA - 1e-9
              && r.homeXg <= 1.0 + LEAGUE_RATE_MAX_DELTA + 1e-9;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 9: Tactical AI
// ─────────────────────────────────────────────────────────────────────
describe('Layer 9: applyAdvancedTacticalAI', () => {
  it('no managers + no polymarket → no change', () => {
    const result = applyAdvancedTacticalAI(1.5, 1.2, baseFv());
    expect(result.homeXg).toBe(1.5);
    expect(result.awayXg).toBe(1.2);
  });
  it('conservative manager dampens xG by 15%', () => {
    const fv = { ...baseFv(), homeManager: { tactical_styles: [{ code: 'low block', name: 'Low block' }] } };
    const result = applyAdvancedTacticalAI(1.5, 1.2, fv);
    expect(result.homeXg).toBeCloseTo(1.5 * MANAGER_CONSERVATIVE_MULT, 3);
  });
  it('attacking manager boosts xG by 5%', () => {
    const fv = { ...baseFv(), awayManager: { tactical_styles: [{ code: 'gegenpressing', name: 'Gegenpressing' }] } };
    const result = applyAdvancedTacticalAI(1.5, 1.2, fv);
    expect(result.awayXg).toBeCloseTo(1.2 * MANAGER_ATTACKING_MULT, 3);
  });
  it('high line vs counter: counter side +10%', () => {
    const fv = {
      ...baseFv(),
      homeManager: { defensive_line: 'high' },
      awayManager: { team_style: 'counter' },
    };
    const result = applyAdvancedTacticalAI(1.5, 1.2, fv);
    expect(result.awayXg).toBeCloseTo(1.2 * 1.10, 3);
    expect(result.homeXg).toBe(1.5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 10/11: BSD intelligence + deep signals — high-level checks
// ─────────────────────────────────────────────────────────────────────
describe('Layer 10: applyBsdIntelligenceAdjustments', () => {
  it('no BSD flags → no change', () => {
    const result = applyBsdIntelligenceAdjustments(1.5, 1.2, baseFv());
    expect(result.homeXg).toBeCloseTo(1.5, 3);
    expect(result.awayXg).toBeCloseTo(1.2, 3);
  });
  it('strong home xG table data nudges home xG toward table value', () => {
    const fv = {
      ...baseFv(), dataCompletenessScore: 0.85,
      hasXgTable: true,
      homeXgForPerGame: 2.5, awayXgAgainstPerGame: 1.8,
      awayXgForPerGame: 0.8, homeXgAgainstPerGame: 0.6,
    };
    const result = applyBsdIntelligenceAdjustments(1.5, 1.5, fv);
    expect(result.homeXg).toBeGreaterThan(1.5);
  });
});

describe('Layer 11: applyDeepBsdSignals', () => {
  it('no signals → no change', () => {
    const result = applyDeepBsdSignals(1.5, 1.2, baseFv());
    expect(result.homeXg).toBe(1.5);
    expect(result.awayXg).toBe(1.2);
  });
  it('referee chaos ≥ 0.72 dampens both sides', () => {
    const result = applyDeepBsdSignals(1.5, 1.5, { ...baseFv(), refereeVolatilityChaos: 0.80 });
    expect(result.homeXg).toBeLessThan(1.5);
    expect(result.awayXg).toBeLessThan(1.5);
  });
  it('derby metadata code triggers 1% dampener', () => {
    const result = applyDeepBsdSignals(1.5, 1.5, { ...baseFv(), metadataReasonCodes: ['metadata_derby_context'] });
    expect(result.homeXg).toBeCloseTo(1.5 * 0.99, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 12: Context
// ─────────────────────────────────────────────────────────────────────
describe('Layer 12: applyBsdContextAdjustments', () => {
  it('derby → both sides -3%', () => {
    const result = applyBsdContextAdjustments(1.5, 1.5, { ...baseFv(), isLocalDerby: true });
    expect(result.homeXg).toBeCloseTo(1.5 * DERBY_DAMPENER, 3);
    expect(result.awayXg).toBeCloseTo(1.5 * DERBY_DAMPENER, 3);
  });
  it('long-haul travel only dampens AWAY side', () => {
    const result = applyBsdContextAdjustments(1.5, 1.5, { ...baseFv(), travelDistanceKm: 2500 });
    expect(result.homeXg).toBe(1.5);  // home unaffected
    expect(result.awayXg).toBeCloseTo(1.5 * 0.94, 3);
  });
  it('bad weather + bad pitch → both -5%', () => {
    const result = applyBsdContextAdjustments(1.5, 1.5, { ...baseFv(), hasBadWeather: true });
    expect(result.homeXg).toBeCloseTo(1.5 * 0.95, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 13: Squad management
// ─────────────────────────────────────────────────────────────────────
describe('Layer 13: applySquadManagementAdjustments', () => {
  it('no squad signals → no change', () => {
    const result = applySquadManagementAdjustments(1.5, 1.2, baseFv());
    expect(result.homeXg).toBe(1.5);
    expect(result.awayXg).toBe(1.2);
  });
  it('home already secure → big -18% dampener', () => {
    const result = applySquadManagementAdjustments(1.5, 1.5, { ...baseFv(), homeAlreadySecure: true });
    expect(result.homeXg).toBeCloseTo(1.5 * ALREADY_SECURE_DAMPENER, 3);
    expect(result.awayXg).toBe(1.5);
  });
  it('positive rest diff (home rested) → away dampened', () => {
    const result = applySquadManagementAdjustments(1.5, 1.5, { ...baseFv(), restDiffDays: 3 });
    expect(result.homeXg).toBe(1.5);
    expect(result.awayXg).toBeCloseTo(1.5 * 0.95, 3);
  });
  it('negative rest diff (away rested) → home dampened', () => {
    const result = applySquadManagementAdjustments(1.5, 1.5, { ...baseFv(), restDiffDays: -3 });
    expect(result.homeXg).toBeCloseTo(1.5 * 0.95, 3);
    expect(result.awayXg).toBe(1.5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Layer 14: Cap
// ─────────────────────────────────────────────────────────────────────
describe('Layer 14: capXg', () => {
  it('typical league: per-team cap 3.0, total cap 6.0', () => {
    const tier = getLeagueCapTier(0.30);
    expect(tier.perTeam).toBe(3.0);
    expect(tier.total).toBe(6.0);
  });
  it('high-scoring league: per-team cap 3.5, total cap 7.0', () => {
    const tier = getLeagueCapTier(0.45);
    expect(tier.perTeam).toBe(3.5);
    expect(tier.total).toBe(7.0);
  });
  it('caps prevent runaway xG (4.0+4.0 → forced down)', () => {
    const r = capXg(4.0, 4.0, 2.0, 1.5, baseFv());
    expect(r.homeExpectedGoals).toBeLessThanOrEqual(3.0);
    expect(r.awayExpectedGoals).toBeLessThanOrEqual(3.0);
    expect(r.totalExpectedGoals).toBeLessThanOrEqual(6.0);
  });
  it('total floor enforced (very low xG → bumped up to 0.8)', () => {
    const r = capXg(0.1, 0.1, 0.1, 0.1, baseFv());
    expect(r.totalExpectedGoals).toBeGreaterThanOrEqual(TOTAL_FLOOR - 1e-9);
  });
});
