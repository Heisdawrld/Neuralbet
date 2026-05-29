// ═══════════════════════════════════════════════════════════════════════
// V5 → PunterTipV4 adapter
//
// The frontend's match-detail panel and predictions tab consume the v4
// PunterTipV4 shape. Rather than rewrite every consumer in lockstep with
// the v4→v5 backend migration, we adapt the V5 PredictionResult into the
// PunterTipV4 shape on the response boundary.
//
// This lets us:
//   1. Switch the engine (v4 → v5) with ZERO frontend changes
//   2. Delete v4 entirely once every API route is migrated
//   3. Update the frontend to use a v5-native shape later, on its own cadence
//
// Mapping is honest: where v5 doesn't have a v4 field, we either compute
// it (modelAgreement = 1 - volatility) or use the most defensible default.
// Every field that requires an opinion is documented.
// ═══════════════════════════════════════════════════════════════════════

import type { PredictionResult } from '../index';
import { safeNum } from '../xg/shared';

// ─────────────────────────────────────────────────────────────────────
// Local types — mirror the v4 shape WITHOUT importing v4 (v4 will be
// deleted soon, no circular dep risk)
// ─────────────────────────────────────────────────────────────────────

export type PunterTipQuality = 'gold' | 'silver' | 'bronze' | 'skip';
export type PunterRiskLevel = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export interface PunterTheTip {
  selection: string;
  market: string;
  odds: number | null;
  confidence: number;
  edge: number;
  kellyStake: number;
  quality: PunterTipQuality;
  reasoning: string;
  riskLevel: PunterRiskLevel;
  isContrarian: boolean;
  isSafePlay: boolean;
  riskRewardScore: number;
  marketsEvaluated: number;
  rank: 1;
}

export interface PunterTeamLast5 {
  wins: number; draws: number; losses: number;
  goalsScored: number; goalsConceded: number;
  form: string; cleanSheets: number; failedToScore: number;
}

export interface PunterMatchAnalysis {
  h2h: {
    homeWins: number; draws: number; awayWins: number;
    totalMeetings: number; avgGoals: number;
    over25Rate: number; bttsRate: number; note: string;
  };
  last5: { home: PunterTeamLast5; away: PunterTeamLast5 };
  form: {
    homeFormScore: number; awayFormScore: number;
    homeTrend: 'rising' | 'stable' | 'declining';
    awayTrend: 'rising' | 'stable' | 'declining';
    note: string;
  };
  manager: {
    homeManager: string | null; awayManager: string | null;
    homeStyle: string; awayStyle: string;
    tacticalMatchup: string;
    goalExpectationModifier: number; bttsModifier: number;
  };
  gameplay: {
    expectedStyle: 'open' | 'defensive' | 'asymmetric' | 'balanced';
    expectedGoals: number;
    expectedCards: 'low' | 'average' | 'high';
    possessionExpectation: 'home-dominant' | 'balanced' | 'away-dominant';
    note: string;
  };
  league: {
    leagueId: number; leagueName: string;
    avgGoalsPerMatch: number;
    homeWinRate: number; drawRate: number; awayWinRate: number;
    over25Rate: number; bttsRate: number;
    competitiveness: 'high' | 'medium' | 'low';
  };
  situation: {
    isDerby: boolean;
    homeMotivation: 'must-win' | 'high' | 'medium' | 'low' | 'dead-rubber';
    awayMotivation: 'must-win' | 'high' | 'medium' | 'low' | 'dead-rubber';
    weatherNote: string | null; fatigueNote: string | null; travelNote: string | null;
    keyAbsences: string[];
  };
  dataQuality: number;
}

export interface PunterTipV4 {
  eventId: number;
  homeTeam: string; awayTeam: string;
  homeTeamId: number; awayTeamId: number;
  leagueId: number; leagueName: string;
  eventDate: string;
  status: string;
  tip: PunterTheTip | null;
  skipReason: string | null;
  analysis: PunterMatchAnalysis;
  probabilities: {
    homeWin: number; draw: number; awayWin: number;
    homeXg: number; awayXg: number;
    over25: number; bttsYes: number;
  };
  modelAgreement: number;
  engineVersion: string;
}

