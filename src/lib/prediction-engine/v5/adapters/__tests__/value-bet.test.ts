// ═══════════════════════════════════════════════════════════════════════
// V5 → ValueBet adapter — tests
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  adaptV5ToValueBets,
  edgeToValueRating,
  MIN_EDGE_FOR_VALUE,
  MIN_ODDS,
  type ValueBetMatch,
} from '../value-bet';
import type { PredictionResult } from '../../index';

const match: ValueBetMatch = {
  id: 9344, homeTeam: 'Liverpool', awayTeam: 'Chelsea',
  homeTeamId: 1, awayTeamId: 2,
  leagueId: 17, leagueName: 'Premier League',
  eventDate: '2026-05-30T14:00:00Z', status: 'notstarted',
  homeScore: null, awayScore: null, currentMinute: null, period: '',
};

function mkV5(bestPick: any, backupPicks: any[] = []): PredictionResult {
  return {
    fixtureId: 9344,
    homeTeam: 'Liverpool', awayTeam: 'Chelsea',
    expectedGoals: { home: 1.7, away: 1.3, total: 3.0 },
    bestPick, backupPicks,
    noSafePick: !bestPick, noSafePickReason: null, abstainCode: null,
    confidence: { model: 'high', value: 'strong', volatility: 'low' },
    reasonCodes: ['OPEN_MATCH'],
    script: { primary: 'open_end_to_end', confidence: 0.75 },
    calibratedProbs: {
      homeWin: 0.50, draw: 0.25, awayWin: 0.25,
      over25: 0.72, bttsYes: 0.65, over15: 0.85, over35: 0.40,
    },
    dataCompleteness: 0.78,
    engineVersion: '5.0.0',
    updatedAt: '2026-05-29T06:00:00Z',
  };
}

