// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Punter Brain v3: Full Markets Calculator
//
// Takes the goal probability matrix and derives EVERY market.
// A punter doesn't just predict 1X2 — they see the whole board.
// ═══════════════════════════════════════════════════════════════════════

import type { FullMarketProbs, AsianHandicapLine, CorrectScore } from './types';
import { poissonProb, clamp } from '../utils';

/**
 * Build the full goal probability matrix (0-maxGoals x 0-maxGoals)
 * with Dixon-Coles correlation correction.
 */
export function buildGoalMatrix(
  homeLambda: number,
  awayLambda: number,
  maxGoals = 8,
  rho = 0.1
): number[][] {
  const matrix: number[][] = [];

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const baseProb = poissonProb(homeLambda, h) * poissonProb(awayLambda, a);
      let correction = 1;
      if (h === 0 && a === 0) correction = 1 - (homeLambda * awayLambda * rho);
      else if (h === 1 && a === 0) correction = 1 + (awayLambda * rho);
      else if (h === 0 && a === 1) correction = 1 + (homeLambda * rho);
      else if (h === 1 && a === 1) correction = 1 - rho;
      matrix[h][a] = Math.max(0, baseProb * correction);
    }
  }

  return matrix;
}

/**
 * Calculate ALL market probabilities from the goal matrix.
 * This is the core math — every market derives from goal distributions.
 */
export function calculateAllMarkets(
  matrix: number[][],
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  homeXg: number,
  awayXg: number
): FullMarketProbs {
  // ── Over/Under Probabilities ─────────────────────────────────────
  let over05 = 0, over15 = 0, over25 = 0, over35 = 0, over45 = 0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      const prob = matrix[h][a];
      const total = h + a;
      if (total > 0) over05 += prob;
      if (total > 1) over15 += prob;
      if (total > 2) over25 += prob;
      if (total > 3) over35 += prob;
      if (total > 4) over45 += prob;
    }
  }

  // ── BTTS ─────────────────────────────────────────────────────────
  let bttsYes = 0;
  for (let h = 1; h < matrix.length; h++) {
    for (let a = 1; a < (matrix[h]?.length ?? 0); a++) {
      bttsYes += matrix[h][a];
    }
  }

  // ── Double Chance ────────────────────────────────────────────────
  const doubleChance1X = homeWinProb + drawProb;
  const doubleChance12 = homeWinProb + awayWinProb;
  const doubleChanceX2 = drawProb + awayWinProb;

  // ── Draw No Bet ──────────────────────────────────────────────────
  // Remove draw proportionally from home/away
  const nonDrawTotal = homeWinProb + awayWinProb;
  const dnbHome = nonDrawTotal > 0 ? homeWinProb / nonDrawTotal : 0.5;
  const dnbAway = nonDrawTotal > 0 ? awayWinProb / nonDrawTotal : 0.5;

  // ── Asian Handicap ───────────────────────────────────────────────
  const ahLines: AsianHandicapLine[] = [];
  const ahValues = [-2.5, -2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0, 2.5];

  for (const line of ahValues) {
    let homeCovers = 0;
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
        const adjustedDiff = (h - a) - line; // Home handicap
        if (adjustedDiff > 0) {
          homeCovers += matrix[h][a];
        } else if (adjustedDiff === 0) {
          // Half push (for quarter lines, but we treat as half for 0.5 lines)
          homeCovers += matrix[h][a] * 0.5;
        }
      }
    }
    ahLines.push({
      line,
      homeProb: clamp(homeCovers, 0, 1),
      awayProb: clamp(1 - homeCovers, 0, 1),
    });
  }

  // ── Correct Scores (top 10) ─────────────────────────────────────
  const allScores: CorrectScore[] = [];
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
      allScores.push({ score: `${h}-${a}`, prob: matrix[h][a] });
    }
  }
  allScores.sort((a, b) => b.prob - a.prob);
  const correctScores = allScores.slice(0, 10);

  const mostLikelyScore = correctScores[0]?.score ?? '1-1';

  return {
    homeWin: homeWinProb,
    draw: drawProb,
    awayWin: awayWinProb,
    over05, under05: 1 - over05,
    over15, under15: 1 - over15,
    over25, under25: 1 - over25,
    over35, under35: 1 - over35,
    over45, under45: 1 - over45,
    bttsYes, bttsNo: 1 - bttsYes,
    doubleChance1X, doubleChance12, doubleChanceX2,
    dnbHome, dnbAway,
    asianHandicap: ahLines,
    correctScores,
    homeXg: Math.round(homeXg * 100) / 100,
    awayXg: Math.round(awayXg * 100) / 100,
    totalXg: Math.round((homeXg + awayXg) * 100) / 100,
    mostLikelyScore,
  };
}
