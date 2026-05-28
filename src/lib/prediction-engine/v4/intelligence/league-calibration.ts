// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — League-Specific Calibration
//
// Different leagues have very different characteristics:
// - Eredivisie: 3.2 goals/match, high O2.5
// - Serie A: 2.5 goals/match, low O2.5
// - Premier League: moderate, high BTTS
// - Liga MX: wild, unpredictable
//
// Using hardcoded averages (like 0.26 draw rate) is lazy.
// This module computes ACTUAL league stats from the standings data
// and uses them to calibrate the engine's predictions.
//
// What this gives us:
// - Real home win rate, draw rate, away win rate per league
// - Real O2.5 and BTTS rates per league
// - League competitiveness score (affects how much to trust position-based data)
// - Per-league goal expectation calibration
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from '@/lib/db/turso-client';

export interface LeagueCalibrationData {
  leagueId: number;
  leagueName: string;
  // Goal expectations
  avgGoalsPerMatch: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  // Outcome rates (from actual finished matches)
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  // Market rates
  over25Rate: number;
  over15Rate: number;
  over35Rate: number;
  bttsRate: number;
  // League characteristics
  competitiveness: 'high' | 'medium' | 'low';
  homeAdvantage: number;     // 0-1, how strong home advantage is
  volatilityScore: number;   // 0-1, how unpredictable the league is
  // Sample
  matchesSampled: number;
  teamsSampled: number;
  // Calibration adjustments to apply to engine
  drawRateAdjustment: number;  // How much to adjust draw probability
  goalExpectationMultiplier: number;  // Multiply engine's goal expectation
  homeAdvantageMultiplier: number;  // Multiply home advantage effect
}

// Cache league calibration data
const leagueCalibrationCache = new Map<number, LeagueCalibrationData>();

/**
 * Get league calibration data. Uses cache if available.
 */
export async function getLeagueCalibration(
  leagueId: number,
  leagueName: string,
): Promise<LeagueCalibrationData> {
  if (leagueCalibrationCache.has(leagueId)) {
    return leagueCalibrationCache.get(leagueId)!;
  }

  const db = getTursoClient();
  const calibration = await computeLeagueCalibration(db, leagueId, leagueName);
  leagueCalibrationCache.set(leagueId, calibration);
  return calibration;
}

