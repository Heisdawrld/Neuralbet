// ═══════════════════════════════════════════════════════════════════════
// Registry + definitions tests — guard against accidental market changes
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  MARKET_REGISTRY,
  MARKET_DEFINITIONS,
  isHeadlineEligibleMarket,
  WIN_EITHER_HALF_HOME_FACTOR,
  WIN_EITHER_HALF_AWAY_FACTOR,
} from '../registry';

describe('MARKET_REGISTRY', () => {
  it('contains all 30 expected markets', () => {
    const expected = [
      'home_win', 'away_win', 'draw',
      'over_15', 'over_25', 'over_35',
      'under_15', 'under_25', 'under_35',
      'btts_yes', 'btts_no',
      'double_chance_home', 'double_chance_away',
      'home_over_05', 'home_over_15', 'home_over_25', 'home_under_15',
      'away_over_05', 'away_over_15', 'away_over_25', 'away_under_15',
      'win_either_half_home', 'win_either_half_away',
      'dnb_home', 'dnb_away',
      'handicap_home_minus1', 'handicap_away_minus1',
      'handicap_home_plus1', 'handicap_away_plus1',
    ];
    for (const key of expected) {
      expect(MARKET_REGISTRY[key], `${key} missing`).toBeDefined();
    }
  });

  it('isHeadlineEligibleMarket: returns true for canonical headline markets', () => {
    expect(isHeadlineEligibleMarket('home_win')).toBe(true);
    expect(isHeadlineEligibleMarket('over_25')).toBe(true);
    expect(isHeadlineEligibleMarket('btts_yes')).toBe(true);
    expect(isHeadlineEligibleMarket('btts_no')).toBe(true);
  });

  it('isHeadlineEligibleMarket: returns false for model-only markets', () => {
    expect(isHeadlineEligibleMarket('draw')).toBe(false);
    expect(isHeadlineEligibleMarket('dnb_home')).toBe(false);
    expect(isHeadlineEligibleMarket('double_chance_home')).toBe(false);
    expect(isHeadlineEligibleMarket('home_over_25')).toBe(false);
  });

  it('isHeadlineEligibleMarket: returns false for unknown market', () => {
    expect(isHeadlineEligibleMarket('totally_made_up')).toBe(false);
  });
});

describe('MARKET_DEFINITIONS', () => {
  it('every entry has either probKey or compute', () => {
    for (const def of MARKET_DEFINITIONS) {
      expect(def.probKey != null || def.compute != null,
        `${def.marketKey} has neither probKey nor compute`).toBe(true);
    }
  });

  it('every entry has unique marketKey', () => {
    const keys = MARKET_DEFINITIONS.map(d => d.marketKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('double-chance compute = win + draw', () => {
    const dcHome = MARKET_DEFINITIONS.find(d => d.marketKey === 'double_chance_home');
    const dcAway = MARKET_DEFINITIONS.find(d => d.marketKey === 'double_chance_away');
    expect(dcHome!.compute!({ homeWin: 0.45, draw: 0.30, awayWin: 0.25 })).toBeCloseTo(0.75, 4);
    expect(dcAway!.compute!({ homeWin: 0.45, draw: 0.30, awayWin: 0.25 })).toBeCloseTo(0.55, 4);
  });

  it('DNB compute normalises by 1 - draw', () => {
    const dnbHome = MARKET_DEFINITIONS.find(d => d.marketKey === 'dnb_home');
    const probs = { homeWin: 0.50, awayWin: 0.30 };
    expect(dnbHome!.compute!(probs)).toBeCloseTo(0.50 / 0.80, 4);
  });

  it('DNB safe with zero denominator', () => {
    const dnbHome = MARKET_DEFINITIONS.find(d => d.marketKey === 'dnb_home');
    expect(dnbHome!.compute!({ homeWin: 0, awayWin: 0 })).toBe(0);
  });

  it('win-either-half compute uses documented factors', () => {
    const home = MARKET_DEFINITIONS.find(d => d.marketKey === 'win_either_half_home');
    const away = MARKET_DEFINITIONS.find(d => d.marketKey === 'win_either_half_away');
    expect(home!.compute!({ homeOver05: 0.8 })).toBeCloseTo(0.8 * WIN_EITHER_HALF_HOME_FACTOR, 4);
    expect(away!.compute!({ awayOver05: 0.7 })).toBeCloseTo(0.7 * WIN_EITHER_HALF_AWAY_FACTOR, 4);
  });
});