// ─────────────────────────────────────────────────────────────────────
// Quality mapping — V5's MarketCandidate.advisor_status / edgeLabel → v4 quality tier
// ─────────────────────────────────────────────────────────────────────

/**
 * V5 emits advisor_status (BET / ACCA / SKIP) + edgeLabel
 * (STRONG EDGE / MODERATE EDGE / GAMBLE EDGE / LEAN / NO EDGE).
 * v4 quality is one of gold / silver / bronze / skip.
 *
 * Mapping:
 *   advisor=BET   + STRONG EDGE        → gold
 *   advisor=BET   + MODERATE/GAMBLE    → silver
 *   advisor=ACCA  + STRONG/MODERATE    → silver
 *   advisor=ACCA  + GAMBLE/LEAN        → bronze
 *   advisor=SKIP  OR no pick           → skip
 */
export function mapV5ToPunterQuality(advisorStatus: string | undefined, edgeLabel: string | undefined): PunterTipQuality {
  const advisor = String(advisorStatus || '').toUpperCase();
  const edge = String(edgeLabel || '').toUpperCase();

  if (advisor === 'SKIP') return 'skip';
  if (advisor === 'BET') {
    if (edge === 'STRONG EDGE') return 'gold';
    return 'silver';
  }
  if (advisor === 'ACCA') {
    if (edge === 'STRONG EDGE' || edge === 'MODERATE EDGE') return 'silver';
    return 'bronze';
  }
  return 'skip';
}

/**
 * V5 risk levels (SAFE / MODERATE / AGGRESSIVE) → v4 risk levels
 * (very-low / low / medium / high / very-high).
 *
 * Mapping (uses model probability as a tiebreaker for low/very-low / high/very-high):
 *   SAFE        + prob ≥ 0.78 → very-low
 *   SAFE        + prob <  0.78 → low
 *   MODERATE                  → medium
 *   AGGRESSIVE  + prob ≥ 0.60 → high
 *   AGGRESSIVE  + prob <  0.60 → very-high
 */
export function mapV5ToPunterRisk(riskLevel: string | undefined, modelProb: number): PunterRiskLevel {
  const r = String(riskLevel || '').toUpperCase();
  if (r === 'SAFE') return modelProb >= 0.78 ? 'very-low' : 'low';
  if (r === 'MODERATE') return 'medium';
  if (r === 'AGGRESSIVE') return modelProb >= 0.60 ? 'high' : 'very-high';
  return 'medium';
}

// ─────────────────────────────────────────────────────────────────────
// Market label → v4 'market' string mapping (selection stays as-is)
// ─────────────────────────────────────────────────────────────────────
const MARKET_LABELS: Record<string, string> = {
  home_win: '1X2', draw: '1X2', away_win: '1X2',
  double_chance_home: 'Double Chance', double_chance_away: 'Double Chance',
  dnb_home: 'Draw No Bet', dnb_away: 'Draw No Bet',
  over_15: 'Over/Under 1.5', under_15: 'Over/Under 1.5',
  over_25: 'Over/Under 2.5', under_25: 'Over/Under 2.5',
  over_35: 'Over/Under 3.5', under_35: 'Over/Under 3.5',
  btts_yes: 'BTTS', btts_no: 'BTTS',
  home_over_05: 'Team Totals', home_over_15: 'Team Totals', home_over_25: 'Team Totals',
  home_under_15: 'Team Totals',
  away_over_05: 'Team Totals', away_over_15: 'Team Totals', away_over_25: 'Team Totals',
  away_under_15: 'Team Totals',
  win_either_half_home: 'Win Either Half', win_either_half_away: 'Win Either Half',
  handicap_home_minus1: 'Asian Handicap', handicap_away_minus1: 'Asian Handicap',
  handicap_home_plus1: 'Asian Handicap', handicap_away_plus1: 'Asian Handicap',
};

