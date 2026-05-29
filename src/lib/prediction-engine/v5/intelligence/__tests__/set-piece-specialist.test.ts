// ═══════════════════════════════════════════════════════════════════════
// Set-piece specialist — tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import {
  deriveSetPieceContext,
  applySetPieceToXg,
  STRICT_REFEREE_YELLOWS_PER_MATCH,
  SCORING_LIFT_THRESHOLD_PCT,
  SET_PIECE_BONUS,
} from '../set-piece-specialist';
import { setIntelligenceFlags, resetIntelligenceFlags } from '../flags';

afterEach(() => resetIntelligenceFlags());

const baseFv = (overrides: any = {}) => ({
  leagueAvgGoalsPerTeam: 1.35,
  homeAvgScored: 1.35,
  awayAvgScored: 1.35,
  refereeAvgYellowPerMatch: 3.0,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────
// No-op
// ─────────────────────────────────────────────────────────────────────
describe('set-piece — no-op contract', () => {
  it('flag OFF → identity', () => {
    setIntelligenceFlags({ set_piece_specialist: false });
    expect(deriveSetPieceContext(baseFv({
      refereeAvgYellowPerMatch: 5, homeAvgScored: 2.0,
    })).isActive).toBe(false);
  });

  it('lax referee → identity', () => {
    expect(deriveSetPieceContext(baseFv({
      refereeAvgYellowPerMatch: STRICT_REFEREE_YELLOWS_PER_MATCH - 0.5,
      homeAvgScored: 2.0,
    })).isActive).toBe(false);
  });

  it('strict referee but neither team qualifies → identity', () => {
    expect(deriveSetPieceContext(baseFv({
      refereeAvgYellowPerMatch: 5,
      homeAvgScored: 1.3, awayAvgScored: 1.3,  // both at league avg
    })).isActive).toBe(false);
  });

  it('null fv → identity', () => {
    expect(deriveSetPieceContext(null).isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Firing conditions
// ─────────────────────────────────────────────────────────────────────
describe('set-piece — firing conditions', () => {
  it('strict ref + home scores 11% above league avg: home boosted', () => {
    const ctx = deriveSetPieceContext(baseFv({
      refereeAvgYellowPerMatch: 4.5,
      homeAvgScored: 1.35 * (1 + SCORING_LIFT_THRESHOLD_PCT + 0.01),
      awayAvgScored: 1.0,
    }));
    expect(ctx.isActive).toBe(true);
    expect(ctx.homeBoostApplied).toBe(true);
    expect(ctx.awayBoostApplied).toBe(false);
    expect(ctx.homeXgMultiplier).toBeCloseTo(SET_PIECE_BONUS, 4);
    expect(ctx.awayXgMultiplier).toBe(1.0);
  });

  it('strict ref + both teams qualify: both boosted', () => {
    const ctx = deriveSetPieceContext(baseFv({
      refereeAvgYellowPerMatch: 4.5,
      homeAvgScored: 1.7, awayAvgScored: 1.7,
    }));
    expect(ctx.homeBoostApplied).toBe(true);
    expect(ctx.awayBoostApplied).toBe(true);
  });

  it('home just below threshold: no boost', () => {
    const ctx = deriveSetPieceContext(baseFv({
      refereeAvgYellowPerMatch: 4.5,
      homeAvgScored: 1.35 * (1 + SCORING_LIFT_THRESHOLD_PCT - 0.01),
      awayAvgScored: 1.0,
    }));
    expect(ctx.isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// applySetPieceToXg
// ─────────────────────────────────────────────────────────────────────
describe('applySetPieceToXg', () => {
  it('identity when no conditions met', () => {
    const out = applySetPieceToXg(1.5, 1.2, baseFv());
    expect(out.homeXg).toBe(1.5);
    expect(out.awayXg).toBe(1.2);
  });

  it('home boosted +5% when qualifying', () => {
    const out = applySetPieceToXg(1.5, 1.2, baseFv({
      refereeAvgYellowPerMatch: 5,
      homeAvgScored: 1.7, awayAvgScored: 1.0,
    }));
    expect(out.homeXg).toBeCloseTo(1.5 * SET_PIECE_BONUS, 4);
    expect(out.awayXg).toBe(1.2);
  });

  it('does not mutate input', () => {
    const fv = baseFv({ refereeAvgYellowPerMatch: 5, homeAvgScored: 1.7 });
    const snap = JSON.stringify(fv);
    applySetPieceToXg(1.5, 1.5, fv);
    expect(JSON.stringify(fv)).toBe(snap);
  });
});
