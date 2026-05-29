// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Feature Builder
//
// Reads from Turso DB and constructs a FeatureVector for the V5 engine.
// This is the data preparation step before the engine runs.
//
// It computes:
// - Weighted averages for goals scored/conceded (recent matches weighted more)
// - Venue-specific splits (home team at home, away team away)
// - H2H features (avg goals, O2.5 rate, BTTS rate, win rates)
// - Implied odds probabilities from bookmaker odds
// - Lineup certainty score
// - Data completeness score
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient, safeExecute } from '@/lib/db/turso-client';
import { impliedProbability } from '../utils';
import type { FeatureVector } from './types';

/**
 * Build a complete FeatureVector for a fixture by reading from Turso DB.
 */
export async function buildFeatureVector(fixtureId: number): Promise<FeatureVector> {
  const db = getTursoClient();

  // ── 1. Load event ───────────────────────────────────────────────────
  const eventResult = await safeExecute(
    `SELECT e.*, l.name as league_name
     FROM events e
     LEFT JOIN leagues l ON e.league_id = l.id
     WHERE e.id = ?`,
    [fixtureId]
  );

  if (!eventResult.rows || eventResult.rows.length === 0) {
    throw new Error(`Event ${fixtureId} not found`);
  }

  const event = eventResult.rows[0];
  const homeTeamId = Number(event.home_team_id);
  const awayTeamId = Number(event.away_team_id);
  const leagueId = Number(event.league_id);
  const leagueName = (event.league_name as string) || `League ${leagueId}`;

  // ── 2. Load home form from historical_matches ───────────────────────
  const homeFormResult = await safeExecute(
    `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = 'home_form' ORDER BY date DESC LIMIT 10`,
    [fixtureId]
  );
  const homeFormMatches = homeFormResult.rows || [];

  // ── 3. Load away form from historical_matches ───────────────────────
  const awayFormResult = await safeExecute(
    `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = 'away_form' ORDER BY date DESC LIMIT 10`,
    [fixtureId]
  );
  const awayFormMatches = awayFormResult.rows || [];

  // ── 4. Load H2H from historical_matches ─────────────────────────────
  const h2hResult = await safeExecute(
    `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = 'h2h' ORDER BY date DESC LIMIT 10`,
    [fixtureId]
  );
  const h2hMatches = h2hResult.rows || [];

  // If no historical_matches data, fall back to events table
  let h2hFromEvents: any[] = [];
  if (h2hMatches.length === 0) {
    const h2hEventsResult = await safeExecute(
      `SELECT home_team_id, away_team_id, home_team, away_team, home_score, away_score, event_date
       FROM events WHERE status = 'finished'
       AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
       AND home_score IS NOT NULL AND away_score IS NOT NULL
       ORDER BY event_date DESC LIMIT 10`,
      [homeTeamId, awayTeamId, awayTeamId, homeTeamId]
    );
    h2hFromEvents = h2hEventsResult.rows || [];
  }

  // Similarly for form, fall back to recent events if no historical_matches
  let homeFormFromEvents: any[] = [];
  let awayFormFromEvents: any[] = [];
  if (homeFormMatches.length === 0) {
    const homeFormEventsResult = await safeExecute(
      `SELECT home_team_id, away_team_id, home_team, away_team, home_score, away_score, event_date
       FROM events WHERE status = 'finished'
       AND (home_team_id = ? OR away_team_id = ?)
       AND home_score IS NOT NULL AND away_score IS NOT NULL
       ORDER BY event_date DESC LIMIT 10`,
      [homeTeamId, homeTeamId]
    );
    homeFormFromEvents = homeFormEventsResult.rows || [];
  }
  if (awayFormMatches.length === 0) {
    const awayFormEventsResult = await safeExecute(
      `SELECT home_team_id, away_team_id, home_team, away_team, home_score, away_score, event_date
       FROM events WHERE status = 'finished'
       AND (home_team_id = ? OR away_team_id = ?)
       AND home_score IS NOT NULL AND away_score IS NOT NULL
       ORDER BY event_date DESC LIMIT 10`,
      [awayTeamId, awayTeamId]
    );
    awayFormFromEvents = awayFormEventsResult.rows || [];
  }

  // ── 5. Load standings ───────────────────────────────────────────────
  const standingsResult = await safeExecute(
    `SELECT * FROM standings WHERE league_id = ? ORDER BY position ASC`,
    [leagueId]
  );
  const standings = standingsResult.rows || [];

  const homeStanding = standings.find((r: any) => Number(r.team_id) === homeTeamId);
  const awayStanding = standings.find((r: any) => Number(r.team_id) === awayTeamId);

  // ── 6. Load odds → compute implied probabilities ────────────────────
  const oddsResult = await safeExecute(
    `SELECT * FROM event_odds WHERE event_id = ?`,
    [fixtureId]
  );
  const oddsRow = oddsResult.rows?.[0] || null;

  const impliedHomeWin = oddsRow?.home_win ? impliedProbability(Number(oddsRow.home_win)) : null;
  const impliedDraw = oddsRow?.draw ? impliedProbability(Number(oddsRow.draw)) : null;
  const impliedAwayWin = oddsRow?.away_win ? impliedProbability(Number(oddsRow.away_win)) : null;
  const impliedOver25 = oddsRow?.over_25_goals ? impliedProbability(Number(oddsRow.over_25_goals)) : null;
  const impliedBttsYes = oddsRow?.btts_yes ? impliedProbability(Number(oddsRow.btts_yes)) : null;

  // ── 7. Load lineups → compute certainty score ───────────────────────
  const lineupResult = await safeExecute(
    `SELECT * FROM event_lineups WHERE event_id = ?`,
    [fixtureId]
  );
  const lineupRow = lineupResult.rows?.[0] || null;

  const lineupStatus = (lineupRow?.lineup_status as string) || 'unavailable';
  let lineupCertaintyScore = 0;
  let homeFormationKnown = false;
  let awayFormationKnown = false;

  if (lineupRow) {
    if (lineupStatus === 'confirmed') {
      lineupCertaintyScore = 1.0;
    } else if (lineupStatus === 'likely') {
      lineupCertaintyScore = 0.7;
    } else if (lineupStatus === 'expected') {
      lineupCertaintyScore = 0.4;
    }
    homeFormationKnown = Boolean(lineupRow.home_formation);
    awayFormationKnown = Boolean(lineupRow.away_formation);
    if (homeFormationKnown) lineupCertaintyScore = Math.max(lineupCertaintyScore, 0.5);
  }

  // ── 8. Load managers ────────────────────────────────────────────────
  const homeCoachId = event.home_coach_id ? Number(event.home_coach_id) : null;
  const awayCoachId = event.away_coach_id ? Number(event.away_coach_id) : null;

  let homeManagerWinPct: number | null = null;
  let homeManagerOver25Pct: number | null = null;
  let awayManagerWinPct: number | null = null;
  let awayManagerOver25Pct: number | null = null;

  // Manager-debut signals: how new is each side's manager at THIS club?
  let homeManagerMatchesAtClub: number | null = null;
  let homeManagerDaysAtClub: number | null = null;
  let awayManagerMatchesAtClub: number | null = null;
  let awayManagerDaysAtClub: number | null = null;

  const homeTeamIdForCareer = Number(event.home_team_id);
  const awayTeamIdForCareer = Number(event.away_team_id);

  if (homeCoachId) {
    const mgrResult = await safeExecute(`SELECT * FROM managers WHERE id = ?`, [homeCoachId]);
    const mgr = mgrResult.rows?.[0];
    if (mgr) {
      homeManagerWinPct = Number(mgr.win_pct || 0);
      homeManagerOver25Pct = Number(mgr.over_25_pct || 0);
    }
    // Look up current-tenure record (date_to IS NULL = still active)
    const tenureResult = await safeExecute(
      `SELECT date_from, matches FROM manager_career
       WHERE manager_id = ? AND team_id = ? AND (date_to IS NULL OR date_to = '')
       ORDER BY date_from DESC LIMIT 1`,
      [homeCoachId, homeTeamIdForCareer],
    );
    const tenure = tenureResult.rows?.[0];
    if (tenure) {
      homeManagerMatchesAtClub = Number(tenure.matches || 0);
      if (tenure.date_from) {
        const start = new Date(tenure.date_from as string);
        const now = new Date(event.event_date as string);
        const diffMs = now.getTime() - start.getTime();
        if (Number.isFinite(diffMs) && diffMs >= 0) {
          homeManagerDaysAtClub = Math.floor(diffMs / 86400000);
        }
      }
    }
  }
  if (awayCoachId) {
    const mgrResult = await safeExecute(`SELECT * FROM managers WHERE id = ?`, [awayCoachId]);
    const mgr = mgrResult.rows?.[0];
    if (mgr) {
      awayManagerWinPct = Number(mgr.win_pct || 0);
      awayManagerOver25Pct = Number(mgr.over_25_pct || 0);
    }
    const tenureResult = await safeExecute(
      `SELECT date_from, matches FROM manager_career
       WHERE manager_id = ? AND team_id = ? AND (date_to IS NULL OR date_to = '')
       ORDER BY date_from DESC LIMIT 1`,
      [awayCoachId, awayTeamIdForCareer],
    );
    const tenure = tenureResult.rows?.[0];
    if (tenure) {
      awayManagerMatchesAtClub = Number(tenure.matches || 0);
      if (tenure.date_from) {
        const start = new Date(tenure.date_from as string);
        const now = new Date(event.event_date as string);
        const diffMs = now.getTime() - start.getTime();
        if (Number.isFinite(diffMs) && diffMs >= 0) {
          awayManagerDaysAtClub = Math.floor(diffMs / 86400000);
        }
      }
    }
  }

  // ── 9. Load referee ─────────────────────────────────────────────────
  const refereeId = event.referee_id ? Number(event.referee_id) : null;
  let refereeAvgGoals: number | null = null;
  let refereeAvgCards: number | null = null;

  if (refereeId) {
    const refResult = await safeExecute(`SELECT * FROM referees WHERE id = ?`, [refereeId]);
    const ref = refResult.rows?.[0];
    if (ref) {
      refereeAvgGoals = Number(ref.avg_goals_per_match || 0);
      refereeAvgCards = Number(ref.avg_yellow_per_match || 0) + Number(ref.avg_red_per_match || 0);
    }
  }

  // ── 10. Compute all feature vector fields ────────────────────────────

  // Weighted form averages (exponential decay — recent matches count more)
  const homeForm = computeFormFeatures(homeFormMatches.length > 0 ? homeFormMatches : homeFormFromEvents, homeTeamId);
  const awayForm = computeFormFeatures(awayFormMatches.length > 0 ? awayFormMatches : awayFormFromEvents, awayTeamId);

  // H2H features
  const h2h = computeH2HFeatures(h2hMatches.length > 0 ? h2hMatches : h2hFromEvents, homeTeamId);

  // Venue splits from form data
  const homeVenue = computeVenueSplits(homeFormMatches.length > 0 ? homeFormMatches : homeFormFromEvents, homeTeamId, 'home');
  const awayVenue = computeVenueSplits(awayFormMatches.length > 0 ? awayFormMatches : awayFormFromEvents, awayTeamId, 'away');

  // ── Data completeness ───────────────────────────────────────────────
  const hasStatsData = homeForm.totalMatches > 0 && awayForm.totalMatches > 0;
  const hasXgData = Boolean(homeStanding?.xgf) && Boolean(awayStanding?.xgf);
  const hasOddsData = impliedHomeWin !== null;
  const hasH2HData = h2h.totalMeetings >= 3;
  const hasStandingsData = standings.length > 0 && Boolean(homeStanding) && Boolean(awayStanding);
  const hasLineupData = lineupCertaintyScore > 0;
  const hasManagerData = homeManagerWinPct !== null || awayManagerWinPct !== null;
  const hasRefereeData = refereeAvgGoals !== null;

  let dataCompleteness = 0;
  if (hasStatsData) dataCompleteness += 0.25;
  if (hasXgData) dataCompleteness += 0.10;
  if (hasOddsData) dataCompleteness += 0.20;
  if (hasH2HData) dataCompleteness += 0.15;
  if (hasStandingsData) dataCompleteness += 0.15;
  if (hasLineupData) dataCompleteness += 0.05;
  if (hasManagerData) dataCompleteness += 0.05;
  if (hasRefereeData) dataCompleteness += 0.05;
  dataCompleteness = Math.min(1, dataCompleteness);

  // ── Build FeatureVector ─────────────────────────────────────────────

  const fv: FeatureVector = {
    fixtureId,
    homeTeamId,
    awayTeamId,
    homeTeam: event.home_team as string,
    awayTeam: event.away_team as string,
    leagueId,
    leagueName,

    // Form features
    homeAvgGoalsScored: homeForm.avgGoalsScored,
    homeAvgGoalsConceded: homeForm.avgGoalsConceded,
    awayAvgGoalsScored: awayForm.avgGoalsScored,
    awayAvgGoalsConceded: awayForm.avgGoalsConceded,

    // Venue splits
    homeHomeGoalsScored: homeVenue.avgGoalsScored,
    homeHomeGoalsConceded: homeVenue.avgGoalsConceded,
    awayAwayGoalsScored: awayVenue.avgGoalsScored,
    awayAwayGoalsConceded: awayVenue.avgGoalsConceded,

    // Form momentum
    homeFormScore: homeForm.formScore,
    awayFormScore: awayForm.formScore,
    homeFormTrend: homeForm.trend,
    awayFormTrend: awayForm.trend,

    // Win/draw/loss rates
    homeWinRate: homeForm.winRate,
    homeDrawRate: homeForm.drawRate,
    homeLossRate: homeForm.lossRate,
    awayWinRate: awayForm.winRate,
    awayDrawRate: awayForm.drawRate,
    awayLossRate: awayForm.lossRate,

    // H2H
    h2hTotalMeetings: h2h.totalMeetings,
    h2hHomeWins: h2h.homeWins,
    h2hDraws: h2h.draws,
    h2hAwayWins: h2h.awayWins,
    h2hAvgGoals: h2h.avgGoals,
    h2hOver25Rate: h2h.over25Rate,
    h2hBttsRate: h2h.bttsRate,

    // Standings
    homePosition: homeStanding ? Number(homeStanding.position || 0) : 0,
    awayPosition: awayStanding ? Number(awayStanding.position || 0) : 0,
    homePoints: homeStanding ? Number(homeStanding.pts || 0) : 0,
    awayPoints: awayStanding ? Number(awayStanding.pts || 0) : 0,
    homeXgd: homeStanding ? Number(homeStanding.xgd || 0) : 0,
    awayXgd: awayStanding ? Number(awayStanding.xgd || 0) : 0,
    homeXgfPerGame: homeStanding && Number(homeStanding.played) > 0
      ? Number(homeStanding.xgf || 0) / Number(homeStanding.played) : 0,
    awayXgfPerGame: awayStanding && Number(awayStanding.played) > 0
      ? Number(awayStanding.xgf || 0) / Number(awayStanding.played) : 0,

    // Implied odds
    impliedHomeWin,
    impliedDraw,
    impliedAwayWin,
    impliedOver25,
    impliedBttsYes,

    // Lineup
    lineupCertaintyScore,
    homeFormationKnown,
    awayFormationKnown,

    // Managers
    homeManagerWinPct,
    homeManagerOver25Pct,
    awayManagerWinPct,
    awayManagerOver25Pct,
    // Manager-debut signals (intelligence/manager-debut.ts)
    homeManagerMatchesAtClub,
    homeManagerDaysAtClub,
    awayManagerMatchesAtClub,
    awayManagerDaysAtClub,

    // Referee
    refereeAvgGoals,
    refereeAvgCards,

    // Data completeness
    dataCompleteness,
    hasStatsData,
    hasXgData,
    hasOddsData,
    hasH2HData,
    hasStandingsData,
    hasLineupData,
    hasManagerData,
    hasRefereeData,
  };

  return fv;
}