export function marketLabel(marketKey: string): string {
  return MARKET_LABELS[marketKey] || 'Match Market';
}

// ─────────────────────────────────────────────────────────────────────
// Kelly stake — simple fractional Kelly capped at 10%
// ─────────────────────────────────────────────────────────────────────
export function computeKellyStake(modelProb: number, decimalOdds: number | null | undefined): number {
  if (!decimalOdds || decimalOdds <= 1.0) return 0;
  const b = decimalOdds - 1;
  const q = 1 - modelProb;
  const fullKelly = (b * modelProb - q) / b;
  // Quarter-Kelly (conservative) capped at 10%
  return Math.max(0, Math.min(0.10, fullKelly * 0.25));
}

// ─────────────────────────────────────────────────────────────────────
// Default analysis stub — used when we don't have rich per-tab data yet.
// Honest defaults — every field is present and well-typed but minimal.
// Phase 2+ will plumb real per-tab data through this adapter.
// ─────────────────────────────────────────────────────────────────────
function defaultAnalysis(v5: PredictionResult, leagueId: number, leagueName: string): PunterMatchAnalysis {
  const eventStyle = v5.script?.primary === 'open_end_to_end' ? 'open'
    : v5.script?.primary === 'tight_low_event' ? 'defensive'
    : v5.script?.primary === 'dominant_home_pressure' || v5.script?.primary === 'dominant_away_pressure' ? 'asymmetric'
    : 'balanced';

  return {
    h2h: { homeWins: 0, draws: 0, awayWins: 0, totalMeetings: 0, avgGoals: 0,
           over25Rate: 0, bttsRate: 0, note: '' },
    last5: {
      home: { wins: 0, draws: 0, losses: 0, goalsScored: 0, goalsConceded: 0,
              form: '', cleanSheets: 0, failedToScore: 0 },
      away: { wins: 0, draws: 0, losses: 0, goalsScored: 0, goalsConceded: 0,
              form: '', cleanSheets: 0, failedToScore: 0 },
    },
    form: {
      homeFormScore: 0.5, awayFormScore: 0.5,
      homeTrend: 'stable', awayTrend: 'stable',
      note: '',
    },
    manager: {
      homeManager: null, awayManager: null,
      homeStyle: '', awayStyle: '',
      tacticalMatchup: '',
      goalExpectationModifier: 0, bttsModifier: 0,
    },
    gameplay: {
      expectedStyle: eventStyle,
      expectedGoals: safeNum(v5.expectedGoals?.total, 0),
      expectedCards: 'average',
      possessionExpectation: 'balanced',
      note: '',
    },
    league: {
      leagueId, leagueName,
      avgGoalsPerMatch: 0, homeWinRate: 0, drawRate: 0, awayWinRate: 0,
      over25Rate: 0, bttsRate: 0,
      competitiveness: 'medium',
    },
    situation: {
      isDerby: false,
      homeMotivation: 'medium', awayMotivation: 'medium',
      weatherNote: null, fatigueNote: null, travelNote: null,
      keyAbsences: [],
    },
    dataQuality: safeNum(v5.dataCompleteness, 0.5),
  };
}

// ─────────────────────────────────────────────────────────────────────
// MAIN ADAPTER
// ─────────────────────────────────────────────────────────────────────

export interface AdaptOptions {
  /** Override for league name (we usually have it from the events table; v5 alone doesn't). */
  leagueId?: number;
  leagueName?: string;
  /** Optional richer analysis to inject (Phase 2 will plumb real per-tab data through). */
  analysisOverride?: Partial<PunterMatchAnalysis>;
  /** Optional richer last-5 / H2H / standings data. */
  homeTeamId?: number;
  awayTeamId?: number;
  /** Event date / status — frontend uses these for display. */
  eventDate?: string;
  status?: string;
}

