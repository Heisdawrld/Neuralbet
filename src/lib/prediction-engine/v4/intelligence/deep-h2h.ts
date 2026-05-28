// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Deep H2H Intelligence
//
// Standard H2H just counts wins/draws/losses. But a real punter
// goes deeper:
// - Recent meetings matter more than old ones (recency weighting)
// - Home team at HOME vs this opponent (venue-specific H2H)
// - Goal patterns in H2H (always high-scoring? always tight?)
// - Manager vs manager H2H (if both managers have history)
//
// What this gives us:
// - Recency-weighted H2H probabilities
// - Venue-specific H2H (home team's record AT HOME vs this opponent)
// - H2H goal patterns (average, variance, O2.5/BTTS rates)
// - H2H trend (getting higher-scoring? more one-sided?)
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from '@/lib/db/turso-client';

export interface DeepH2HResult {
  // Standard stats
  totalMeetings: number;
  homeTeamWins: number;  // Wins for "our" home team
  draws: number;
  awayTeamWins: number;  // Wins for "our" away team
  // Recency-weighted
  recencyHomeWinRate: number;
  recencyDrawRate: number;
  recencyAwayWinRate: number;
  // Venue-specific
  venueHomeWins: number;
  venueDraws: number;
  venueAwayWins: number;
  venueTotal: number;
  venueAvgGoals: number;
  // Goal patterns
  avgGoals: number;
  over25Rate: number;
  bttsRate: number;
  goalVariance: number;     // Low = consistently same score range
  // Trend
  goalTrend: 'rising' | 'stable' | 'declining';  // Are recent meetings higher/lower scoring?
  dominance: 'home-dominant' | 'away-dominant' | 'balanced';
  // Adjustments for engine
  homeWinAdjustment: number;   // Adjustment to apply to home win probability
  drawAdjustment: number;      // Adjustment to draw probability
  awayWinAdjustment: number;   // Adjustment to away win probability
  goalExpectationAdjustment: number;  // Adjustment to total goals expectation
  reliability: number;         // 0-1, how reliable this H2H data is
  note: string;
}

/**
 * Compute deep H2H analysis between two teams.
 */
