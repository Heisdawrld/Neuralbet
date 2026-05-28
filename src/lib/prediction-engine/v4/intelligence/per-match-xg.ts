// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Per-Match xG Intelligence
//
// Uses ACTUAL per-match xG from event_stats (last N matches) instead
// of season-level averages. This is the single biggest intelligence
// upgrade — it captures current form at the match level, not just
// season aggregates.
//
// What it gives us:
// - Home team's actual xG produced in recent home matches
// - Away team's actual xG produced in recent away matches
// - xG trend (rising/declining/stable)
// - Per-match xG variance (consistency measure)
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from '@/lib/db/turso-client';

export interface PerMatchXgProfile {
  teamId: number;
  teamName: string;
  // xG produced (attacking)
  avgXgProduced: number;        // Average xG produced per match
  avgXgProducedHome: number;    // Average xG produced at home
  avgXgProducedAway: number;    // Average xG produced away
  // xG conceded (defensive)
  avgXgConceded: number;        // Average xG conceded per match
  avgXgConcededHome: number;    // Average xG conceded at home
  avgXgConcededAway: number;    // Average xG conceded away
  // Trend
  xgTrend: 'rising' | 'stable' | 'declining';
  xgConsistency: number;        // 0-1, higher = more consistent
  // Sample
  sampleSize: number;
  // Raw values for the last N matches
  recentXg: number[];           // xG produced in last N matches (chronological)
  recentXgConceded: number[];   // xG conceded in last N matches (chronological)
}

export interface PerMatchXgResult {
  home: PerMatchXgProfile;
  away: PerMatchXgProfile;
  /** Combined expected goals for this match (based on per-match data) */
  matchHomeXg: number;
  matchAwayXg: number;
  /** How much this differs from season-level xG */
  homeAdjustment: number;  // positive = per-match says more goals than season avg
  awayAdjustment: number;
  /** Data quality (0-1) */
  reliability: number;
  /** Note for analysis */
  note: string;
}

/**
 * Load per-match xG profiles for both teams.
 * Queries event_stats for the last N finished matches of each team.
 */
export async function loadPerMatchXg(
  homeTeamId: number,
  awayTeamId: number,
  homeTeamName: string,
  awayTeamName: string,
  matches: number = 8,
): Promise<PerMatchXgResult> {
  const db = getTursoClient();

  const [homeProfile, awayProfile] = await Promise.all([
    loadTeamXgProfile(db, homeTeamId, homeTeamName, matches),
    loadTeamXgProfile(db, awayTeamId, awayTeamName, matches),
  ]);

  // Calculate match xG using per-match data
  // Home team's attacking xG (at home) vs Away team's defensive xG conceded (away)
  const matchHomeXg = homeProfile.avgXgProducedHome > 0
    ? (homeProfile.avgXgProducedHome + awayProfile.avgXgConcededAway) / 2
    : homeProfile.avgXgProduced;

  const matchAwayXg = awayProfile.avgXgProducedAway > 0
    ? (awayProfile.avgXgProducedAway + homeProfile.avgXgConcededHome) / 2
    : awayProfile.avgXgProduced;

  // Adjustment vs season average (0 means per-match matches season)
  const homeAdjustment = matchHomeXg - homeProfile.avgXgProduced;
  const awayAdjustment = matchAwayXg - awayProfile.avgXgProduced;

  // Reliability based on sample size
  const minSample = Math.min(homeProfile.sampleSize, awayProfile.sampleSize);
  const reliability = Math.min(1, minSample / 6); // Full reliability at 6+ matches

  // Generate note
  const homeTrend = homeProfile.xgTrend === 'rising' ? 'xG rising' : homeProfile.xgTrend === 'declining' ? 'xG declining' : 'xG stable';
  const awayTrend = awayProfile.xgTrend === 'rising' ? 'xG rising' : awayProfile.xgTrend === 'declining' ? 'xG declining' : 'xG stable';
  const note = `${homeTeamName}: ${homeTrend} (${homeProfile.avgXgProduced.toFixed(2)} xG/match, ${homeProfile.sampleSize} samples) | ${awayTeamName}: ${awayTrend} (${awayProfile.avgXgProduced.toFixed(2)} xG/match, ${awayProfile.sampleSize} samples)`;

  return {
    home: homeProfile,
    away: awayProfile,
    matchHomeXg: Math.max(0.3, Math.round(matchHomeXg * 100) / 100),
    matchAwayXg: Math.max(0.2, Math.round(matchAwayXg * 100) / 100),
    homeAdjustment: Math.round(homeAdjustment * 100) / 100,
    awayAdjustment: Math.round(awayAdjustment * 100) / 100,
    reliability,
    note,
  };
}

