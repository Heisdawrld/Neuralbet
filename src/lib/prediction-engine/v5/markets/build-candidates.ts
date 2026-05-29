// ═══════════════════════════════════════════════════════════════════════
// Build market candidates from a calibrated probabilities map
//
// Pure: same probs → same candidates → same order. No side effects.
// ═══════════════════════════════════════════════════════════════════════

import { clamp, safeNum } from '../xg/shared';
import type { MarketCandidate } from '../types';
import { MARKET_DEFINITIONS } from './registry';

function round4(num: number): number {
  return Math.round(num * 10000) / 10000;
}

export function buildMarketCandidates(calibratedProbs: Record<string, number>): MarketCandidate[] {
  const probs = calibratedProbs || {};
  const candidates: MarketCandidate[] = [];

  for (const def of MARKET_DEFINITIONS) {
    let modelProbability: number;
    if (def.probKey && probs[def.probKey] != null) {
      modelProbability = safeNum(probs[def.probKey], 0);
    } else if (def.compute) {
      modelProbability = safeNum(def.compute(probs), 0);
    } else {
      continue; // Definition has neither probKey nor compute — skip.
    }

    candidates.push({
      marketKey: def.marketKey,
      selection: def.selection,
      modelProbability: round4(clamp(modelProbability, 0, 1)),
      impliedProbability: null,
      edge: null,
      finalScore: 0,
      bookmakerOdds: null,
    });
  }

  return candidates;
}
