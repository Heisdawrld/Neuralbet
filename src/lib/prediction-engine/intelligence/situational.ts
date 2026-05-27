// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Situational Intelligence
//
// Stats are what happened. Situation is WHY it happened and WHAT'S NEXT.
// A punter reads the room before placing a bet.
//
// Questions a punter asks:
// - Is this a must-win for either team? (Relegation battle vs dead rubber)
// - Are they tired from midweek? (Europa League Thursday → Sunday)
// - Is this a derby? (Form goes out the window)
// - Is the data actually reliable? (3 matches ≠ 15 matches)
// ═══════════════════════════════════════════════════════════════════════

import type { TeamStats, SituationalFactors, MotivationLevel } from '../types';

/**
 * Assess the situational context of a match.
 *
 * This is what separates a punter from a calculator.
 * We look at league position, form direction, sample sizes, and contextual flags.
 */
export function assessSituation(
  homeStats: TeamStats | null,
  awayStats: TeamStats | null,
  isDerby: boolean,
  isNeutralGround: boolean,
  leagueId: number
): SituationalFactors {
  const notes: string[] = [];

  // ── Motivation Assessment ────────────────────────────────────────
  const homeMotivation = assessMotivation(homeStats, leagueId);
  const awayMotivation = assessMotivation(awayStats, leagueId);

  const motivationGap = motivationToScore(homeMotivation) - motivationToScore(awayMotivation);
  if (Math.abs(motivationGap) > 0.5) {
    const moreMotivated = motivationGap > 0 ? 'Home' : 'Away';
    notes.push(`${moreMotivated} team has significant motivation advantage`);
  }

  // ── Fatigue Estimation ───────────────────────────────────────────
  const homeFatigue = estimateFatigue(homeStats);
  const awayFatigue = estimateFatigue(awayStats);

  if (awayFatigue > 0.6) {
    notes.push('Away team may be fatigued — watch for rotation');
  }
  if (homeFatigue > 0.6) {
    notes.push('Home team may be fatigued — watch for rotation');
  }

  // ── Travel Factor ────────────────────────────────────────────────
  const travelFactor = isDerby ? 0.1 : 0.4;

  // ── Data Quality Assessment ──────────────────────────────────────
  const dataQuality = assessDataQuality(homeStats, awayStats);
  if (dataQuality < 0.5) {
    notes.push('Low data quality — predictions less reliable');
  }

  const sampleSizeWarning =
    (homeStats?.matchesPlayed ?? 0) < 5 || (awayStats?.matchesPlayed ?? 0) < 5;
  if (sampleSizeWarning) {
    notes.push('Small sample size — proceed with caution');
  }

  // ── Contextual Flags ─────────────────────────────────────────────
  if (isDerby) {
    notes.push('Derby match — form is less reliable, emotions run high');
  }
  if (isNeutralGround) {
    notes.push('Neutral ground — home advantage significantly reduced');
  }

  if (homeMotivation === 'dead-rubber' && awayMotivation === 'dead-rubber') {
    notes.push('Both teams have nothing to play for — unpredictable');
  }
  if (homeMotivation === 'must-win') {
    notes.push('Home team in must-win situation — expect maximum effort');
  }
  if (awayMotivation === 'must-win') {
    notes.push('Away team in must-win situation — expect maximum effort');
  }

  return {
    isDerby,
    isNeutralGround,
    homeMotivation,
    awayMotivation,
    motivationGap,
    homeFatigue,
    awayFatigue,
    travelFactor,
    dataQuality,
    sampleSizeWarning,
    notes,
  };
}

/**
 * Assess team motivation based on league position and context.
 */
function assessMotivation(stats: TeamStats | null, _leagueId: number): MotivationLevel {
  if (!stats || stats.matchesPlayed < 5) return 'medium';

  const { leaguePosition, matchesPlayed, points } = stats;

  if (matchesPlayed < 10) return 'high';
  if (matchesPlayed < 5) return 'medium';

  // Bottom 3 — relegation battle
  if (leaguePosition >= 18 && leaguePosition <= 20) return 'must-win';
  // Just above relegation
  if (leaguePosition >= 16) return 'high';
  // Top 3 — title race
  if (leaguePosition <= 3) return 'high';
  // European spots
  if (leaguePosition <= 6) return 'high';

  const ppg = points / matchesPlayed;
  if (ppg < 0.8 && matchesPlayed > 15) return 'low';

  // Mid-table comfort zone
  if (leaguePosition >= 7 && leaguePosition <= 14) {
    if (matchesPlayed > 30 && ppg < 1.2 && ppg > 0.8) return 'dead-rubber';
    return 'medium';
  }

  return 'medium';
}