async function loadTeamXgProfile(
  db: any,
  teamId: number,
  teamName: string,
  limit: number,
): Promise<PerMatchXgProfile> {
  // Get recent finished matches for this team (home or away)
  const matchesResult = await db.execute({
    sql: `SELECT e.id, e.home_team_id, e.event_date,
                 s.home_xg, s.away_xg
          FROM events e
          JOIN event_stats s ON e.id = s.event_id
          WHERE e.status = 'finished'
            AND (e.home_team_id = ? OR e.away_team_id = ?)
            AND s.home_xg > 0 AND s.away_xg > 0
          ORDER BY e.event_date DESC
          LIMIT ?`,
    args: [teamId, teamId, limit],
  });

  const rows = matchesResult.rows;

  if (rows.length === 0) {
    return emptyProfile(teamId, teamName);
  }

  const xgProduced: number[] = [];
  const xgConceded: number[] = [];
  const xgProducedHome: number[] = [];
  const xgProducedAway: number[] = [];
  const xgConcededHome: number[] = [];
  const xgConcededAway: number[] = [];

  for (const r of rows) {
    const isHome = Number(r.home_team_id) === teamId;
    const xg = isHome ? Number(r.home_xg) : Number(r.away_xg);
    const xgConcededVal = isHome ? Number(r.away_xg) : Number(r.home_xg);

    xgProduced.push(xg);
    xgConceded.push(xgConcededVal);

    if (isHome) {
      xgProducedHome.push(xg);
      xgConcededHome.push(xgConcededVal);
    } else {
      xgProducedAway.push(xg);
      xgConcededAway.push(xgConcededVal);
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const variance = (arr: number[], mean: number) => arr.length > 1
    ? arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (arr.length - 1)
    : 0;

  const avgXgProduced = avg(xgProduced);
  const avgXgConceded = avg(xgConceded);

  // Trend: compare first half vs second half of recent matches
  const mid = Math.floor(xgProduced.length / 2);
  const recentHalf = xgProduced.slice(0, mid);
  const olderHalf = xgProduced.slice(mid);
  const recentAvg = avg(recentHalf);
  const olderAvg = avg(olderHalf);

  let xgTrend: 'rising' | 'stable' | 'declining' = 'stable';
  if (recentAvg > olderAvg * 1.15) xgTrend = 'rising';
  else if (recentAvg < olderAvg * 0.85) xgTrend = 'declining';

  // Consistency: low variance = high consistency
  const xgVariance = variance(xgProduced, avgXgProduced);
  const xgConsistency = Math.max(0, Math.min(1, 1 - (Math.sqrt(xgVariance) / Math.max(0.01, avgXgProduced))));

  return {
    teamId,
    teamName,
    avgXgProduced: Math.round(avgXgProduced * 100) / 100,
    avgXgProducedHome: Math.round(avg(xgProducedHome) * 100) / 100,
    avgXgProducedAway: Math.round(avg(xgProducedAway) * 100) / 100,
    avgXgConceded: Math.round(avgXgConceded * 100) / 100,
    avgXgConcededHome: Math.round(avg(xgConcededHome) * 100) / 100,
    avgXgConcededAway: Math.round(avg(xgConcededAway) * 100) / 100,
    xgTrend,
    xgConsistency: Math.round(xgConsistency * 100) / 100,
    sampleSize: rows.length,
    recentXg: xgProduced,
    recentXgConceded: xgConceded,
  };
}

function emptyProfile(teamId: number, teamName: string): PerMatchXgProfile {
  return {
    teamId,
    teamName,
    avgXgProduced: 0,
    avgXgProducedHome: 0,
    avgXgProducedAway: 0,
    avgXgConceded: 0,
    avgXgConcededHome: 0,
    avgXgConcededAway: 0,
    xgTrend: 'stable',
    xgConsistency: 0,
    sampleSize: 0,
    recentXg: [],
    recentXgConceded: [],
  };
}

/**
 * Apply per-match xG adjustments to the engine's combined xG estimate.
 * Returns adjusted home/away xG values.
 */
export function applyPerMatchXgAdjustment(
  combinedHomeXg: number,
  combinedAwayXg: number,
  perMatchData: PerMatchXgResult,
): { adjustedHomeXg: number; adjustedAwayXg: number; note: string } {
  // Blend: weight per-match data by its reliability
  const weight = perMatchData.reliability * 0.5; // Max 50% weight for per-match data
  const baseWeight = 1 - weight;

  const adjustedHomeXg = combinedHomeXg * baseWeight + perMatchData.matchHomeXg * weight;
  const adjustedAwayXg = combinedAwayXg * baseWeight + perMatchData.matchAwayXg * weight;

  // If trend is strong, apply an extra nudge
  let homeTrendNudge = 0;
  let awayTrendNudge = 0;
  if (perMatchData.home.xgTrend === 'rising') homeTrendNudge = 0.08;
  if (perMatchData.home.xgTrend === 'declining') homeTrendNudge = -0.06;
  if (perMatchData.away.xgTrend === 'rising') awayTrendNudge = 0.08;
  if (perMatchData.away.xgTrend === 'declining') awayTrendNudge = -0.06;

  const finalHomeXg = Math.max(0.3, adjustedHomeXg + homeTrendNudge);
  const finalAwayXg = Math.max(0.2, adjustedAwayXg + awayTrendNudge);

  const note = perMatchData.reliability > 0.3
    ? `Per-match xG (${Math.round(perMatchData.reliability * 100)}% reliability): Home ${perMatchData.home.avgXgProduced.toFixed(2)} (${perMatchData.home.xgTrend}) vs Away ${perMatchData.away.avgXgProduced.toFixed(2)} (${perMatchData.away.xgTrend})`
    : 'Limited per-match xG data — using season averages';

  return {
    adjustedHomeXg: Math.round(finalHomeXg * 100) / 100,
    adjustedAwayXg: Math.round(finalAwayXg * 100) / 100,
    note,
  };
}
