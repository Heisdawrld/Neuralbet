// ═══════════════════════════════════════════════════════════════════════
// sync-h2h.ts — tests for pure logic (pickMeetings + constants)
//
// Network paths (fetchTeamFinishedFixtures, BSD calls) are NOT tested
// here — they'd require live BSD or a mocking layer that's overkill for
// a thin pass-through fetcher. The end-to-end smoke test against
// production after deploy is the gate for those.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  pickMeetings,
  MAX_H2H_PER_FIXTURE,
  H2H_MIN_USEFUL_SAMPLE,
  H2H_FRESH_DAYS,
  H2H_LOOKBACK_YEARS,
} from '../sync-h2h';

function mk(id: number, hId: number, aId: number, h: number, a: number, dateOffsetDays: number) {
  return {
    id,
    home_team_id: hId,
    away_team_id: aId,
    home_team: `Team${hId}`,
    away_team: `Team${aId}`,
    home_score: h,
    away_score: a,
    event_date: new Date(Date.now() - dateOffsetDays * 86400000).toISOString(),
    status: 'finished',
    league_id: 17,
  };
}

describe('pickMeetings', () => {
  it('returns empty list when no fixtures match the opponent', () => {
    const fixtures = [
      mk(1, 100, 200, 1, 0, 10),
      mk(2, 100, 300, 2, 1, 20),
    ];
    expect(pickMeetings(100, 999, fixtures)).toEqual([]);
  });

  it('matches meetings where opponent was AWAY', () => {
    const fixtures = [
      mk(1, 100, 200, 1, 0, 10),
      mk(2, 100, 300, 2, 1, 20),
    ];
    const out = pickMeetings(100, 200, fixtures);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe(1);
  });

  it('matches meetings where opponent was HOME (reverse)', () => {
    const fixtures = [
      mk(3, 200, 100, 0, 3, 5),
    ];
    const out = pickMeetings(100, 200, fixtures);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe(3);
  });

  it('matches both home and away meetings', () => {
    const fixtures = [
      mk(1, 100, 200, 1, 0, 10),
      mk(2, 200, 100, 2, 1, 20),
      mk(3, 100, 200, 3, 3, 30),
    ];
    const out = pickMeetings(100, 200, fixtures);
    expect(out.length).toBe(3);
  });

  it('skips meetings with null scores (unfinished or missing data)', () => {
    const fixtures = [
      mk(1, 100, 200, 1, 0, 10),
      { ...mk(2, 100, 200, 0, 0, 20), home_score: null },
      { ...mk(3, 100, 200, 0, 0, 30), away_score: null },
    ];
    const out = pickMeetings(100, 200, fixtures);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe(1);
  });

  it('caps output at MAX_H2H_PER_FIXTURE', () => {
    const fixtures = Array.from({ length: 25 }, (_, i) =>
      mk(i + 1, 100, 200, 1, 0, i),
    );
    const out = pickMeetings(100, 200, fixtures);
    expect(out.length).toBe(MAX_H2H_PER_FIXTURE);
  });

  it('preserves input ordering (BSD returns newest-first by default)', () => {
    const fixtures = [
      mk(1, 100, 200, 1, 0, 1),
      mk(2, 100, 200, 2, 1, 10),
      mk(3, 100, 200, 3, 2, 100),
    ];
    const out = pickMeetings(100, 200, fixtures);
    expect(out.map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it('handles empty input list', () => {
    expect(pickMeetings(100, 200, [])).toEqual([]);
  });
});

describe('module constants', () => {
  it('MAX_H2H_PER_FIXTURE matches engine Layer 7 sample-size ceiling', () => {
    // Layer 7 uses up to 10 meetings — see xg/layers/07-h2h-blend.ts
    expect(MAX_H2H_PER_FIXTURE).toBe(10);
  });

  it('H2H_MIN_USEFUL_SAMPLE matches engine threshold for Layer 7 firing', () => {
    // Layer 7 only fires when h2hMatchesAvailable >= 3
    expect(H2H_MIN_USEFUL_SAMPLE).toBe(3);
  });

  it('H2H_FRESH_DAYS is conservative (avoids hammering BSD)', () => {
    expect(H2H_FRESH_DAYS).toBeGreaterThanOrEqual(7);
    expect(H2H_FRESH_DAYS).toBeLessThanOrEqual(90);
  });

  it('H2H_LOOKBACK_YEARS is generous enough for fierce-rivalry histories', () => {
    // 4 years catches the modern era of a rivalry without overflowing BSD pages
    expect(H2H_LOOKBACK_YEARS).toBeGreaterThanOrEqual(3);
  });
});
