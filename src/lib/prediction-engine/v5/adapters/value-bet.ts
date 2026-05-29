// ═══════════════════════════════════════════════════════════════════════
// V5 → OurValueBetData adapter
//
// The legacy `/api/our-value-bets` endpoint emits a list of "value bets"
// (markets where the model thinks the bookmaker is mispricing). This
// adapter takes a V5 PredictionResult and synthesizes the same shape so
// the existing value-bets.tsx + PunterValueBetCard render unchanged.
//
// What constitutes a value bet (V5 definition):
//   • Candidate is priced (bookmakerOdds > 1.0)
//   • Edge ≥ MIN_EDGE_FOR_VALUE (default 5%)
//   • EV > 0
//   • Survives V5 quality gates (already pruned + scored upstream)
//
// We emit one ValueBet per qualifying candidate (best pick + backups + any
// other qualifying market). value-bets.tsx sorts by edge descending.
// ═══════════════════════════════════════════════════════════════════════

import type { PredictionResult, MarketCandidate } from '../index';
import { safeNum } from '../xg/shared';
import { computeKellyStake, marketLabel } from './punter-tip';

// ─────────────────────────────────────────────────────────────────────
// Mirror of OurValueBetData (lib/types.ts) — kept local so we don't
// import the v1 type file (which depends on legacy engine modules).
// ─────────────────────────────────────────────────────────────────────

export interface ValueBetMatch {
  id: number;
  homeTeam: string; awayTeam: string;
  homeTeamId: number; awayTeamId: number;
  leagueId: number; leagueName: string;
  eventDate: string;
  status: string;
  homeScore: number | null; awayScore: number | null;
  currentMinute: number | null; period: string;
}

export interface ValueBetPrediction {
  eventId: number;
  homeTeam: string; awayTeam: string;
  homeTeamId: number; awayTeamId: number;
  leagueId: number; leagueName: string;
  eventDate: string;
  status: string;
  homeWinProb: number; drawProb: number; awayWinProb: number;
  predicted: 'H' | 'D' | 'A';
  homeExpectedGoals: number; awayExpectedGoals: number;
  over15Prob: number; over25Prob: number; over35Prob: number;
  bttsProb: number;
  mostLikelyScore: string;
  /** Minimal "decision" + "risk" so value-bets.tsx's small UI hints render */
  decision?: { primary: string; alternative?: string; confidence: number };
  risk?: { level: string; reason: string };
}

