// ═══════════════════════════════════════════════════════════════════════
// Outcome mapping tests — ground truth conversion correctness
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { marketOutcomesFromScore, PROB_KEY_TO_MARKET_KEY } from '../outcomes';

describe('marketOutcomesFromScore', () => {
  // ── 1X2 ──
  it('1-0: home wins', () => {
    const o = marketOutcomesFromScore(1, 0);
    expect(o.home_win).toBe(1); expect(o.draw).toBe(0); expect(o.away_win).toBe(0);
  });
  it('0-1: away wins', () => {
    const o = marketOutcomesFromScore(0, 1);
    expect(o.home_win).toBe(0); expect(o.draw).toBe(0); expect(o.away_win).toBe(1);
  });
  it('1-1: draw', () => {
    const o = marketOutcomesFromScore(1, 1);
    expect(o.home_win).toBe(0); expect(o.draw).toBe(1); expect(o.away_win).toBe(0);
  });

  // ── Double chance ──
  it('1-0 home win or draw → double_chance_home=1', () => {
    expect(marketOutcomesFromScore(1, 0).double_chance_home).toBe(1);
    expect(marketOutcomesFromScore(1, 1).double_chance_home).toBe(1);
  });
  it('0-1 → double_chance_home=0, double_chance_away=1', () => {
    const o = marketOutcomesFromScore(0, 1);
    expect(o.double_chance_home).toBe(0);
    expect(o.double_chance_away).toBe(1);
  });

  // ── DNB ──
  it('1-1 draw: DNB is push → both =0 (treated as no outcome)', () => {
    const o = marketOutcomesFromScore(1, 1);
    expect(o.dnb_home).toBe(0);
    expect(o.dnb_away).toBe(0);
  });
  it('2-0 home: dnb_home=1, dnb_away=0', () => {
    const o = marketOutcomesFromScore(2, 0);
    expect(o.dnb_home).toBe(1);
    expect(o.dnb_away).toBe(0);
  });

  // ── Totals ──
  it('0-0: under_15/25/35 all 1', () => {
    const o = marketOutcomesFromScore(0, 0);
    expect(o.over_05).toBe(0); expect(o.over_15).toBe(0); expect(o.over_25).toBe(0); expect(o.over_35).toBe(0);
    expect(o.under_15).toBe(1); expect(o.under_25).toBe(1); expect(o.under_35).toBe(1);
  });
  it('2-1: over_15 and over_25 hit, under_35 hits', () => {
    const o = marketOutcomesFromScore(2, 1);
    expect(o.over_15).toBe(1); expect(o.over_25).toBe(1); expect(o.over_35).toBe(0);
    expect(o.under_35).toBe(1);
  });
  it('3-3: over_35 hits but not over_55', () => {
    const o = marketOutcomesFromScore(3, 3);
    expect(o.over_35).toBe(1); expect(o.under_35).toBe(0);
  });
  it('over_K and under_K are complementary for K in {1.5, 2.5, 3.5}', () => {
    for (let h = 0; h < 5; h++) {
      for (let a = 0; a < 5; a++) {
        const o = marketOutcomesFromScore(h, a);
        expect(o.over_15 + o.under_15, `${h}-${a}`).toBe(1);
        expect(o.over_25 + o.under_25, `${h}-${a}`).toBe(1);
        expect(o.over_35 + o.under_35, `${h}-${a}`).toBe(1);
      }
    }
  });

  // ── BTTS ──
  it('1-1: btts_yes=1, btts_no=0', () => {
    expect(marketOutcomesFromScore(1, 1).btts_yes).toBe(1);
    expect(marketOutcomesFromScore(1, 1).btts_no).toBe(0);
  });
  it('2-0: btts_no=1, btts_yes=0', () => {
    expect(marketOutcomesFromScore(2, 0).btts_no).toBe(1);
    expect(marketOutcomesFromScore(2, 0).btts_yes).toBe(0);
  });
  it('btts_yes + btts_no = 1 always', () => {
    for (let h = 0; h < 5; h++) {
      for (let a = 0; a < 5; a++) {
        const o = marketOutcomesFromScore(h, a);
        expect(o.btts_yes + o.btts_no).toBe(1);
      }
    }
  });

  // ── Team totals ──
  it('home_over_15 hits when home scores 2+', () => {
    expect(marketOutcomesFromScore(2, 0).home_over_15).toBe(1);
    expect(marketOutcomesFromScore(1, 0).home_over_15).toBe(0);
  });
  it('away_over_25 hits only when away scores 3+', () => {
    expect(marketOutcomesFromScore(0, 3).away_over_25).toBe(1);
    expect(marketOutcomesFromScore(0, 2).away_over_25).toBe(0);
  });

  // ── Handicaps ──
  it('handicap_home_minus1 hits only when home wins by 2+', () => {
    expect(marketOutcomesFromScore(2, 0).handicap_home_minus1).toBe(1);
    expect(marketOutcomesFromScore(3, 1).handicap_home_minus1).toBe(1);
    expect(marketOutcomesFromScore(1, 0).handicap_home_minus1).toBe(0);
    expect(marketOutcomesFromScore(1, 1).handicap_home_minus1).toBe(0);
  });
  it('handicap_home_plus1 hits when home wins, draws, or loses by 0', () => {
    expect(marketOutcomesFromScore(1, 1).handicap_home_plus1).toBe(1);
    expect(marketOutcomesFromScore(2, 1).handicap_home_plus1).toBe(1);
    // Loses by 1 (e.g. 0-1) — home_margin = -1, handicap +1 actually pushes
    // Our definition: margin >= 0 → win. -1 → not eligible.
    expect(marketOutcomesFromScore(0, 1).handicap_home_plus1).toBe(0);
    expect(marketOutcomesFromScore(0, 2).handicap_home_plus1).toBe(0);
  });
  it('handicap_away_plus1 hits when away wins or draws', () => {
    expect(marketOutcomesFromScore(0, 1).handicap_away_plus1).toBe(1);
    expect(marketOutcomesFromScore(1, 1).handicap_away_plus1).toBe(1);
    expect(marketOutcomesFromScore(1, 0).handicap_away_plus1).toBe(0);
  });
});

describe('PROB_KEY_TO_MARKET_KEY', () => {
  it('contains every canonical market', () => {
    expect(PROB_KEY_TO_MARKET_KEY.homeWin).toBe('home_win');
    expect(PROB_KEY_TO_MARKET_KEY.bttsYes).toBe('btts_yes');
    expect(PROB_KEY_TO_MARKET_KEY.over25).toBe('over_25');
    expect(PROB_KEY_TO_MARKET_KEY.handicapAwayMinus1).toBe('handicap_away_minus1');
  });
  it('every mapping target is a valid market outcome key', () => {
    const sampleOutcomes = marketOutcomesFromScore(2, 1);
    for (const marketKey of Object.values(PROB_KEY_TO_MARKET_KEY)) {
      expect(sampleOutcomes[marketKey], `${marketKey} missing from outcomes`).toBeDefined();
    }
  });
});