async function computeLeagueCalibration(
  db: any,
  leagueId: number,
  leagueName: string,
): Promise<LeagueCalibrationData> {
  // Get finished matches in this league to compute actual rates
  const matchesResult = await db.execute({
    sql: `SELECT home_score, away_score, home_team_id, away_team_id
          FROM events
          WHERE league_id = ? AND status = 'finished'
            AND home_score IS NOT NULL AND away_score IS NOT NULL
          ORDER BY event_date DESC LIMIT 300`,
    args: [leagueId],
  });

  const matches = matchesResult.rows;
  const matchCount = matches.length;

  // Default values (global averages)
  let homeWinRate = 0.45;
  let drawRate = 0.26;
  let awayWinRate = 0.29;
  let avgHomeGoals = 1.5;
  let avgAwayGoals = 1.15;
  let over15Rate = 0.70;
  let over25Rate = 0.50;
  let over35Rate = 0.25;
  let bttsRate = 0.48;
  let homeAdvantage = 0.15;
  let volatilityScore = 0.5;

  if (matchCount >= 10) {
    let homeWins = 0, draws = 0, awayWins = 0;
    let totalHomeGoals = 0, totalAwayGoals = 0;
    let over15 = 0, over25 = 0, over35 = 0, bttsYes = 0;
    const homeTeamWins = new Map<number, number>();
    const homeTeamMatches = new Map<number, number>();

    for (const m of matches) {
      const hg = Number(m.home_score);
      const ag = Number(m.away_score);
      const htId = Number(m.home_team_id);

      if (hg > ag) homeWins++;
      else if (hg === ag) draws++;
      else awayWins++;

      totalHomeGoals += hg;
      totalAwayGoals += ag;

      if (hg + ag > 1) over15++;
      if (hg + ag > 2) over25++;
      if (hg + ag > 3) over35++;
      if (hg > 0 && ag > 0) bttsYes++;

      // Track per-team home performance for home advantage calc
      homeTeamMatches.set(htId, (homeTeamMatches.get(htId) || 0) + 1);
      if (hg > ag) homeTeamWins.set(htId, (homeTeamWins.get(htId) || 0) + 1);
    }

    homeWinRate = homeWins / matchCount;
    drawRate = draws / matchCount;
    awayWinRate = awayWins / matchCount;
    avgHomeGoals = totalHomeGoals / matchCount;
    avgAwayGoals = totalAwayGoals / matchCount;
    over15Rate = over15 / matchCount;
    over25Rate = over25 / matchCount;
    over35Rate = over35 / matchCount;
    bttsRate = bttsYes / matchCount;

    // Home advantage: how much better teams do at home vs league average
    const avgHomeWinPct = Array.from(homeTeamWins.entries())
      .filter(([_, w]) => true)
      .reduce((sum, [id, w]) => sum + w / Math.max(1, homeTeamMatches.get(id) || 1), 0)
      / Math.max(1, homeTeamWins.size);
    homeAdvantage = Math.max(0, avgHomeWinPct - awayWinRate);

    // Volatility: high draw rate + high variance in goals = volatile
    const avgGoals = avgHomeGoals + avgAwayGoals;
    const goalVariance = matches.reduce((sum, m) => {
      const total = Number(m.home_score) + Number(m.away_score);
      return sum + (total - avgGoals) ** 2;
    }, 0) / matchCount;
    volatilityScore = Math.min(1, (drawRate * 2 + Math.sqrt(goalVariance) / 3) / 2);
  }

  // Competitiveness: how close are the top teams to the bottom teams?
  let competitiveness: 'high' | 'medium' | 'low' = 'medium';
  const standingsResult = await db.execute({
    sql: `SELECT pts FROM standings WHERE league_id = ? ORDER BY position ASC`,
    args: [leagueId],
  });
  if (standingsResult.rows.length >= 6) {
    const top3Avg = standingsResult.rows.slice(0, 3).reduce((s: number, r: any) => s + Number(r.pts), 0) / 3;
    const bottom3Avg = standingsResult.rows.slice(-3).reduce((s: number, r: any) => s + Number(r.pts), 0) / 3;
    const gap = top3Avg - bottom3Avg;
    if (gap < 15) competitiveness = 'high';
    else if (gap > 30) competitiveness = 'low';
  }

  // Calibration adjustments
  // Draw rate: adjust engine's draw probability toward league's actual rate
  const drawRateAdjustment = drawRate - 0.26; // How much to add to the default 0.26

  // Goal expectation: if league is high-scoring, multiply up; if low, multiply down
  const globalAvgGoals = 2.65; // ~2.65 goals per match globally
  const goalExpectationMultiplier = (avgHomeGoals + avgAwayGoals) / globalAvgGoals;

  // Home advantage multiplier
  const globalHomeAdvantage = 0.15;
  const homeAdvantageMultiplier = homeAdvantage / globalHomeAdvantage;

  return {
    leagueId,
    leagueName,
    avgGoalsPerMatch: Math.round((avgHomeGoals + avgAwayGoals) * 100) / 100,
    avgHomeGoals: Math.round(avgHomeGoals * 100) / 100,
    avgAwayGoals: Math.round(avgAwayGoals * 100) / 100,
    homeWinRate: Math.round(homeWinRate * 1000) / 1000,
    drawRate: Math.round(drawRate * 1000) / 1000,
    awayWinRate: Math.round(awayWinRate * 1000) / 1000,
    over25Rate: Math.round(over25Rate * 1000) / 1000,
    over15Rate: Math.round(over15Rate * 1000) / 1000,
    over35Rate: Math.round(over35Rate * 1000) / 1000,
    bttsRate: Math.round(bttsRate * 1000) / 1000,
    competitiveness,
    homeAdvantage: Math.round(homeAdvantage * 1000) / 1000,
    volatilityScore: Math.round(volatilityScore * 100) / 100,
    matchesSampled: matchCount,
    teamsSampled: standingsResult.rows.length,
    drawRateAdjustment: Math.round(drawRateAdjustment * 1000) / 1000,
    goalExpectationMultiplier: Math.round(goalExpectationMultiplier * 100) / 100,
    homeAdvantageMultiplier: Math.round(homeAdvantageMultiplier * 100) / 100,
  };
}

