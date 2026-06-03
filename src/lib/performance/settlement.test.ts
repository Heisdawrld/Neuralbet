import { describe, expect, it } from 'vitest';
import { profitUnits, settlePick } from './settlement';

describe('settlement', () => {
  const fixture = { homeTeam: 'Arsenal', awayTeam: 'Chelsea', homeScore: 2, awayScore: 1 };

  it('settles 1X2, totals and BTTS markets', () => {
    expect(settlePick('1X2', 'Arsenal', fixture).status).toBe('won');
    expect(settlePick('1X2', 'Draw', fixture).status).toBe('lost');
    expect(settlePick('Goals', 'Over 2.5 Goals', fixture).status).toBe('won');
    expect(settlePick('Goals', 'Under 2.5 Goals', fixture).status).toBe('lost');
    expect(settlePick('BTTS', 'Both Teams To Score — Yes', fixture).status).toBe('won');
  });

  it('calculates profit units', () => {
    expect(profitUnits('won', 2, 2.5)).toBe(3);
    expect(profitUnits('lost', 2, 2.5)).toBe(-2);
    expect(profitUnits('void', 2, 2.5)).toBe(0);
  });
});