// ─────────────────────────────────────────────────────────────────────
// edgeToValueRating
// ─────────────────────────────────────────────────────────────────────
describe('edgeToValueRating', () => {
  it('edge ≥ 20% → 5 stars', () => {
    expect(edgeToValueRating(0.25)).toBe(5);
  });
  it('edge 15-19% → 4 stars', () => {
    expect(edgeToValueRating(0.17)).toBe(4);
  });
  it('edge 10-14% → 3 stars', () => {
    expect(edgeToValueRating(0.10)).toBe(3);
    expect(edgeToValueRating(0.14)).toBe(3);
  });
  it('edge 7-9% → 2 stars', () => {
    expect(edgeToValueRating(0.07)).toBe(2);
  });
  it('edge < 7% → 1 star', () => {
    expect(edgeToValueRating(0.05)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// adaptV5ToValueBets
// ─────────────────────────────────────────────────────────────────────
describe('adaptV5ToValueBets', () => {
  it('returns empty list when engine abstained (no bestPick)', () => {
    const v5 = mkV5(null);
    const bets = adaptV5ToValueBets(v5, { match });
    expect(bets).toEqual([]);
  });

  it('returns a value bet when bestPick has edge ≥ 5%', () => {
    const v5 = mkV5({
      marketKey: 'over_25', selection: 'Over 2.5 Goals',
      modelProbability: 0.72, impliedProbability: 0.55,
      edge: 0.17, finalScore: 0.55, bookmakerOdds: 1.85,
    });
    const bets = adaptV5ToValueBets(v5, { match });
    expect(bets.length).toBe(1);
    expect(bets[0].selection).toBe('Over 2.5 Goals');
    expect(bets[0].market).toBe('Over/Under 2.5');
    expect(bets[0].modelProbability).toBe(0.72);
    expect(bets[0].impliedProbability).toBe(0.55);
    expect(bets[0].edge).toBeCloseTo(0.17, 4);
    expect(bets[0].odds).toBe(1.85);
    expect(bets[0].isActionable).toBe(true);
    expect(bets[0].valueRating).toBe(4);
  });

  it('skips candidates with edge < MIN_EDGE_FOR_VALUE', () => {
    const v5 = mkV5({
      marketKey: 'over_25', selection: 'Over 2.5 Goals',
      modelProbability: 0.60, impliedProbability: 0.57,
      edge: 0.03, // below threshold
      finalScore: 0.30, bookmakerOdds: 1.75,
    });
    const bets = adaptV5ToValueBets(v5, { match });
    expect(bets).toEqual([]);
  });

  it('skips candidates with odds < MIN_ODDS (no juice)', () => {
    const v5 = mkV5({
      marketKey: 'over_15', selection: 'Over 1.5 Goals',
      modelProbability: 0.90, impliedProbability: 0.83,
      edge: 0.07, finalScore: 0.40, bookmakerOdds: 1.15, // too short
    });
    const bets = adaptV5ToValueBets(v5, { match });
    expect(bets).toEqual([]);
  });

  it('skips candidates with negative expected value', () => {
    const v5 = mkV5({
      marketKey: 'home_win', selection: 'Home Win',
      modelProbability: 0.55, impliedProbability: 0.50,
      edge: 0.05, // exactly at threshold
      finalScore: 0.30,
      bookmakerOdds: 1.50, // EV = 0.55 * 1.50 - 1 = -0.175 → negative
    });
    const bets = adaptV5ToValueBets(v5, { match });
    expect(bets).toEqual([]);
  });

  it('returns multiple bets (bestPick + qualifying backups), deduped by marketKey', () => {
    const v5 = mkV5(
      { marketKey: 'over_25', selection: 'Over 2.5', modelProbability: 0.72,
        impliedProbability: 0.55, edge: 0.17, finalScore: 0.55, bookmakerOdds: 1.85 },
      [
        { marketKey: 'btts_yes', selection: 'BTTS Yes', modelProbability: 0.65,
          impliedProbability: 0.55, edge: 0.10, finalScore: 0.40, bookmakerOdds: 1.85 },
        { marketKey: 'over_25', selection: 'Over 2.5', modelProbability: 0.72,
          impliedProbability: 0.55, edge: 0.17, finalScore: 0.55, bookmakerOdds: 1.85 }, // dupe
      ],
    );
    const bets = adaptV5ToValueBets(v5, { match });
    expect(bets.length).toBe(2);
    expect(bets.map((b) => b.selection).sort()).toEqual(['BTTS Yes', 'Over 2.5']);
  });

  it('sorts results by edge descending', () => {
    const v5 = mkV5(
      { marketKey: 'btts_yes', selection: 'BTTS Yes', modelProbability: 0.65,
        impliedProbability: 0.55, edge: 0.10, finalScore: 0.40, bookmakerOdds: 1.85 },
      [
        { marketKey: 'over_25', selection: 'Over 2.5', modelProbability: 0.72,
          impliedProbability: 0.55, edge: 0.17, finalScore: 0.55, bookmakerOdds: 1.85 },
      ],
    );
    const bets = adaptV5ToValueBets(v5, { match });
    expect(bets[0].edge).toBeGreaterThan(bets[1].edge);
  });

  it('populates prediction sub-object with all required fields', () => {
    const v5 = mkV5({
      marketKey: 'over_25', selection: 'Over 2.5',
      modelProbability: 0.72, impliedProbability: 0.55,
      edge: 0.17, finalScore: 0.55, bookmakerOdds: 1.85,
    });
    const bets = adaptV5ToValueBets(v5, { match });
    const p = bets[0].prediction;
    expect(p.eventId).toBe(9344);
    expect(p.homeTeam).toBe('Liverpool');
    expect(p.homeWinProb).toBe(0.50);
    expect(p.drawProb).toBe(0.25);
    expect(p.awayWinProb).toBe(0.25);
    expect(p.predicted).toBe('H');
    expect(p.homeExpectedGoals).toBeCloseTo(1.7, 4);
    expect(p.over25Prob).toBe(0.72);
    expect(p.mostLikelyScore).toBe('2-1');
    expect(p.decision?.primary).toBe('Over 2.5');
    expect(p.risk?.level).toBeDefined();
  });

  it('Kelly stake is between 0 and 10% (quarter-Kelly cap)', () => {
    const v5 = mkV5({
      marketKey: 'over_25', selection: 'Over 2.5',
      modelProbability: 0.95, impliedProbability: 0.50,
      edge: 0.45, finalScore: 0.65, bookmakerOdds: 2.00,
    });
    const bets = adaptV5ToValueBets(v5, { match });
    expect(bets[0].kellyStake).toBeGreaterThan(0);
    expect(bets[0].kellyStake).toBeLessThanOrEqual(0.10);
    expect(bets[0].adjustedKelly).toBeGreaterThan(0);
    expect(bets[0].adjustedKelly).toBeLessThanOrEqual(0.10);
  });
});