export async function computeDeepH2H(
  homeTeamId: number,
  awayTeamId: number,
  homeTeamName: string,
  awayTeamName: string,
): Promise<DeepH2HResult> {
  const db = getTursoClient();

  // Get ALL H2H meetings (up to 20 for deeper analysis)
  const h2hResult = await db.execute({
    sql: `SELECT home_team_id, away_team_id, home_score, away_score, event_date, status
          FROM events
          WHERE status = 'finished'
            AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
            AND home_score IS NOT NULL AND away_score IS NOT NULL
          ORDER BY event_date DESC
          LIMIT 20`,
    args: [homeTeamId, awayTeamId, awayTeamId, homeTeamId],
  });

  const rows = h2hResult.rows;
  const totalMeetings = rows.length;

  if (totalMeetings === 0) {
    return emptyH2H(homeTeamName, awayTeamName);
  }

  // Basic counts
  let homeTeamWins = 0, draws = 0, awayTeamWins = 0;
  let totalGoals = 0;
  let over25 = 0, bttsYes = 0;
  const goalTotals: number[] = [];

  // Venue-specific (home team playing at home)
  let venueHomeWins = 0, venueDraws = 0, venueAwayWins = 0;
  let venueGoals = 0, venueCount = 0;

  // For recency weighting
  const recencyWeights: { homeWin: number; draw: number; awayWin: number; goals: number; weight: number }[] = [];

  const now = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const hs = Number(r.home_score);
    const as = Number(r.away_score);
    const isHomeTeam = Number(r.home_team_id) === homeTeamId;
    const matchGoals = hs + as;

    // Determine result from "our" home team's perspective
    if (hs > as) {
      if (isHomeTeam) homeTeamWins++;
      else awayTeamWins++;
    } else if (hs < as) {
      if (isHomeTeam) awayTeamWins++;
      else homeTeamWins++;
    } else {
      draws++;
    }

    totalGoals += matchGoals;
    goalTotals.push(matchGoals);
    if (matchGoals > 2) over25++;
    if (hs > 0 && as > 0) bttsYes++;

    // Venue-specific: home team playing at home
    if (isHomeTeam) {
      venueCount++;
      venueGoals += matchGoals;
      if (hs > as) venueHomeWins++;
      else if (hs === as) venueDraws++;
      else venueAwayWins++;
    }

    // Recency weight: exponential decay, half-life of 2 years
    const matchDate = new Date(r.event_date as string).getTime();
    const yearsAgo = (now - matchDate) / (365.25 * 24 * 60 * 60 * 1000);
    const weight = Math.exp(-0.35 * yearsAgo); // Half-life ~2 years

    recencyWeights.push({
      homeWin: (hs > as && isHomeTeam) || (hs < as && !isHomeTeam) ? 1 : 0,
      draw: hs === as ? 1 : 0,
      awayWin: (hs < as && isHomeTeam) || (hs > as && !isHomeTeam) ? 1 : 0,
      goals: matchGoals,
      weight,
    });
  }

  // Recency-weighted rates
  const totalWeight = recencyWeights.reduce((s, r) => s + r.weight, 0);
  const recencyHomeWinRate = totalWeight > 0 ? recencyWeights.reduce((s, r) => s + r.homeWin * r.weight, 0) / totalWeight : 0;
  const recencyDrawRate = totalWeight > 0 ? recencyWeights.reduce((s, r) => s + r.draw * r.weight, 0) / totalWeight : 0;
  const recencyAwayWinRate = totalWeight > 0 ? recencyWeights.reduce((s, r) => s + r.awayWin * r.weight, 0) / totalWeight : 0;

  // Goal trend
  const mid = Math.floor(goalTotals.length / 2);
  const recentGoals = goalTotals.slice(0, mid);
  const olderGoals = goalTotals.slice(mid);
  const recentAvg = recentGoals.length > 0 ? recentGoals.reduce((a, b) => a + b, 0) / recentGoals.length : 0;
  const olderAvg = olderGoals.length > 0 ? olderGoals.reduce((a, b) => a + b, 0) / olderGoals.length : 0;
  let goalTrend: 'rising' | 'stable' | 'declining' = 'stable';
  if (recentAvg > olderAvg * 1.2) goalTrend = 'rising';
  else if (recentAvg < olderAvg * 0.8) goalTrend = 'declining';

  // Dominance
  let dominance: 'home-dominant' | 'away-dominant' | 'balanced' = 'balanced';
  if (homeTeamWins > awayTeamWins * 1.5 + 1) dominance = 'home-dominant';
  else if (awayTeamWins > homeTeamWins * 1.5 + 1) dominance = 'away-dominant';

  // Goal variance
  const avgGoals = totalGoals / totalMeetings;
  const goalVariance = totalMeetings > 1
    ? goalTotals.reduce((sum, g) => sum + (g - avgGoals) ** 2, 0) / (totalMeetings - 1)
    : 0;

  // Compute adjustments for engine
  // Pull probabilities toward H2H rates, weighted by reliability
  const reliability = Math.min(1, totalMeetings / 6); // Full reliability at 6+ meetings
  const h2hWeight = reliability * 0.2; // Max 20% weight toward H2H

  const homeWinAdjustment = (recencyHomeWinRate - 0.45) * h2hWeight; // 0.45 = global avg home win rate
  const drawAdjustment = (recencyDrawRate - 0.26) * h2hWeight;
  const awayWinAdjustment = (recencyAwayWinRate - 0.29) * h2hWeight;

  // Goal expectation adjustment
  const globalAvgGoals = 2.65;
  const goalExpectationAdjustment = (avgGoals - globalAvgGoals) * h2hWeight * 0.5;

  const note = totalMeetings > 0
    ? `H2H: ${homeTeamWins}W-${draws}D-${awayTeamWins}L (${totalMeetings} meetings, avg ${avgGoals.toFixed(1)} goals, ${Math.round(over25 / totalMeetings * 100)}% O2.5, ${dominance})${venueCount > 0 ? ` | At home: ${venueHomeWins}W-${venueDraws}D-${venueAwayWins}L` : ''}`
    : 'No H2H data';

  return {
    totalMeetings,
    homeTeamWins,
    draws,
    awayTeamWins,
    recencyHomeWinRate: Math.round(recencyHomeWinRate * 1000) / 1000,
    recencyDrawRate: Math.round(recencyDrawRate * 1000) / 1000,
    recencyAwayWinRate: Math.round(recencyAwayWinRate * 1000) / 1000,
    venueHomeWins,
    venueDraws,
    venueAwayWins,
    venueTotal: venueCount,
    venueAvgGoals: venueCount > 0 ? Math.round(venueGoals / venueCount * 100) / 100 : 0,
    avgGoals: Math.round(avgGoals * 100) / 100,
    over25Rate: totalMeetings > 0 ? Math.round(over25 / totalMeetings * 1000) / 1000 : 0,
    bttsRate: totalMeetings > 0 ? Math.round(bttsYes / totalMeetings * 1000) / 1000 : 0,
    goalVariance: Math.round(goalVariance * 100) / 100,
    goalTrend,
    dominance,
    homeWinAdjustment: Math.round(homeWinAdjustment * 1000) / 1000,
    drawAdjustment: Math.round(drawAdjustment * 1000) / 1000,
    awayWinAdjustment: Math.round(awayWinAdjustment * 1000) / 1000,
    goalExpectationAdjustment: Math.round(goalExpectationAdjustment * 100) / 100,
    reliability: Math.round(reliability * 100) / 100,
    note,
  };
}

