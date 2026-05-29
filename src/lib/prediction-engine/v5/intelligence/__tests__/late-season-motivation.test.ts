// ═══════════════════════════════════════════════════════════════════════
// Late-season motivation — tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import {
  deriveMotivationContext,
  applyMotivationToXg,
  LATE_SEASON_THRESHOLD,
  TITLE_BONUS,
  EUROPE_BONUS,
  RELEGATION_BONUS,
  DEAD_RUBBER_PENALTY,
  SECURE_MID_PENALTY,
} from '../late-season-motivation';
import { setIntelligenceFlags, resetIntelligenceFlags } from '../flags';

afterEach(() => resetIntelligenceFlags());

const lateSeason = (matchday = 35, totalMatchdays = 38) => ({
  eventMatchday: matchday,
  leagueTotalMatchdays: totalMatchdays,
  leagueTeamCount: 20,
});

// ─────────────────────────────────────────────────────────────────────
// No-op contract
// ─────────────────────────────────────────────────────────────────────
describe('motivation — no-op contract', () => {
  it('flag OFF → identity', () => {
    setIntelligenceFlags({ late_season_motivation: false });
    expect(deriveMotivationContext({
      ...lateSeason(), homePosition: 1, awayPosition: 18,
      homePoints: 80, awayPoints: 20,
    }).isActive).toBe(false);
  });

  it('mid-season (before LATE_SEASON_THRESHOLD) → identity', () => {
    const earlyMatchday = Math.floor(38 * LATE_SEASON_THRESHOLD) - 1;
    expect(deriveMotivationContext({
      eventMatchday: earlyMatchday, leagueTotalMatchdays: 38,
      leagueTeamCount: 20,
      homePosition: 1, awayPosition: 18,
      homePoints: 80, awayPoints: 20,
    }).isActive).toBe(false);
  });

  it('missing matchday data → identity', () => {
    expect(deriveMotivationContext({
      homePosition: 1, awayPosition: 18,
      homePoints: 80, awayPoints: 20,
    }).isActive).toBe(false);
  });

  it('missing position data → identity', () => {
    expect(deriveMotivationContext({
      ...lateSeason(),
      homePosition: 0, awayPosition: 0,
    }).isActive).toBe(false);
  });

  it('null fv → identity', () => {
    expect(deriveMotivationContext(null).isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────
describe('motivation classification', () => {
  it('1st place: title_fight → +7%', () => {
    const ctx = deriveMotivationContext({
      ...lateSeason(),
      homePosition: 1, awayPosition: 10,
      homePoints: 80, awayPoints: 50,
    });
    expect(ctx.homeState).toBe('title_fight');
    expect(ctx.homeXgMultiplier).toBeCloseTo(TITLE_BONUS, 4);
  });

  it('4th place (European spot) → +5%', () => {
    const ctx = deriveMotivationContext({
      ...lateSeason(),
      homePosition: 4, awayPosition: 10,
      homePoints: 60, awayPoints: 50,
    });
    expect(ctx.homeState).toBe('european_spot');
    expect(ctx.homeXgMultiplier).toBeCloseTo(EUROPE_BONUS, 4);
  });

  it('18th place (bottom 3 in 20-team league) → relegation_battle → +6%', () => {
    const ctx = deriveMotivationContext({
      ...lateSeason(),
      homePosition: 10, awayPosition: 18,
      homePoints: 50, awayPoints: 22,
    });
    expect(ctx.awayState).toBe('relegation_battle');
    expect(ctx.awayXgMultiplier).toBeCloseTo(RELEGATION_BONUS, 4);
  });

  it('mid-table with safety buffer: dead_rubber_safe → -5%', () => {
    // matchday 36/38 → 2 matches remaining → required safety gap = 6 points
    const ctx = deriveMotivationContext({
      ...lateSeason(36, 38),
      homePosition: 10,
      awayPosition: 11,
      homePoints: 50, awayPoints: 48,
      leagueRelegationBoundaryPoints: 30, // 20-pt cushion vs 6 required
    });
    expect(ctx.homeState).toBe('dead_rubber_safe');
    expect(ctx.homeXgMultiplier).toBeCloseTo(SECURE_MID_PENALTY, 4);
  });

  it('mid-table no safety data → neutral', () => {
    const ctx = deriveMotivationContext({
      ...lateSeason(),
      homePosition: 10, awayPosition: 11,
      homePoints: 50, awayPoints: 48,
    });
    expect(ctx.homeState).toBe('neutral');
  });
});

// ─────────────────────────────────────────────────────────────────────
// applyMotivationToXg
// ─────────────────────────────────────────────────────────────────────
describe('applyMotivationToXg', () => {
  it('title race + relegation match: home+away both boosted', () => {
    const out = applyMotivationToXg(1.5, 1.5, {
      ...lateSeason(),
      homePosition: 1, awayPosition: 18,
      homePoints: 80, awayPoints: 22,
    });
    expect(out.homeXg).toBeGreaterThan(1.5);
    expect(out.awayXg).toBeGreaterThan(1.5);
  });

  it('safe mid-table vs european chase: home dampened, away boosted', () => {
    const out = applyMotivationToXg(1.5, 1.5, {
      ...lateSeason(36, 38),  // 2 matches remaining
      homePosition: 10, awayPosition: 4,
      homePoints: 50, awayPoints: 60,
      leagueRelegationBoundaryPoints: 30,
    });
    expect(out.homeXg).toBeLessThan(1.5);
    expect(out.awayXg).toBeGreaterThan(1.5);
  });

  it('does not mutate input', () => {
    const fv = { ...lateSeason(), homePosition: 1, awayPosition: 18, homePoints: 80, awayPoints: 22 };
    const snap = JSON.stringify(fv);
    applyMotivationToXg(1.5, 1.5, fv);
    expect(JSON.stringify(fv)).toBe(snap);
  });
});