// ═══════════════════════════════════════════════════════════════════════
// Feature Computation Helpers
// ═══════════════════════════════════════════════════════════════════════

interface FormFeatures {
  avgGoalsScored: number;
  avgGoalsConceded: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  formScore: number; // 0-1
  trend: 'rising' | 'stable' | 'declining';
  totalMatches: number;
}

function computeFormFeatures(matches: any[], teamId: number): FormFeatures {
  if (matches.length === 0) {
    return {
      avgGoalsScored: 1.2,
      avgGoalsConceded: 1.1,
      winRate: 0.4,
      drawRate: 0.28,
      lossRate: 0.32,
      formScore: 0.5,
      trend: 'stable',
      totalMatches: 0,
    };
  }

  let totalWeight = 0;
  let weightedGoalsScored = 0;
  let weightedGoalsConceded = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;

  // Recent form tracking (last 5 for trend)
  const recentResults: number[] = []; // 1 = win, 0.5 = draw, 0 = loss

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    // Exponential decay: most recent match gets weight 1.0, decay by 0.85 per match
    const weight = Math.pow(0.85, i);
    totalWeight += weight;

    const isHome = Number(m.home_team_id) === teamId;
    const goalsScored = isHome ? Number(m.home_score) : Number(m.away_score);
    const goalsConceded = isHome ? Number(m.away_score) : Number(m.home_score);

    weightedGoalsScored += goalsScored * weight;
    weightedGoalsConceded += goalsConceded * weight;

    if (goalsScored > goalsConceded) { wins++; recentResults.push(1); }
    else if (goalsScored === goalsConceded) { draws++; recentResults.push(0.5); }
    else { losses++; recentResults.push(0); }
  }

  const total = matches.length;
  const avgGoalsScored = totalWeight > 0 ? weightedGoalsScored / totalWeight : 1.2;
  const avgGoalsConceded = totalWeight > 0 ? weightedGoalsConceded / totalWeight : 1.1;

  // Form score: weighted by recency
  let formScore = 0;
  let formWeight = 0;
  for (let i = 0; i < recentResults.length; i++) {
    const w = Math.pow(0.8, i);
    formScore += recentResults[i] * w;
    formWeight += w;
  }
  formScore = formWeight > 0 ? formScore / formWeight : 0.5;

  // Trend: compare recent 3 vs older matches
  let trend: 'rising' | 'stable' | 'declining' = 'stable';
  if (recentResults.length >= 4) {
    const recent3Avg = recentResults.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const olderAvg = recentResults.slice(3).reduce((a, b) => a + b, 0) / (recentResults.length - 3);
    if (recent3Avg - olderAvg > 0.2) trend = 'rising';
    else if (olderAvg - recent3Avg > 0.2) trend = 'declining';
  }

  return {
    avgGoalsScored,
    avgGoalsConceded,
    winRate: total > 0 ? wins / total : 0.4,
    drawRate: total > 0 ? draws / total : 0.28,
    lossRate: total > 0 ? losses / total : 0.32,
    formScore,
    trend,
    totalMatches: total,
  };
}