/**
 * Apply league calibration to the engine's probability estimates.
 */
export function applyLeagueCalibration(
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  homeExpectedGoals: number,
  awayExpectedGoals: number,
  calibration: LeagueCalibrationData,
): { adjustedHomeWin: number; adjustedDraw: number; adjustedAwayWin: number; adjustedHomeXg: number; adjustedAwayXg: number; note: string } {
  // Only apply if we have enough match data
  if (calibration.matchesSampled < 10) {
    return {
      adjustedHomeWin: homeWinProb,
      adjustedDraw: drawProb,
      adjustedAwayWin: awayWinProb,
      adjustedHomeXg: homeExpectedGoals,
      adjustedAwayXg: awayExpectedGoals,
      note: 'Insufficient league data for calibration',
    };
  }

  // 1. Adjust draw probability toward league's actual draw rate
  const drawAdjustment = calibration.drawRateAdjustment * 0.3; // 30% weight toward actual
  let adjustedDraw = drawProb + drawAdjustment;

  // 2. Adjust goal expectations
  const goalMultiplier = 0.7 + calibration.goalExpectationMultiplier * 0.3; // 30% weight toward actual
  let adjustedHomeXg = homeExpectedGoals * goalMultiplier;
  let adjustedAwayXg = awayExpectedGoals * goalMultiplier;

  // 3. Adjust home advantage
  const homeAdvAdj = (calibration.homeAdvantageMultiplier - 1) * 0.2; // 20% weight
  const homeWinShift = homeAdvAdj * 0.05;
  let adjustedHomeWin = homeWinProb + homeWinShift;
  let adjustedAwayWin = awayWinProb - homeWinShift;

  // 4. Volatility adjustment: more volatile = pull toward draw, reduce extremes
  if (calibration.volatilityScore > 0.6) {
    const pullFactor = (calibration.volatilityScore - 0.6) * 0.3;
    const maxProb = Math.max(adjustedHomeWin, adjustedAwayWin);
    const pull = (maxProb - adjustedDraw) * pullFactor;
    adjustedHomeWin -= pull * (adjustedHomeWin === maxProb ? 1 : 0);
    adjustedAwayWin -= pull * (adjustedAwayWin === maxProb ? 1 : 0);
    adjustedDraw += pull * 0.5;
  }

  // Normalize
  const total = adjustedHomeWin + adjustedDraw + adjustedAwayWin;
  adjustedHomeWin = Math.max(0.02, adjustedHomeWin / total);
  adjustedDraw = Math.max(0.05, adjustedDraw / total);
  adjustedAwayWin = Math.max(0.02, adjustedAwayWin / total);
  const total2 = adjustedHomeWin + adjustedDraw + adjustedAwayWin;
  adjustedHomeWin /= total2;
  adjustedDraw /= total2;
  adjustedAwayWin /= total2;

  const note = `League: ${calibration.leagueName} (${calibration.avgGoalsPerMatch} g/m, HW${Math.round(calibration.homeWinRate * 100)}%, D${Math.round(calibration.drawRate * 100)}%, AW${Math.round(calibration.awayWinRate * 100)}%, O2.5 ${Math.round(calibration.over25Rate * 100)}%, ${calibration.competitiveness} comp)`;

  return {
    adjustedHomeWin: Math.round(adjustedHomeWin * 1000) / 1000,
    adjustedDraw: Math.round(adjustedDraw * 1000) / 1000,
    adjustedAwayWin: Math.round(adjustedAwayWin * 1000) / 1000,
    adjustedHomeXg: Math.round(Math.max(0.3, adjustedHomeXg) * 100) / 100,
    adjustedAwayXg: Math.round(Math.max(0.2, adjustedAwayXg) * 100) / 100,
    note,
  };
}