function motivationToScore(level: MotivationLevel): number {
  switch (level) {
    case 'must-win': return 1.0;
    case 'high': return 0.8;
    case 'medium': return 0.5;
    case 'low': return 0.3;
    case 'dead-rubber': return 0.1;
  }
}

function estimateFatigue(stats: TeamStats | null): number {
  if (!stats) return 0.3;

  const { matchesPlayed, draws, losses } = stats;

  let fatigue = 0;
  if (matchesPlayed > 35) fatigue = 0.7;
  else if (matchesPlayed > 25) fatigue = 0.5;
  else if (matchesPlayed > 15) fatigue = 0.3;
  else fatigue = 0.15;

  const drawRate = matchesPlayed > 0 ? draws / matchesPlayed : 0;
  if (drawRate > 0.35) fatigue *= 0.9;

  const lossRate = matchesPlayed > 0 ? losses / matchesPlayed : 0;
  if (lossRate > 0.5) fatigue *= 0.85;

  return Math.min(1, fatigue);
}

function assessDataQuality(
  homeStats: TeamStats | null,
  awayStats: TeamStats | null
): number {
  let quality = 0;

  if (!homeStats && !awayStats) return 0.05;
  if (!homeStats || !awayStats) quality = 0.3;
  else quality = 0.5;

  const homeMatches = homeStats?.matchesPlayed ?? 0;
  const awayMatches = awayStats?.matchesPlayed ?? 0;
  const minMatches = Math.min(homeMatches, awayMatches);

  if (minMatches >= 20) quality += 0.3;
  else if (minMatches >= 10) quality += 0.2;
  else if (minMatches >= 5) quality += 0.1;

  const hasHomeXg = (homeStats?.xgf ?? 0) > 0;
  const hasAwayXg = (awayStats?.xgf ?? 0) > 0;
  if (hasHomeXg && hasAwayXg) quality += 0.15;
  else if (hasHomeXg || hasAwayXg) quality += 0.05;

  const hasHomeForm = (homeStats?.form?.length ?? 0) >= 3;
  const hasAwayForm = (awayStats?.form?.length ?? 0) >= 3;
  if (hasHomeForm && hasAwayForm) quality += 0.05;

  return Math.min(1, quality);
}

/**
 * Apply situational adjustments to probabilities.
 *
 * This is where the punter's gut meets the math.
 * We DON'T change the base prediction — we ADD situational context.
 */
export function applySituationalAdjustments(
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  situation: SituationalFactors
): { homeWinProb: number; drawProb: number; awayWinProb: number } {
  let h = homeWinProb;
  let d = drawProb;
  let a = awayWinProb;

  // Derby Effect — reduce favorite's edge, boost draw
  if (situation.isDerby) {
    const pull = 0.08;
    h = h > a ? h - pull : h + pull * 0.5;
    a = a > h ? a - pull : a + pull * 0.5;
    d += pull * 0.3;
  }

  // Neutral Ground — remove home advantage
  if (situation.isNeutralGround) {
    const homeEdge = h - a;
    h -= homeEdge * 0.5;
    a += homeEdge * 0.5;
  }

  // Motivation Gap
  if (Math.abs(situation.motivationGap) > 0.3) {
    const boost = situation.motivationGap * 0.05;
    h += boost;
    a -= boost;
  }

  // Dead Rubber — pull toward 33/33/33
  if (situation.homeMotivation === 'dead-rubber' && situation.awayMotivation === 'dead-rubber') {
    h = h * 0.85 + 0.33 * 0.15;
    d = d * 0.85 + 0.33 * 0.15;
    a = a * 0.85 + 0.33 * 0.15;
  }

  // Must-Win — team pushes harder for win
  if (situation.homeMotivation === 'must-win') {
    h += 0.04;
    d -= 0.02;
    a -= 0.02;
  }
  if (situation.awayMotivation === 'must-win') {
    a += 0.04;
    d -= 0.02;
    h -= 0.02;
  }

  h = Math.max(0.02, h);
  d = Math.max(0.05, d);
  a = Math.max(0.02, a);

  const total = h + d + a;
  return {
    homeWinProb: h / total,
    drawProb: d / total,
    awayWinProb: a / total,
  };
}