interface H2HFeatures {
  totalMeetings: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  avgGoals: number;
  over25Rate: number;
  bttsRate: number;
}

function computeH2HFeatures(matches: any[], homeTeamId: number): H2HFeatures {
  if (matches.length === 0) {
    return { totalMeetings: 0, homeWins: 0, draws: 0, awayWins: 0, avgGoals: 2.5, over25Rate: 0.5, bttsRate: 0.5 };
  }

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let totalGoals = 0;
  let over25Count = 0;
  let bttsCount = 0;

  for (const m of matches) {
    const homeScore = Number(m.home_score);
    const awayScore = Number(m.away_score);
    const isHomeTeamHome = Number(m.home_team_id) === homeTeamId;

    totalGoals += homeScore + awayScore;
    if (homeScore + awayScore > 2) over25Count++;
    if (homeScore > 0 && awayScore > 0) bttsCount++;

    if (homeScore > awayScore) {
      if (isHomeTeamHome) homeWins++;
      else awayWins++;
    } else if (homeScore === awayScore) {
      draws++;
    } else {
      if (isHomeTeamHome) awayWins++;
      else homeWins++;
    }
  }

  return {
    totalMeetings: matches.length,
    homeWins,
    draws,
    awayWins,
    avgGoals: matches.length > 0 ? totalGoals / matches.length : 2.5,
    over25Rate: matches.length > 0 ? over25Count / matches.length : 0.5,
    bttsRate: matches.length > 0 ? bttsCount / matches.length : 0.5,
  };
}

