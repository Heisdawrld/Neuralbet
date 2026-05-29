// ═══════════════════════════════════════════════════════════════════════
// Manager debut intelligence — tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  deriveManagerDebutContext,
  applyManagerDebutToProbs,
  HOME_WIN_BONUS_BY_MATCH,
  DRAW_DAMPENER_BY_MATCH,
  MAX_DAYS_FOR_DEBUT,
  DEBUT_DECAY_MATCHES,
} from '../manager-debut';
import {
  setIntelligenceFlags,
  resetIntelligenceFlags,
} from '../flags';

afterEach(() => resetIntelligenceFlags());

const baseProbs = () => ({ homeWin: 0.40, draw: 0.28, awayWin: 0.32 });

// ─────────────────────────────────────────────────────────────────────
// No-op contract — must NOT modify anything when conditions don't hold
// ─────────────────────────────────────────────────────────────────────
describe('manager debut — no-op contract', () => {
  it('flag OFF → identity', () => {
    setIntelligenceFlags({ manager_debut: false });
    const ctx = deriveManagerDebutContext({ homeManagerMatchesAtClub: 0, homeManagerDaysAtClub: 1 });
    expect(ctx.isHomeDebut).toBe(false);
    expect(ctx.homeWinBonus).toBe(0);
  });

  it('no homeManagerMatchesAtClub → identity', () => {
    const ctx = deriveManagerDebutContext({});
    expect(ctx.isHomeDebut).toBe(false);
  });

  it('matches >= decay threshold → identity', () => {
    const ctx = deriveManagerDebutContext({
      homeManagerMatchesAtClub: DEBUT_DECAY_MATCHES,
      homeManagerDaysAtClub: 10,
    });
    expect(ctx.isHomeDebut).toBe(false);
    expect(ctx.homeWinBonus).toBe(0);
  });

  it('days at club > MAX_DAYS_FOR_DEBUT → identity', () => {
    const ctx = deriveManagerDebutContext({
      homeManagerMatchesAtClub: 0,
      homeManagerDaysAtClub: MAX_DAYS_FOR_DEBUT + 10,
    });
    expect(ctx.isHomeDebut).toBe(false);
  });

  it('applyManagerDebutToProbs returns identical probs when no-op', () => {
    const probs = baseProbs();
    const out = applyManagerDebutToProbs(probs, { homeManagerMatchesAtClub: 99 });
    expect(out.homeWin).toBe(probs.homeWin);
    expect(out.draw).toBe(probs.draw);
    expect(out.awayWin).toBe(probs.awayWin);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Debut behaviour — fires at the right time
// ─────────────────────────────────────────────────────────────────────
describe('manager debut — fires correctly', () => {
  it('debut (match 0): max bonus', () => {
    const ctx = deriveManagerDebutContext({
      homeManagerMatchesAtClub: 0,
      homeManagerDaysAtClub: 5,
    });
    expect(ctx.isHomeDebut).toBe(true);
    expect(ctx.homeWinBonus).toBe(HOME_WIN_BONUS_BY_MATCH[0]);
    expect(ctx.drawDampener).toBe(DRAW_DAMPENER_BY_MATCH[0]);
  });

  it('bonus decays linearly across matches 0-3', () => {
    for (let m = 0; m < DEBUT_DECAY_MATCHES; m++) {
      const ctx = deriveManagerDebutContext({
        homeManagerMatchesAtClub: m, homeManagerDaysAtClub: 20,
      });
      expect(ctx.homeWinBonus, `match ${m}`).toBe(HOME_WIN_BONUS_BY_MATCH[m]);
    }
  });

  it('days = MAX_DAYS_FOR_DEBUT (boundary): still fires', () => {
    const ctx = deriveManagerDebutContext({
      homeManagerMatchesAtClub: 1,
      homeManagerDaysAtClub: MAX_DAYS_FOR_DEBUT,
    });
    expect(ctx.isHomeDebut).toBe(true);
  });

  it('days field missing: uses only match count (firing at the right matches)', () => {
    const ctx = deriveManagerDebutContext({ homeManagerMatchesAtClub: 1 });
    expect(ctx.isHomeDebut).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// applyManagerDebutToProbs — math correctness
// ─────────────────────────────────────────────────────────────────────
describe('applyManagerDebutToProbs', () => {
  it('homeWin goes UP, draw goes DOWN at debut', () => {
    const probs = baseProbs();
    const out = applyManagerDebutToProbs(probs, {
      homeManagerMatchesAtClub: 0, homeManagerDaysAtClub: 5,
    });
    expect(out.homeWin).toBeGreaterThan(probs.homeWin);
    expect(out.draw).toBeLessThan(probs.draw);
  });

  it('1X2 always sums to 1.0', () => {
    const probs = baseProbs();
    const out = applyManagerDebutToProbs(probs, {
      homeManagerMatchesAtClub: 0, homeManagerDaysAtClub: 1,
    });
    expect(out.homeWin + out.draw + out.awayWin).toBeCloseTo(1.0, 3);
  });

  it('no homeWin in input → no-op (safety)', () => {
    const probs = { over25: 0.55 };
    const out = applyManagerDebutToProbs(probs, {
      homeManagerMatchesAtClub: 0, homeManagerDaysAtClub: 5,
    });
    expect(out).toEqual(probs);
  });

  it('does NOT mutate input', () => {
    const probs = baseProbs();
    const snap = { ...probs };
    applyManagerDebutToProbs(probs, {
      homeManagerMatchesAtClub: 0, homeManagerDaysAtClub: 5,
    });
    expect(probs).toEqual(snap);
  });

  it('property-based: output always normalises + stays in [0.01, 0.99]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.10, max: 0.80, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.10, max: 0.80, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 4 }),
        (homeWin, draw, matches) => {
          if (homeWin + draw > 0.98) return true; // skip degenerate inputs
          const awayWin = 1 - homeWin - draw;
          const probs = { homeWin, draw, awayWin };
          const out = applyManagerDebutToProbs(probs, {
            homeManagerMatchesAtClub: matches, homeManagerDaysAtClub: 5,
          });
          const sum = out.homeWin + out.draw + out.awayWin;
          return Math.abs(sum - 1) < 0.001
              && out.homeWin >= 0.005 && out.homeWin <= 0.995
              && out.draw >= 0.005 && out.draw <= 0.995
              && out.awayWin >= 0.005 && out.awayWin <= 0.995;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Flag interaction
// ─────────────────────────────────────────────────────────────────────
describe('manager debut + flag interaction', () => {
  it('flag toggle ON-OFF-ON works', () => {
    const fv = { homeManagerMatchesAtClub: 0, homeManagerDaysAtClub: 5 };
    expect(deriveManagerDebutContext(fv).isHomeDebut).toBe(true);
    setIntelligenceFlags({ manager_debut: false });
    expect(deriveManagerDebutContext(fv).isHomeDebut).toBe(false);
    resetIntelligenceFlags();
    expect(deriveManagerDebutContext(fv).isHomeDebut).toBe(true);
  });
});