/**
 * Convert a V5 PredictionResult into the PunterTipV4 shape consumed by
 * the existing frontend.
 *
 * @param v5  — Output of runV5Prediction()
 * @param opts — Optional metadata (league name, IDs, date, status)
 */
export function adaptV5ToPunterTip(
  v5: PredictionResult,
  opts: AdaptOptions = {},
): PunterTipV4 {
  const leagueId = opts.leagueId ?? 0;
  const leagueName = opts.leagueName ?? `League ${leagueId}`;

  // Build the tip
  let tip: PunterTheTip | null = null;
  let skipReason: string | null = v5.noSafePickReason;

  if (!v5.noSafePick && v5.bestPick) {
    const bp = v5.bestPick;
    const modelProb = safeNum(bp.modelProbability, 0);
    const odds = bp.bookmakerOdds ?? null;
    const edge = safeNum(bp.edge, 0);
    const advisorStatus = (bp as any).advisor_status as string | undefined;
    const edgeLabel = (bp as any).edgeLabel as string | undefined;
    const riskLevel = (bp as any).riskLevel as string | undefined;
    const finalScore = safeNum(bp.finalScore, modelProb);

    tip = {
      selection: bp.selection || bp.marketKey || '',
      market: marketLabel(bp.marketKey),
      odds,
      confidence: modelProb,
      edge,
      kellyStake: computeKellyStake(modelProb, odds),
      quality: mapV5ToPunterQuality(advisorStatus, edgeLabel),
      reasoning: v5.reasonCodes?.length
        ? v5.reasonCodes.slice(0, 3).join(' · ').toLowerCase().replace(/_/g, ' ')
        : `${(modelProb * 100).toFixed(1)}% model · ${edge > 0 ? '+' : ''}${(edge * 100).toFixed(1)}% edge`,
      riskLevel: mapV5ToPunterRisk(riskLevel, modelProb),
      isContrarian: edge > 0.08,
      isSafePlay: String(riskLevel || '').toUpperCase() === 'SAFE' && modelProb >= 0.70,
      riskRewardScore: Math.max(0, Math.min(1, finalScore + 0.5)), // finalScore ∈ [-0.5, 1.0] → [0, 1.5] → clamp
      marketsEvaluated: 30,  // V5 evaluates 30 markets per fixture (registry size)
      rank: 1,
    };
  }

  if (!skipReason && !tip) {
    skipReason = 'No edge found';
  }

  return {
    eventId: v5.fixtureId,
    homeTeam: v5.homeTeam,
    awayTeam: v5.awayTeam,
    homeTeamId: opts.homeTeamId ?? 0,
    awayTeamId: opts.awayTeamId ?? 0,
    leagueId,
    leagueName,
    eventDate: opts.eventDate ?? '',
    status: opts.status ?? 'notstarted',
    tip,
    skipReason: tip ? null : skipReason,
    analysis: { ...defaultAnalysis(v5, leagueId, leagueName), ...(opts.analysisOverride || {}) },
    probabilities: {
      homeWin: Math.round(safeNum(v5.calibratedProbs?.homeWin, 0) * 1000) / 1000,
      draw: Math.round(safeNum(v5.calibratedProbs?.draw, 0) * 1000) / 1000,
      awayWin: Math.round(safeNum(v5.calibratedProbs?.awayWin, 0) * 1000) / 1000,
      homeXg: Math.round(safeNum(v5.expectedGoals?.home, 0) * 100) / 100,
      awayXg: Math.round(safeNum(v5.expectedGoals?.away, 0) * 100) / 100,
      over25: Math.round(safeNum(v5.calibratedProbs?.over25, 0) * 1000) / 1000,
      bttsYes: Math.round(safeNum(v5.calibratedProbs?.bttsYes, 0) * 1000) / 1000,
    },
    // modelAgreement: inverse of volatility — when chaos is low, model and market agree
    modelAgreement: 1 - safeNum(v5.script?.confidence ? 1 - v5.script.confidence : 0.5, 0.5),
    engineVersion: v5.engineVersion || '5.0.0',
  };
}