function emptyH2H(homeTeamName: string, awayTeamName: string): DeepH2HResult {
  return {
    totalMeetings: 0,
    homeTeamWins: 0, draws: 0, awayTeamWins: 0,
    recencyHomeWinRate: 0, recencyDrawRate: 0, recencyAwayWinRate: 0,
    venueHomeWins: 0, venueDraws: 0, venueAwayWins: 0, venueTotal: 0, venueAvgGoals: 0,
    avgGoals: 0, over25Rate: 0, bttsRate: 0, goalVariance: 0,
    goalTrend: 'stable',
    dominance: 'balanced',
    homeWinAdjustment: 0, drawAdjustment: 0, awayWinAdjustment: 0,
    goalExpectationAdjustment: 0,
    reliability: 0,
    note: `No previous meetings between ${homeTeamName} and ${awayTeamName}`,
  };
}

/**
 * Apply deep H2H adjustments to engine probabilities.
 */
export function applyDeepH2HAdjustments(
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  homeExpectedGoals: number,
  awayExpectedGoals: number,
  h2h: DeepH2HResult,
): { adjustedHomeWin: number; adjustedDraw: number; adjustedAwayWin: number; adjustedHomeXg: number; adjustedAwayXg: number } {
  if (h2h.reliability < 0.15) {
    return { adjustedHomeWin: homeWinProb, adjustedDraw: drawProb, adjustedAwayWin: awayWinProb, adjustedHomeXg: homeExpectedGoals, adjustedAwayXg: awayExpectedGoals };
  }

  let adjustedHomeWin = homeWinProb + h2h.homeWinAdjustment;
  let adjustedDraw = drawProb + h2h.drawAdjustment;
  let adjustedAwayWin = awayWinProb + h2h.awayWinAdjustment;

  // Goal expectation adjustment
  const totalGoals = homeExpectedGoals + awayExpectedGoals;
  const adjustedTotal = totalGoals + h2h.goalExpectationAdjustment;
  const goalRatio = adjustedTotal / Math.max(0.01, totalGoals);
  let adjustedHomeXg = homeExpectedGoals * goalRatio;
  let adjustedAwayXg = awayExpectedGoals * goalRatio;

  // Normalize probabilities
  adjustedHomeWin = Math.max(0.02, adjustedHomeWin);
  adjustedDraw = Math.max(0.05, adjustedDraw);
  adjustedAwayWin = Math.max(0.02, adjustedAwayWin);
  const total = adjustedHomeWin + adjustedDraw + adjustedAwayWin;
  adjustedHomeWin /= total;
  adjustedDraw /= total;
  adjustedAwayWin /= total;

  return {
    adjustedHomeWin: Math.round(adjustedHomeWin * 1000) / 1000,
    adjustedDraw: Math.round(adjustedDraw * 1000) / 1000,
    adjustedAwayWin: Math.round(adjustedAwayWin * 1000) / 1000,
    adjustedHomeXg: Math.round(Math.max(0.3, adjustedHomeXg) * 100) / 100,
    adjustedAwayXg: Math.round(Math.max(0.2, adjustedAwayXg) * 100) / 100,
  };
}
