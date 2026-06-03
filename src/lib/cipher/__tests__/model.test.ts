import { describe, expect, it } from 'vitest';
import { predictFixture } from '../model';

describe('Cipher model', () => {
  it('returns a bounded prediction with fair odds and risk metadata', () => {
    const p = predictFixture({
      id: 1,
      leagueId: 39,
      homeTeamId: 1,
      awayTeamId: 2,
      homeTeam: 'Home FC',
      awayTeam: 'Away FC',
      kickoffAt: '2026-06-03T18:00:00Z',
      odds: { home_win: 2.2, draw: 3.4, away_win: 3.1 },
      memory: {
        homeMomentum: 0.72,
        awayMomentum: 0.48,
        homeAttack: 0.68,
        awayAttack: 0.52,
        homeDefense: 0.64,
        awayDefense: 0.45,
        homeFatigue: 0.28,
        awayFatigue: 0.44,
      },
    });

    expect(p.fixtureId).toBe(1);
    expect(p.probability).toBeGreaterThan(0);
    expect(p.probability).toBeLessThan(1);
    expect(p.fairOdds).toBeGreaterThan(1);
    expect(['STRONG', 'LEAN', 'WATCH', 'SKIP']).toContain(p.confidence);
    expect(['SAFE', 'BALANCED', 'AGGRESSIVE', 'NO_BET']).toContain(p.risk);
    expect(p.report.length).toBeGreaterThan(50);
  });

  it('skips when odds are missing because there is no tradable edge', () => {
    const p = predictFixture({
      id: 2,
      leagueId: 39,
      homeTeamId: 1,
      awayTeamId: 2,
      homeTeam: 'Home FC',
      awayTeam: 'Away FC',
      kickoffAt: '2026-06-03T18:00:00Z',
    });

    expect(p.confidence).toBe('SKIP');
    expect(p.risk).toBe('NO_BET');
    expect(p.stakeFraction).toBe(0);
  });
});