interface VenueSplits {
  avgGoalsScored: number;
  avgGoalsConceded: number;
}

function computeVenueSplits(matches: any[], teamId: number, venue: 'home' | 'away'): VenueSplits {
  // Filter matches where the team played at the specified venue
  const venueMatches = matches.filter((m: any) => {
    const isHome = Number(m.home_team_id) === teamId;
    return venue === 'home' ? isHome : !isHome;
  });

  if (venueMatches.length === 0) {
    // Fall back to overall averages (no venue-specific data)
    return { avgGoalsScored: 1.3, avgGoalsConceded: 1.0 };
  }

  let totalWeight = 0;
  let weightedScored = 0;
  let weightedConceded = 0;

  for (let i = 0; i < venueMatches.length; i++) {
    const m = venueMatches[i];
    const weight = Math.pow(0.85, i);
    totalWeight += weight;

    const isHome = Number(m.home_team_id) === teamId;
    const scored = isHome ? Number(m.home_score) : Number(m.away_score);
    const conceded = isHome ? Number(m.away_score) : Number(m.home_score);

    weightedScored += scored * weight;
    weightedConceded += conceded * weight;
  }

  return {
    avgGoalsScored: totalWeight > 0 ? weightedScored / totalWeight : 1.3,
    avgGoalsConceded: totalWeight > 0 ? weightedConceded / totalWeight : 1.0,
  };
}
