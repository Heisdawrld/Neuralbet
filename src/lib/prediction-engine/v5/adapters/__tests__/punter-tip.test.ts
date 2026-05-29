// ═══════════════════════════════════════════════════════════════════════
// V5 → PunterTipV4 adapter — shape + mapping correctness tests
//
// These tests pin the v4-compatible shape every API route now emits.
// If anything here breaks, the frontend match panel / predictions tab
// will silently break. Tests are tight.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  adaptV5ToPunterTip,
  mapV5ToPunterQuality,
  mapV5ToPunterRisk,
  marketLabel,
  computeKellyStake,
} from '../punter-tip';
import type { PredictionResult } from '../../index';

function mkV5(overrides: Partial<PredictionResult> = {}): PredictionResult {
  return {
    fixtureId: 1234,
    homeTeam: 'Liverpool', awayTeam: 'Chelsea',
    expectedGoals: { home: 1.6, away: 1.2, total: 2.8 },
    bestPick: {
      marketKey: 'over_25', selection: 'Over 2.5 Goals',
      modelProbability: 0.72, impliedProbability: 0.55,
      edge: 0.17, finalScore: 0.55, bookmakerOdds: 1.85,
      tacticalFitScore: 0.85, advisor_status: 'BET',
      riskLevel: 'SAFE', edgeLabel: 'STRONG EDGE',
    },
    backupPicks: [],
    noSafePick: false,
    noSafePickReason: null,
    abstainCode: null,
    confidence: { model: 'high', value: 'strong', volatility: 'low' },
    reasonCodes: ['H2H_GOAL_RATE', 'OPEN_MATCH'],
    script: { primary: 'open_end_to_end', confidence: 0.78 },
    calibratedProbs: {
      homeWin: 0.50, draw: 0.25, awayWin: 0.25,
      over25: 0.72, bttsYes: 0.65, over15: 0.85, over35: 0.40,
      under15: 0.15, under25: 0.28, under35: 0.60,
      bttsNo: 0.35,
    },
    dataCompleteness: 0.78,
    engineVersion: '5.0.0',
    updatedAt: '2026-05-29T05:55:00.000Z',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// mapV5ToPunterQuality
// ─────────────────────────────────────────────────────────────────────
describe('mapV5ToPunterQuality', () => {
  it('BET + STRONG EDGE → gold', () => {
    expect(mapV5ToPunterQuality('BET', 'STRONG EDGE')).toBe('gold');
  });
  it('BET + MODERATE EDGE → silver', () => {
    expect(mapV5ToPunterQuality('BET', 'MODERATE EDGE')).toBe('silver');
  });
  it('BET + GAMBLE EDGE → silver', () => {
    expect(mapV5ToPunterQuality('BET', 'GAMBLE EDGE')).toBe('silver');
  });
  it('ACCA + STRONG EDGE → silver', () => {
    expect(mapV5ToPunterQuality('ACCA', 'STRONG EDGE')).toBe('silver');
  });
  it('ACCA + MODERATE EDGE → silver', () => {
    expect(mapV5ToPunterQuality('ACCA', 'MODERATE EDGE')).toBe('silver');
  });
  it('ACCA + LEAN → bronze', () => {
    expect(mapV5ToPunterQuality('ACCA', 'LEAN')).toBe('bronze');
  });
  it('SKIP → skip regardless of edge label', () => {
    expect(mapV5ToPunterQuality('SKIP', 'STRONG EDGE')).toBe('skip');
  });
  it('undefined/missing → skip (safe default)', () => {
    expect(mapV5ToPunterQuality(undefined, undefined)).toBe('skip');
    expect(mapV5ToPunterQuality('', '')).toBe('skip');
  });
});

// ─────────────────────────────────────────────────────────────────────
// mapV5ToPunterRisk
// ─────────────────────────────────────────────────────────────────────
describe('mapV5ToPunterRisk', () => {
  it('SAFE + very high prob → very-low', () => {
    expect(mapV5ToPunterRisk('SAFE', 0.80)).toBe('very-low');
  });
  it('SAFE + moderate prob → low', () => {
    expect(mapV5ToPunterRisk('SAFE', 0.72)).toBe('low');
  });
  it('MODERATE → medium regardless of prob', () => {
    expect(mapV5ToPunterRisk('MODERATE', 0.55)).toBe('medium');
    expect(mapV5ToPunterRisk('MODERATE', 0.80)).toBe('medium');
  });
  it('AGGRESSIVE + mid prob → high', () => {
    expect(mapV5ToPunterRisk('AGGRESSIVE', 0.65)).toBe('high');
  });
  it('AGGRESSIVE + low prob → very-high', () => {
    expect(mapV5ToPunterRisk('AGGRESSIVE', 0.50)).toBe('very-high');
  });
  it('unknown → medium (safe default)', () => {
    expect(mapV5ToPunterRisk('NONSENSE', 0.55)).toBe('medium');
    expect(mapV5ToPunterRisk(undefined, 0.55)).toBe('medium');
  });
});

// ─────────────────────────────────────────────────────────────────────
// marketLabel
// ─────────────────────────────────────────────────────────────────────
describe('marketLabel', () => {
  it('1X2 markets share the "1X2" label', () => {
    expect(marketLabel('home_win')).toBe('1X2');
    expect(marketLabel('draw')).toBe('1X2');
    expect(marketLabel('away_win')).toBe('1X2');
  });
  it('over/under markets reflect the line', () => {
    expect(marketLabel('over_25')).toBe('Over/Under 2.5');
    expect(marketLabel('under_25')).toBe('Over/Under 2.5');
    expect(marketLabel('over_35')).toBe('Over/Under 3.5');
  });
  it('BTTS', () => {
    expect(marketLabel('btts_yes')).toBe('BTTS');
    expect(marketLabel('btts_no')).toBe('BTTS');
  });
  it('unknown → fallback', () => {
    expect(marketLabel('something_new')).toBe('Match Market');
  });
});

// ─────────────────────────────────────────────────────────────────────
// computeKellyStake
// ─────────────────────────────────────────────────────────────────────
describe('computeKellyStake', () => {
  it('returns 0 when odds are missing or ≤ 1.0', () => {
    expect(computeKellyStake(0.7, null)).toBe(0);
    expect(computeKellyStake(0.7, 0.5)).toBe(0);
    expect(computeKellyStake(0.7, 1.0)).toBe(0);
  });
  it('returns 0 when expected value is negative', () => {
    // prob=0.30, odds=2.00 → fair odds=3.33 → no value
    expect(computeKellyStake(0.30, 2.00)).toBe(0);
  });
  it('returns positive stake when expected value is positive', () => {
    // prob=0.60, odds=2.00 → b=1, q=0.40 → full = (0.6-0.4)/1 = 0.20 → quarter = 0.05
    expect(computeKellyStake(0.60, 2.00)).toBeCloseTo(0.05, 3);
  });
  it('caps stake at 10% (full Kelly would be huge)', () => {
    // prob=0.95, odds=2.00 → full kelly ≈ 0.90 → quarter = 0.225 → CAPPED to 0.10
    expect(computeKellyStake(0.95, 2.00)).toBe(0.10);
  });
});

// ─────────────────────────────────────────────────────────────────────
// adaptV5ToPunterTip — full shape
// ─────────────────────────────────────────────────────────────────────
describe('adaptV5ToPunterTip — shape and field mapping', () => {
  it('produces every top-level field the frontend expects', () => {
    const v5 = mkV5();
    const adapted = adaptV5ToPunterTip(v5, {
      leagueId: 49, leagueName: 'J1 League',
      homeTeamId: 1945, awayTeamId: 1936,
      eventDate: '2026-05-29T14:00:00Z', status: 'notstarted',
    });

    // Identity
    expect(adapted.eventId).toBe(1234);
    expect(adapted.homeTeam).toBe('Liverpool');
    expect(adapted.awayTeam).toBe('Chelsea');
    expect(adapted.homeTeamId).toBe(1945);
    expect(adapted.awayTeamId).toBe(1936);
    expect(adapted.leagueId).toBe(49);
    expect(adapted.leagueName).toBe('J1 League');
    expect(adapted.eventDate).toBe('2026-05-29T14:00:00Z');
    expect(adapted.status).toBe('notstarted');
    expect(adapted.engineVersion).toBe('5.0.0');

    // Probabilities
    expect(adapted.probabilities.homeWin).toBe(0.5);
    expect(adapted.probabilities.draw).toBe(0.25);
    expect(adapted.probabilities.awayWin).toBe(0.25);
    expect(adapted.probabilities.homeXg).toBe(1.6);
    expect(adapted.probabilities.awayXg).toBe(1.2);
    expect(adapted.probabilities.over25).toBe(0.72);
    expect(adapted.probabilities.bttsYes).toBe(0.65);

    // Analysis stub is present
    expect(adapted.analysis.dataQuality).toBeCloseTo(0.78, 4);
    expect(adapted.analysis.gameplay.expectedStyle).toBe('open');
    expect(adapted.analysis.gameplay.expectedGoals).toBeCloseTo(2.8, 4);
    expect(adapted.analysis.league.leagueId).toBe(49);
    expect(adapted.analysis.league.leagueName).toBe('J1 League');
  });

  it('best pick is mapped to v4 tip shape', () => {
    const v5 = mkV5();
    const adapted = adaptV5ToPunterTip(v5);
    expect(adapted.tip).not.toBeNull();
    expect(adapted.tip!.selection).toBe('Over 2.5 Goals');
    expect(adapted.tip!.market).toBe('Over/Under 2.5');
    expect(adapted.tip!.odds).toBe(1.85);
    expect(adapted.tip!.confidence).toBeCloseTo(0.72, 4);
    expect(adapted.tip!.edge).toBeCloseTo(0.17, 4);
    expect(adapted.tip!.quality).toBe('gold');  // BET + STRONG EDGE
    expect(adapted.tip!.riskLevel).toBe('low'); // SAFE + 0.72 prob (< 0.78)
    expect(adapted.tip!.kellyStake).toBeGreaterThan(0);
    expect(adapted.tip!.rank).toBe(1);
    expect(adapted.tip!.marketsEvaluated).toBe(30);
    expect(adapted.skipReason).toBeNull();
  });

  it('isSafePlay set when SAFE risk + high prob', () => {
    const v5 = mkV5({
      bestPick: { ...mkV5().bestPick!, modelProbability: 0.80, riskLevel: 'SAFE' } as any,
    });
    const adapted = adaptV5ToPunterTip(v5);
    expect(adapted.tip!.isSafePlay).toBe(true);
  });

  it('isContrarian set when edge > 8%', () => {
    const v5 = mkV5({
      bestPick: { ...mkV5().bestPick!, edge: 0.15 } as any,
    });
    const adapted = adaptV5ToPunterTip(v5);
    expect(adapted.tip!.isContrarian).toBe(true);
  });

  it('abstain (no bestPick) → tip=null, skipReason populated', () => {
    const v5 = mkV5({
      bestPick: null,
      noSafePick: true,
      noSafePickReason: 'Top two markets too close',
      abstainCode: 'WEAK_SEPARATION',
    });
    const adapted = adaptV5ToPunterTip(v5);
    expect(adapted.tip).toBeNull();
    expect(adapted.skipReason).toBe('Top two markets too close');
  });

  it('abstain with no reason gets a default "No edge found"', () => {
    const v5 = mkV5({
      bestPick: null, noSafePick: true, noSafePickReason: null,
    });
    const adapted = adaptV5ToPunterTip(v5);
    expect(adapted.skipReason).toBe('No edge found');
  });

  it('league name falls back to "League {id}" when not provided', () => {
    const v5 = mkV5();
    const adapted = adaptV5ToPunterTip(v5, { leagueId: 49 });
    expect(adapted.leagueName).toBe('League 49');
  });

  it('handles minimal v5 result without crashing (NaN-safe)', () => {
    const minimal: PredictionResult = {
      fixtureId: 1,
      homeTeam: '', awayTeam: '',
      expectedGoals: { home: NaN, away: NaN, total: NaN } as any,
      bestPick: null, backupPicks: [],
      noSafePick: true, noSafePickReason: null, abstainCode: null,
      confidence: { model: 'low', value: 'skip', volatility: 'high' },
      reasonCodes: [], script: { primary: 'chaotic_unreliable', confidence: 0 },
      calibratedProbs: {}, dataCompleteness: 0, engineVersion: '5.0.0',
      updatedAt: '',
    };
    const adapted = adaptV5ToPunterTip(minimal);
    expect(Number.isFinite(adapted.probabilities.homeXg)).toBe(true);
    expect(Number.isFinite(adapted.probabilities.homeWin)).toBe(true);
    expect(adapted.probabilities.homeXg).toBe(0); // NaN safeNum'd to 0
  });

  it('gameplay.expectedStyle reflects script primary', () => {
    expect(adaptV5ToPunterTip(mkV5({ script: { primary: 'tight_low_event', confidence: 0.7 } } as any))
      .analysis.gameplay.expectedStyle).toBe('defensive');
    expect(adaptV5ToPunterTip(mkV5({ script: { primary: 'dominant_home_pressure', confidence: 0.7 } } as any))
      .analysis.gameplay.expectedStyle).toBe('asymmetric');
    expect(adaptV5ToPunterTip(mkV5({ script: { primary: 'open_end_to_end', confidence: 0.7 } } as any))
      .analysis.gameplay.expectedStyle).toBe('open');
  });
});