export interface ValueBet {
  match: ValueBetMatch;
  prediction: ValueBetPrediction;
  market: string;
  selection: string;
  modelProbability: number;
  impliedProbability: number;
  odds: number;
  edge: number;
  kellyStake: number;
  adjustedKelly: number;
  valueRating: 1 | 2 | 3 | 4 | 5;
  isActionable: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// VALUE THRESHOLDS
// ─────────────────────────────────────────────────────────────────────
export const MIN_EDGE_FOR_VALUE = 0.05;       // 5% — below this, not value
export const MIN_MODEL_PROB_FOR_VALUE = 0.50; // engine must give the bet a real shot
export const MIN_ODDS = 1.20;                 // sub-1.20 odds = no juice

/** Star rating 1-5 based on edge magnitude. */
export function edgeToValueRating(edge: number): 1 | 2 | 3 | 4 | 5 {
  if (edge >= 0.20) return 5;
  if (edge >= 0.15) return 4;
  if (edge >= 0.10) return 3;
  if (edge >= 0.07) return 2;
  return 1;
}

function mostLikelyScoreFromXg(homeXg: number, awayXg: number): string {
  const h = Math.max(0, Math.round(homeXg));
  const a = Math.max(0, Math.round(awayXg));
  return `${h}-${a}`;
}

function predictedSide(homeWin: number, draw: number, awayWin: number): 'H' | 'D' | 'A' {
  const max = Math.max(homeWin, draw, awayWin);
  if (max === homeWin) return 'H';
  if (max === awayWin) return 'A';
  return 'D';
}

// ─────────────────────────────────────────────────────────────────────
// Build the prediction sub-object
// ─────────────────────────────────────────────────────────────────────
function buildValueBetPrediction(
  v5: PredictionResult,
  match: ValueBetMatch,
): ValueBetPrediction {
  const homeWin = safeNum(v5.calibratedProbs?.homeWin, 0);
  const draw = safeNum(v5.calibratedProbs?.draw, 0);
  const awayWin = safeNum(v5.calibratedProbs?.awayWin, 0);
  const homeXg = safeNum(v5.expectedGoals?.home, 0);
  const awayXg = safeNum(v5.expectedGoals?.away, 0);

  return {
    eventId: v5.fixtureId,
    homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId,
    leagueId: match.leagueId, leagueName: match.leagueName,
    eventDate: match.eventDate, status: match.status,
    homeWinProb: homeWin, drawProb: draw, awayWinProb: awayWin,
    predicted: predictedSide(homeWin, draw, awayWin),
    homeExpectedGoals: homeXg, awayExpectedGoals: awayXg,
    over15Prob: safeNum(v5.calibratedProbs?.over15, 0),
    over25Prob: safeNum(v5.calibratedProbs?.over25, 0),
    over35Prob: safeNum(v5.calibratedProbs?.over35, 0),
    bttsProb: safeNum(v5.calibratedProbs?.bttsYes, 0),
    mostLikelyScore: mostLikelyScoreFromXg(homeXg, awayXg),
    decision: {
      primary: v5.bestPick?.selection || 'No safe pick',
      confidence: safeNum(v5.bestPick?.modelProbability, 0),
    },
    risk: {
      level: String((v5.bestPick as any)?.riskLevel || 'MODERATE').toLowerCase(),
      reason: v5.noSafePickReason || v5.reasonCodes?.[0] || 'engine confidence',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Decide if a candidate qualifies as a value bet
// ─────────────────────────────────────────────────────────────────────
function isValueQualifying(c: MarketCandidate): boolean {
  if (c.bookmakerOdds == null || c.bookmakerOdds < MIN_ODDS) return false;
  const prob = safeNum(c.modelProbability, 0);
  const edge = safeNum(c.edge, 0);
  if (prob < MIN_MODEL_PROB_FOR_VALUE) return false;
  if (edge < MIN_EDGE_FOR_VALUE) return false;
  const ev = prob * c.bookmakerOdds - 1;
  return ev > 0;
}

// ─────────────────────────────────────────────────────────────────────
// MAIN ADAPTER
// ─────────────────────────────────────────────────────────────────────

export interface ValueBetAdaptOptions {
  match: ValueBetMatch;
  /** Multiplier on Kelly (default 0.5 — half-Kelly is industry-conservative). */
  kellyShrink?: number;
}

/**
 * Adapt a V5 prediction result into a list of value bets.
 * Returns [] if no candidates meet the value thresholds (engine abstained
 * or all picks are no-edge).
 */
export function adaptV5ToValueBets(
  v5: PredictionResult,
  opts: ValueBetAdaptOptions,
): ValueBet[] {
  const { match, kellyShrink = 0.5 } = opts;
  const prediction = buildValueBetPrediction(v5, match);

  // Collect all candidates the engine considered (bestPick + backups)
  const candidates: MarketCandidate[] = [];
  if (v5.bestPick) candidates.push(v5.bestPick);
  if (Array.isArray(v5.backupPicks)) candidates.push(...v5.backupPicks);

  // Dedupe by marketKey (bestPick may also appear in backups)
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    if (!c?.marketKey) return false;
    if (seen.has(c.marketKey)) return false;
    seen.add(c.marketKey);
    return true;
  });

  const out: ValueBet[] = [];
  for (const c of unique) {
    if (!isValueQualifying(c)) continue;
    const odds = c.bookmakerOdds as number;
    const modelProb = safeNum(c.modelProbability, 0);
    const impliedProb = safeNum(c.impliedProbability, 1 / odds);
    const edge = safeNum(c.edge, modelProb - impliedProb);
    const fullKelly = computeKellyStake(modelProb, odds); // already quarter-Kelly capped at 10%
    out.push({
      match,
      prediction,
      market: marketLabel(c.marketKey),
      selection: c.selection,
      modelProbability: modelProb,
      impliedProbability: impliedProb,
      odds,
      edge,
      kellyStake: fullKelly,
      adjustedKelly: Math.max(0, Math.min(0.10, fullKelly * kellyShrink * 2)),  // back-compat scaling
      valueRating: edgeToValueRating(edge),
      isActionable: true,
    });
  }

  // Sort by edge desc (frontend also sorts but we pre-sort for consistency)
  return out.sort((a, b) => b.edge - a.edge);
}
