// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Punter Brain v4: THE SNIPER
//
// PHILOSOPHY: Study everything. Pick ONE. Or walk away.
//
// This engine does NOT spray predictions across 15 markets.
// It studies the entire board — H2H, form, managers, gameplay, league,
// weather, motivation, fatigue, odds, market movement — and then
// picks the ONE bet with the best risk-reward profile.
//
// If nothing is good enough, it says SKIP. No forcing.
// Safety first. But when the edge is clear, we strike.
//
// Pipeline:
// 1. Read ALL data from Turso (events, standings, odds, lineups, managers, referees, h2h)
// 2. Build team profiles (form, xG, attack/defense strength)
// 3. Build Elo ratings from historical results
// 4. Run 8 statistical models (same as v3)
// 5. Compute ALL market probabilities (same as v3)
// 6. Evaluate every possible bet across all markets
// 7. Rank by risk-reward score
// 8. Apply punter wisdom (safety filter, contrarian check, Kelly sizing)
// 9. Output: ONE tip. The best one. Or SKIP.
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import type {
  PunterTipV4, TheTip, TipQuality, MatchAnalysis, CandidateBet,
  H2HSummary, Last5Summary, TeamLast5, FormSummary,
  ManagerSummary, GameplaySummary, LeagueContext, SituationalSummary,
  FullMarketProbs,
} from './types';
import { ENGINE_VERSION } from './types';
import { calculateAllMarkets, buildGoalMatrix } from '../v3/full-markets';
import { buildManagerIntel, calculateManagerPrediction } from '../v3/intelligence/manager';
import { buildRefereeIntel, calculateRefereePrediction } from '../v3/intelligence/referee';
import { buildLineupIntel, calculateLineupPrediction } from '../v3/intelligence/lineup';
import { calculatePoissonPrediction } from '../poisson';
import { calculateXgPrediction } from '../xg-model';
import { calculateFormPrediction } from '../form';
import { calculateAttackDefensePrediction } from '../attack-defense';
import { updateEloRatings, calculateEloPrediction } from '../elo';
import {
  calculateOutcomeProbs, clamp, impliedProbability, calculateOverround,
  kellyCriterion, weightedStdDev, neutralPrediction, poissonProb,
} from '../utils';

// ── In-memory caches ──────────────────────────────────────────────
let eloCache = new Map<number, { rating: number; matches: number }>();
let eloBuilt = false;
let dbReady = false;

// ── Team Stats from DB ────────────────────────────────────────────
interface TeamStatsDB {
  teamId: number;
  teamName: string;
  leagueId: number;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  xgd: number;
  form: string;
  pts: number;
}

interface LeagueAvgData {
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  avgXgf: number;
  avgXga: number;
}

function dbTeamStatsToModel(s: TeamStatsDB, leagueId: number, leagueName: string) {
  const homeMatches = Math.ceil(s.played / 2);
  const awayMatches = s.played - homeMatches;
  const homeGoalsScored = Math.round(s.gf * 0.57);
  const awayGoalsScored = s.gf - homeGoalsScored;
  const homeGoalsConceded = Math.round(s.ga * 0.43);
  const awayGoalsConceded = s.ga - homeGoalsConceded;
  const homeWins = Math.max(0, Math.round(s.won * 0.6));
  const homeDraws = Math.max(0, Math.round(s.drawn * 0.5));
  const homeLosses = Math.max(0, homeMatches - homeWins - homeDraws);
  const awayWins = Math.max(0, s.won - homeWins);
  const awayDraws = Math.max(0, s.drawn - homeDraws);
  const awayLosses = Math.max(0, awayMatches - awayWins - awayDraws);

  return {
    teamId: s.teamId, teamName: s.teamName, matchesPlayed: s.played,
    goalsScored: s.gf, goalsConceded: s.ga,
    xgf: s.xgf || s.gf, xga: s.xga || s.ga,
    wins: s.won, draws: s.drawn, losses: s.lost,
    form: s.form || '',
    homeMatches, homeGoalsScored, homeGoalsConceded,
    homeWins, homeDraws, homeLosses,
    awayMatches, awayGoalsScored, awayGoalsConceded,
    awayWins, awayDraws, awayLosses,
    leaguePosition: s.position, leagueId, leagueName,
    points: s.pts, xgd: s.xgd || 0,
  };
}

// ══════════════════════════════════════════════════════════════════
// MAIN: Generate Punter Tips from Turso DB
// ══════════════════════════════════════════════════════════════════

export async function generateV4Tips(params?: {
  dateFrom?: string;
  dateTo?: string;
  leagueId?: number;
  limit?: number;
  minQuality?: TipQuality;
}): Promise<PunterTipV4[]> {
  const db = getTursoClient();
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }

  const limit = params?.limit ?? 100;
  const today = params?.dateFrom || new Date().toISOString().split('T')[0];
  const nextWeek = params?.dateTo || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // ── Step 1: Read upcoming events from Turso ──────────────────────
  let eventQuery = `SELECT * FROM events WHERE status = 'notstarted' AND event_date >= ? AND event_date <= ?`;
  const eventArgs: any[] = [today, nextWeek];
  if (params?.leagueId) {
    eventQuery += ` AND league_id = ?`;
    eventArgs.push(params.leagueId);
  }
  eventQuery += ` ORDER BY event_date ASC LIMIT ?`;
  eventArgs.push(limit);

  const eventsResult = await db.execute({ sql: eventQuery, args: eventArgs });
  const events = eventsResult.rows;
  if (events.length === 0) return [];

  // ── Step 2: Load standings from Turso ────────────────────────────
  const leagueIds = [...new Set(events.map((e) => Number(e.league_id)))];
  const standingsMap = new Map<number, TeamStatsDB[]>();
  const leagueNameMap = new Map<number, string>();
  const leagueAvgMap = new Map<number, LeagueAvgData>();

  for (const leagueId of leagueIds) {
    const leagueResult = await db.execute({
      sql: `SELECT name FROM leagues WHERE id = ?`,
      args: [leagueId],
    });
    const leagueName = (leagueResult.rows[0]?.name as string) || `League ${leagueId}`;
    leagueNameMap.set(leagueId, leagueName);

    const standingsResult = await db.execute({
      sql: `SELECT * FROM standings WHERE league_id = ?`,
      args: [leagueId],
    });

    const teamStats: TeamStatsDB[] = standingsResult.rows.map((r) => ({
      teamId: Number(r.team_id),
      teamName: r.team_name as string,
      leagueId: Number(r.league_id),
      position: Number(r.position || 0),
      played: Number(r.played || 0),
      won: Number(r.won || 0),
      drawn: Number(r.drawn || 0),
      lost: Number(r.lost || 0),
      gf: Number(r.gf || 0),
      ga: Number(r.ga || 0),
      xgf: Number(r.xgf || 0),
      xga: Number(r.xga || 0),
      xgd: Number(r.xgd || 0),
      form: (r.form as string) || '',
      pts: Number(r.pts || 0),
    }));

    standingsMap.set(leagueId, teamStats);
    leagueAvgMap.set(leagueId, calculateLeagueAvg(teamStats));
  }

  // ── Step 3: Build Elo from finished events ──────────────────────
  if (!eloBuilt) {
    const finishedResult = await db.execute(
      `SELECT home_team_id, away_team_id, home_score, away_score FROM events
       WHERE status = 'finished' AND home_score IS NOT NULL AND away_score IS NOT NULL
       ORDER BY event_date DESC LIMIT 2000`
    );

    const eloMatches = finishedResult.rows.map((r) => ({
      homeTeamId: Number(r.home_team_id),
      awayTeamId: Number(r.away_team_id),
      homeScore: Number(r.home_score),
      awayScore: Number(r.away_score),
    }));

    updateEloRatings(eloMatches);
    eloBuilt = true;
  }

  // ── Step 4: Process each event ───────────────────────────────────
  const tips: PunterTipV4[] = [];

  for (const event of events) {
    try {
      const eventId = Number(event.id);
      const leagueId = Number(event.league_id);
      const homeTeamId = Number(event.home_team_id);
      const awayTeamId = Number(event.away_team_id);

      const leagueStandings = standingsMap.get(leagueId) || [];
      const leagueAvg = leagueAvgMap.get(leagueId) || calculateLeagueAvg([]);
      const leagueName = leagueNameMap.get(leagueId) || `League ${leagueId}`;

      const homeStatsDB = leagueStandings.find((t) => t.teamId === homeTeamId) ?? null;
      const awayStatsDB = leagueStandings.find((t) => t.teamId === awayTeamId) ?? null;
      const homeStats = homeStatsDB ? dbTeamStatsToModel(homeStatsDB, leagueId, leagueName) : null;
      const awayStats = awayStatsDB ? dbTeamStatsToModel(awayStatsDB, leagueId, leagueName) : null;

      // ── Load extra data from Turso ─────────────────────────────
      const [oddsRow, lineupRow, homeManagerRow, awayManagerRow, refereeRow, polymarketRow, h2hResult] = await Promise.all([
        db.execute({ sql: `SELECT * FROM event_odds WHERE event_id = ?`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM event_lineups WHERE event_id = ?`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM managers WHERE id = (SELECT home_coach_id FROM events WHERE id = ?)`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM managers WHERE id = (SELECT away_coach_id FROM events WHERE id = ?)`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM referees WHERE id = (SELECT referee_id FROM events WHERE id = ?)`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM polymarket_odds WHERE event_id = ?`, args: [eventId] }),
        // H2H: last 10 meetings between these teams
        db.execute({
          sql: `SELECT home_team_id, away_team_id, home_score, away_score, event_date
                FROM events WHERE status = 'finished'
                AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
                AND home_score IS NOT NULL AND away_score IS NOT NULL
                ORDER BY event_date DESC LIMIT 10`,
          args: [homeTeamId, awayTeamId, awayTeamId, homeTeamId],
        }),
      ]);

      // ── PHASE 1: Run 8 Statistical Models (same as v3) ────────
      const eloRatings = require('../elo').getEloRatings();
      const homeElo = eloRatings.get(homeTeamId);
      const awayElo = eloRatings.get(awayTeamId);

      const defaultTeamStats = {
        teamId: 0, teamName: '', matchesPlayed: 0, goalsScored: 0, goalsConceded: 0,
        xgf: 0, xga: 0, wins: 0, draws: 0, losses: 0, form: '',
        homeMatches: 0, homeGoalsScored: 0, homeGoalsConceded: 0,
        homeWins: 0, homeDraws: 0, homeLosses: 0,
        awayMatches: 0, awayGoalsScored: 0, awayGoalsConceded: 0,
        awayWins: 0, awayDraws: 0, awayLosses: 0,
        leaguePosition: 0, leagueId, leagueName, points: 0, xgd: 0,
      };

      const hStats = homeStats || { ...defaultTeamStats, teamId: homeTeamId, teamName: event.home_team as string };
      const aStats = awayStats || { ...defaultTeamStats, teamId: awayTeamId, teamName: event.away_team as string };

      const hasStatsData = hStats.matchesPlayed > 0 && aStats.matchesPlayed > 0;
      const hasXgData = hStats.xgf > 0 && aStats.xgf > 0;

      const models = {
        elo: calculateEloPrediction(homeElo, awayElo),
        poisson: hasStatsData ? calculatePoissonPrediction(hStats, aStats, leagueAvg) : neutralPrediction(),
        xg: hasXgData ? calculateXgPrediction(hStats, aStats, leagueAvg) : neutralPrediction(),
        form: calculateFormPrediction(
          { homeForm: hStats.form, awayForm: aStats.form, homeGoalForm: hStats.matchesPlayed > 0 ? hStats.goalsScored / hStats.matchesPlayed : 1.2, awayGoalForm: aStats.matchesPlayed > 0 ? aStats.goalsScored / aStats.matchesPlayed : 1.0 },
          { homeForm: aStats.form ? aStats.form.split('').reverse().join('') : '', awayForm: hStats.form ? hStats.form.split('').reverse().join('') : '', homeGoalForm: aStats.matchesPlayed > 0 ? aStats.awayGoalsScored / Math.max(1, aStats.awayMatches) : 1.0, awayGoalForm: hStats.matchesPlayed > 0 ? hStats.homeGoalsScored / Math.max(1, hStats.homeMatches) : 1.2 }
        ),
        attackDefense: hasStatsData ? calculateAttackDefensePrediction(hStats, aStats, leagueAvg) : neutralPrediction(),
        manager: calculateManagerPrediction(homeManagerRow.rows[0] as any || null, awayManagerRow.rows[0] as any || null),
        referee: calculateRefereePrediction(refereeRow.rows[0] as any || null),
        lineup: calculateLineupPrediction(
          buildLineupIntel(lineupRow.rows[0] as any || null, event.home_team as string, event.away_team as string),
          homeStatsDB ? { team_id: homeStatsDB.teamId, team_name: homeStatsDB.teamName, gf: homeStatsDB.gf, ga: homeStatsDB.ga, xgf: homeStatsDB.xgf, xga: homeStatsDB.xga, played: homeStatsDB.played } : null,
          awayStatsDB ? { team_id: awayStatsDB.teamId, team_name: awayStatsDB.teamName, gf: awayStatsDB.gf, ga: awayStatsDB.ga, xgf: awayStatsDB.xgf, xga: awayStatsDB.xga, played: awayStatsDB.played } : null
        ),
      };

      // ── PHASE 2: Dynamic Weights ──────────────────────────────
      const weights = calculateV4Weights({
        models,
        hasStatsData,
        hasXgData,
        hasHomeElo: homeElo !== undefined,
        hasAwayElo: awayElo !== undefined,
        hasHomeManager: homeManagerRow.rows.length > 0,
        hasAwayManager: awayManagerRow.rows.length > 0,
        hasReferee: refereeRow.rows.length > 0,
        hasLineup: lineupRow.rows.length > 0 && (lineupRow.rows[0] as any)?.lineup_status !== 'unavailable',
        hasH2H: h2hResult.rows.length >= 3,
      });

      // ── PHASE 3: Combine Models ───────────────────────────────
      const combined = combineV4Models(models, weights);

      // ── PHASE 4: Build Intelligence Layers ──────────────────────
      const managerIntel = buildManagerIntel(homeManagerRow.rows[0] as any || null, awayManagerRow.rows[0] as any || null);
      const refereeIntel = buildRefereeIntel(refereeRow.rows[0] as any || null);
      const lineupIntel = buildLineupIntel(lineupRow.rows[0] as any || null, event.home_team as string, event.away_team as string);

      // ── PHASE 5: Adjust probabilities ──────────────────────────
      let { homeWinProb, drawProb, awayWinProb, homeExpectedGoals, awayExpectedGoals } = combined;

      // Weather
      const weatherCode = Number(event.weather_code || 0);
      const windSpeed = Number(event.weather_wind_speed || 0);
      const temperature = Number(event.weather_temperature_c || 0);
      let weatherGoalReduction = 0;
      let weatherNote: string | null = null;

      if (weatherCode >= 3 || windSpeed > 30 || (temperature !== 0 && temperature < 0)) {
        if (weatherCode === 3) { weatherGoalReduction = 0.05; weatherNote = 'Rain expected — slight goal reduction'; }
        if (weatherCode === 4) { weatherGoalReduction = 0.12; weatherNote = 'Snow expected — significant goal reduction'; }
        if (weatherCode === 5) { weatherGoalReduction = 0.2; weatherNote = 'Extreme weather — major goal reduction'; }
        if (windSpeed > 40) { weatherGoalReduction += 0.08; weatherNote = (weatherNote || '') + ' | Strong wind'; }
        if (temperature < 0) { weatherGoalReduction += 0.03; weatherNote = (weatherNote || '') + ' | Freezing'; }
        homeExpectedGoals *= (1 - weatherGoalReduction * 0.5);
        awayExpectedGoals *= (1 - weatherGoalReduction * 0.5);
      }

      // Manager tactical adjustment
      if (managerIntel.tacticalMatchup) {
        homeExpectedGoals = Math.max(0.3, homeExpectedGoals + managerIntel.tacticalMatchup.goalExpectationModifier * 0.5);
        awayExpectedGoals = Math.max(0.2, awayExpectedGoals + managerIntel.tacticalMatchup.goalExpectationModifier * 0.5);
      }

      // Referee adjustment
      if (refereeIntel.referee) {
        homeExpectedGoals = Math.max(0.3, homeExpectedGoals * (1 + refereeIntel.over25Modifier));
        awayExpectedGoals = Math.max(0.2, awayExpectedGoals * (1 + refereeIntel.over25Modifier));
      }

      // Lineup strength adjustment
      if (lineupIntel.lineupStatus !== 'unavailable') {
        const strengthDiff = lineupIntel.homeSquadStrength - lineupIntel.awaySquadStrength;
        homeWinProb += strengthDiff * 0.1;
        awayWinProb -= strengthDiff * 0.1;
      }

      // Situational adjustments
      const isDerby = Boolean(event.is_local_derby);
      const isNeutralGround = Boolean(event.is_neutral_ground);
      const travelDistance = Number(event.travel_distance_km || 0);

      if (isDerby) {
        const pull = 0.08;
        if (homeWinProb > awayWinProb) { homeWinProb -= pull; } else { awayWinProb -= pull; }
        drawProb += pull * 0.3;
      }
      if (isNeutralGround) {
        const homeEdge = homeWinProb - awayWinProb;
        homeWinProb -= homeEdge * 0.4;
        awayWinProb += homeEdge * 0.4;
      }

      // Motivation
      const homeMotivation = assessMotivation(homeStatsDB);
      const awayMotivation = assessMotivation(awayStatsDB);
      const motivationGap = motivationToScore(homeMotivation) - motivationToScore(awayMotivation);

      if (motivationGap > 0.3) {
        homeWinProb += motivationGap * 0.05;
        awayWinProb -= motivationGap * 0.05;
      } else if (motivationGap < -0.3) {
        awayWinProb += Math.abs(motivationGap) * 0.05;
        homeWinProb -= Math.abs(motivationGap) * 0.05;
      }

      // Normalize
      homeWinProb = Math.max(0.02, homeWinProb);
      drawProb = Math.max(0.05, drawProb);
      awayWinProb = Math.max(0.02, awayWinProb);
      const totalProb = homeWinProb + drawProb + awayWinProb;
      homeWinProb /= totalProb;
      drawProb /= totalProb;
      awayWinProb /= totalProb;

      // ── PHASE 6: Full Market Probabilities ─────────────────────
      const goalMatrix = buildGoalMatrix(
        Math.max(0.3, homeExpectedGoals),
        Math.max(0.2, awayExpectedGoals),
        8, 0.1
      );
      const markets = calculateAllMarkets(
        goalMatrix, homeWinProb, drawProb, awayWinProb,
        homeExpectedGoals, awayExpectedGoals
      );

      // ── PHASE 7: Build Market Data ─────────────────────────────
      const market = buildV4MarketData(oddsRow.rows[0] as any, polymarketRow.rows[0] as any);

      // ── PHASE 8: Evaluate ALL possible bets ────────────────────
      const candidates = evaluateAllCandidates(markets, market, models, weights, isDerby);

      // ── PHASE 9: Risk assessment ───────────────────────────────
      const modelAgreement = calculateModelAgreement(models, weights);
      const dataQuality = assessDataQuality(homeStatsDB, awayStatsDB, h2hResult.rows.length);

      // ── PHASE 10: Build Match Analysis ─────────────────────────
      const analysis = buildMatchAnalysis(
        h2hResult.rows, homeStatsDB, awayStatsDB,
        homeStats, awayStats, managerIntel, refereeIntel, lineupIntel,
        leagueId, leagueName, leagueStandings,
        isDerby, homeMotivation, awayMotivation,
        weatherNote, travelDistance, lineupIntel
      );

      // ── PHASE 11: Pick THE ONE ─────────────────────────────────
      const tip = selectTheOneTip(candidates, modelAgreement, dataQuality,
        homeMotivation, awayMotivation, isDerby, weatherGoalReduction > 0.1,
        lineupIntel, market);

      const skipReason = tip === null
        ? determineSkipReason(modelAgreement, dataQuality, candidates,
            homeMotivation, awayMotivation, market)
        : null;

      tips.push({
        eventId,
        homeTeam: event.home_team as string,
        awayTeam: event.away_team as string,
        homeTeamId,
        awayTeamId,
        leagueId,
        leagueName,
        eventDate: event.event_date as string,
        status: event.status as string,
        tip,
        skipReason,
        analysis,
        probabilities: {
          homeWin: Math.round(homeWinProb * 1000) / 1000,
          draw: Math.round(drawProb * 1000) / 1000,
          awayWin: Math.round(awayWinProb * 1000) / 1000,
          homeXg: Math.round(homeExpectedGoals * 100) / 100,
          awayXg: Math.round(awayExpectedGoals * 100) / 100,
          over25: Math.round(markets.over25 * 1000) / 1000,
          bttsYes: Math.round(markets.bttsYes * 1000) / 1000,
        },
        modelAgreement: Math.round(modelAgreement * 1000) / 1000,
        engineVersion: ENGINE_VERSION,
      });
    } catch (err) {
      console.error(`[V4] Failed to analyze event ${event.id}:`, err);
    }
  }

  // ── Sort: Gold first, then Silver, Bronze, Skip ────────────────
  const qualityOrder: Record<TipQuality, number> = { gold: 0, silver: 1, bronze: 2, skip: 3 };
  tips.sort((a, b) => {
    const aQ = a.tip?.quality ?? 'skip';
    const bQ = b.tip?.quality ?? 'skip';
    if (qualityOrder[aQ] !== qualityOrder[bQ]) return qualityOrder[aQ] - qualityOrder[bQ];
    return (b.tip?.riskRewardScore ?? 0) - (a.tip?.riskRewardScore ?? 0);
  });

  return tips;
}

// ══════════════════════════════════════════════════════════════════
// THE SNIPER: Select the ONE best tip
// ══════════════════════════════════════════════════════════════════

function selectTheOneTip(
  candidates: CandidateBet[],
  modelAgreement: number,
  dataQuality: number,
  homeMotivation: string,
  awayMotivation: string,
  isDerby: boolean,
  hasWeatherRisk: boolean,
  lineup: any,
  market: any,
): TheTip | null {

  // ── HARD FILTERS: Instant disqualifiers ────────────────────────

  // Dead rubber — both teams have nothing to play for
  if (homeMotivation === 'dead-rubber' && awayMotivation === 'dead-rubber') {
    return null;
  }

  // Data quality too poor
  if (dataQuality < 0.15) {
    return null;
  }

  // Model agreement too low — the models can't agree, so we can't be confident
  if (modelAgreement < 0.25) {
    return null;
  }

  // No candidates at all
  if (candidates.length === 0) {
    return null;
  }

  // ── SOFT FILTERS: Reduce but don't eliminate ──────────────────

  // Apply penalties for risk factors
  const scoredCandidates = candidates.map((c) => {
    let score = c.riskRewardScore;

    // Boost for model agreement
    score *= (0.5 + modelAgreement * 0.5);

    // Boost for data quality
    score *= (0.5 + dataQuality * 0.5);

    // Penalize for derby uncertainty
    if (isDerby) score *= 0.8;

    // Penalize for weather risk
    if (hasWeatherRisk) score *= 0.85;

    // Penalize for lineup uncertainty
    if (c.safetyClass === 'risky') score *= 0.6;
    if (c.safetyClass === 'avoid') score *= 0.1;

    // Boost for safe plays
    if (c.isSafePlay) score *= 1.2;

    // Boost primary markets over exotics
    if (c.marketType === 'primary') score *= 1.1;
    if (c.marketType === 'exotic') score *= 0.7;

    // HEAVY penalty for no odds — can't verify value without market prices
    if (c.odds === null) score *= 0.3;

    // Boost if market and model agree (not contrarian — safer)
    if (!c.isContrarian) score *= 1.05;

    // Minimum confidence gate
    if (c.confidence < 0.3) score *= 0.3;
    if (c.confidence < 0.2) score *= 0.1;

    return { ...c, adjustedScore: score };
  });

  // Sort by adjusted score
  scoredCandidates.sort((a, b) => b.adjustedScore - a.adjustedScore);

  // ── THE ONE: Pick the best, but only if it's good enough ──────

  const best = scoredCandidates[0];

  // If the best candidate still has a very low score, SKIP
  if (best.adjustedScore < 0.05) {
    return null;
  }

  // Determine quality tier
  let quality: TipQuality;
  if (best.adjustedScore >= 0.35 && best.confidence >= 0.55 && best.riskLevel === 'very-low' || best.riskLevel === 'low') {
    quality = 'gold';
  } else if (best.adjustedScore >= 0.2 && best.confidence >= 0.4) {
    quality = 'silver';
  } else if (best.adjustedScore >= 0.08) {
    quality = 'bronze';
  } else {
    return null; // Not even bronze-worthy — SKIP
  }

  return {
    selection: best.selection,
    market: best.market,
    odds: best.odds,
    confidence: Math.round(best.confidence * 1000) / 1000,
    edge: Math.round(best.edge * 1000) / 1000,
    kellyStake: Math.round(best.kelly * 10000) / 10000,
    quality,
    reasoning: best.reasoning,
    riskLevel: best.riskLevel,
    isContrarian: best.isContrarian,
    isSafePlay: best.isSafePlay,
    riskRewardScore: Math.round(best.adjustedScore * 1000) / 1000,
    marketsEvaluated: candidates.length,
    rank: 1,
  };
}

// ── Determine WHY we skipped ─────────────────────────────────────

function determineSkipReason(
  modelAgreement: number,
  dataQuality: number,
  candidates: CandidateBet[],
  homeMotivation: string,
  awayMotivation: string,
  market: any,
): string {
  if (homeMotivation === 'dead-rubber' && awayMotivation === 'dead-rubber') {
    return 'Dead rubber — both teams have nothing to play for';
  }
  if (dataQuality < 0.15) {
    return 'Not enough data to make a confident read';
  }
  if (modelAgreement < 0.25) {
    return 'Models disagree — no clear picture';
  }
  if (candidates.length === 0) {
    return 'No value found — market has this priced right';
  }
  if (!market.homeWinOdds) {
    return 'No odds available — can\'t assess value';
  }
  return 'Edge too small — the punter walks away';
}

// ══════════════════════════════════════════════════════════════════
// CANDIDATE EVALUATION: Score every possible bet
// ══════════════════════════════════════════════════════════════════

function evaluateAllCandidates(
  markets: FullMarketProbs,
  market: any,
  models: Record<string, any>,
  weights: any,
  isDerby: boolean,
): CandidateBet[] {
  const candidates: CandidateBet[] = [];
  const edgeThreshold = market.overround !== null && market.overround < 0.05 ? 0.03 : 0.05;

  // 1X2
  if (market.homeWinOdds) {
    candidates.push(...scoreCandidate('1X2', 'Home Win', markets.homeWin, market.homeWinOdds, edgeThreshold, 'primary'));
  }
  if (market.drawOdds) {
    candidates.push(...scoreCandidate('1X2', 'Draw', markets.draw, market.drawOdds, edgeThreshold, 'primary'));
  }
  if (market.awayWinOdds) {
    candidates.push(...scoreCandidate('1X2', 'Away Win', markets.awayWin, market.awayWinOdds, edgeThreshold, 'primary'));
  }

  // Over/Under
  if (market.over15Odds) candidates.push(...scoreCandidate('Over/Under 1.5', 'Over 1.5', markets.over15, market.over15Odds, edgeThreshold, 'primary'));
  if (market.over25Odds) candidates.push(...scoreCandidate('Over/Under 2.5', 'Over 2.5', markets.over25, market.over25Odds, edgeThreshold, 'primary'));
  if (market.under25Odds) candidates.push(...scoreCandidate('Over/Under 2.5', 'Under 2.5', markets.under25, market.under25Odds, edgeThreshold, 'primary'));
  if (market.over35Odds) candidates.push(...scoreCandidate('Over/Under 3.5', 'Over 3.5', markets.over35, market.over35Odds, edgeThreshold, 'secondary'));
  if (market.bttsYesOdds) candidates.push(...scoreCandidate('BTTS', 'Yes', markets.bttsYes, market.bttsYesOdds, edgeThreshold, 'primary'));

  // Double Chance
  if (market.doubleChance1XOdds) candidates.push(...scoreCandidate('Double Chance', '1X', markets.doubleChance1X, market.doubleChance1XOdds, edgeThreshold, 'secondary'));
  if (market.doubleChance12Odds) candidates.push(...scoreCandidate('Double Chance', '12', markets.doubleChance12, market.doubleChance12Odds, edgeThreshold, 'secondary'));
  if (market.doubleChanceX2Odds) candidates.push(...scoreCandidate('Double Chance', 'X2', markets.doubleChanceX2, market.doubleChanceX2Odds, edgeThreshold, 'secondary'));

  // DNB
  if (market.dnbHomeOdds) candidates.push(...scoreCandidate('Draw No Bet', 'Home', markets.dnbHome, market.dnbHomeOdds, edgeThreshold, 'secondary'));
  if (market.dnbAwayOdds) candidates.push(...scoreCandidate('Draw No Bet', 'Away', markets.dnbAway, market.dnbAwayOdds, edgeThreshold, 'secondary'));

  // Model confidence as proxy when no odds
  const modelConf = calculateModelAgreement(models, weights);

  // Asian Handicap (top lines only — exotic, no odds available, heavily penalized)
  for (const ah of markets.asianHandicap) {
    if (Math.abs(ah.line) <= 1.5) {
      const ahMarket = `Asian HC ${ah.line > 0 ? '+' : ''}${ah.line}`;
      // No AH odds available — use conservative implied probability
      // Only tip AH if model probability is very strong (> 65%)
      const impliedProb = ah.homeProb > 0.5 ? 0.55 : 0.45; // slightly worse than 50/50
      const edge = ah.homeProb - impliedProb;
      if (edge > edgeThreshold * 1.5 && ah.homeProb > 0.65) {
        candidates.push(buildCandidate(ahMarket, `Home ${ah.line > 0 ? '+' : ''}${ah.line}`, ah.homeProb, null, edge, modelConf * 0.4, 'exotic'));
      }
      const awayEdge = ah.awayProb - (ah.awayProb > 0.5 ? 0.55 : 0.45);
      if (awayEdge > edgeThreshold * 1.5 && ah.awayProb > 0.65) {
        candidates.push(buildCandidate(ahMarket, `Away ${ah.line > 0 ? '+' : ''}${(-ah.line) > 0 ? '-' : ''}${Math.abs(ah.line)}`, ah.awayProb, null, awayEdge, modelConf * 0.4, 'exotic'));
      }
    }
  }

  // Correct Score (top 3 only — exotic, no odds, very penalized)
  for (const cs of markets.correctScores.slice(0, 3)) {
    if (cs.prob > 0.10) {
      // Correct scores are extremely hard to predict — only include as last resort
      const csEdge = cs.prob - 0.08;
      if (csEdge > edgeThreshold * 2) {
        candidates.push(buildCandidate('Correct Score', cs.score, cs.prob, null, csEdge, modelConf * 0.2, 'exotic'));
      }
    }
  }

  return candidates;
}

function scoreCandidate(
  marketName: string,
  selection: string,
  modelProb: number,
  odds: number,
  edgeThreshold: number,
  marketType: 'primary' | 'secondary' | 'exotic',
): CandidateBet[] {
  const impProb = impliedProbability(odds);
  const edge = modelProb - impProb;

  if (edge <= edgeThreshold) return [];

  const confidence = Math.min(1, modelProb * 1.5);
  const rawKelly = kellyCriterion(modelProb, odds);
  const riskMultiplier = edge > 0.1 ? 0.9 : edge > 0.05 ? 0.7 : 0.5;
  const kelly = clamp(rawKelly * 0.25 * riskMultiplier, 0, 0.1);

  const riskReward = clamp(edge * confidence * riskMultiplier * 5, 0, 1);

  let riskLevel: CandidateBet['riskLevel'] = 'low';
  if (edge < 0.05 || confidence < 0.35) riskLevel = 'high';
  else if (edge < 0.08 || confidence < 0.5) riskLevel = 'medium';
  else if (confidence >= 0.6 && edge >= 0.1) riskLevel = 'very-low';

  let safetyClass: CandidateBet['safetyClass'] = 'moderate';
  if (edge > 0.1 && confidence > 0.6 && riskLevel === 'very-low') safetyClass = 'safe';
  else if (riskLevel === 'high') safetyClass = 'risky';

  const isContrarian = modelProb > 0.5 && impProb < 0.4;
  const isSafePlay = !isContrarian && safetyClass === 'safe';

  // Generate human reasoning
  const reasoning = generateReasoning(marketName, selection, modelProb, edge, odds, riskLevel, isContrarian);

  return [{
    market: marketName, selection, modelProb,
    impliedProb: impProb, odds, edge,
    kelly, confidence, riskLevel,
    isContrarian, isSafePlay, riskRewardScore: riskReward,
    reasoning, marketType, safetyClass,
  }];
}

function buildCandidate(
  marketName: string,
  selection: string,
  modelProb: number,
  odds: number | null,
  edge: number,
  confidence: number,
  marketType: 'primary' | 'secondary' | 'exotic',
): CandidateBet {
  const riskReward = clamp(edge * confidence * 4, 0, 1);
  const riskLevel = edge < 0.05 ? 'high' : edge < 0.08 ? 'medium' : 'low';
  const reasoning = generateReasoning(marketName, selection, modelProb, edge, odds, riskLevel, false);

  return {
    market: marketName, selection, modelProb,
    impliedProb: odds ? impliedProbability(odds) : null, odds, edge,
    kelly: clamp(edge * 0.15, 0, 0.08),
    confidence: Math.min(1, confidence),
    riskLevel,
    isContrarian: false, isSafePlay: edge > 0.08 && confidence > 0.5,
    riskRewardScore: riskReward,
    reasoning, marketType,
    safetyClass: riskLevel === 'high' ? 'risky' : marketType === 'exotic' ? 'moderate' : 'safe',
  };
}

function generateReasoning(
  market: string, selection: string,
  prob: number, edge: number, odds: number | null,
  risk: string, isContrarian: boolean,
): string {
  const pctProb = Math.round(prob * 100);
  const pctEdge = Math.round(edge * 100);

  if (isContrarian) {
    return `Model says ${pctProb}% but market implies less — contrarian value on ${selection}`;
  }

  if (edge > 0.1 && risk === 'very-low') {
    return `Strong edge on ${selection} — ${pctEdge}% value gap, low risk`;
  }

  if (selection.includes('Over') && prob > 0.6) {
    return `Goals expected — ${pctProb}% model probability on ${selection}`;
  }

  if (selection.includes('Under') && prob > 0.55) {
    return `Defensive profile — ${pctProb}% on ${selection}`;
  }

  if (selection === 'Yes' && prob > 0.55) {
    return `Both teams likely to score — ${pctProb}% BTTS probability`;
  }

  if (market === '1X2' && prob > 0.5) {
    return `${pctProb}% chance with ${pctEdge}% edge on ${selection}`;
  }

  if (market === 'Double Chance' && prob > 0.6) {
    return `Safe coverage at ${pctProb}% — ${pctEdge}% edge`;
  }

  return `${pctProb}% model probability, ${pctEdge}% edge on ${selection}`;
}

// ══════════════════════════════════════════════════════════════════
// MATCH ANALYSIS BUILDER
// ══════════════════════════════════════════════════════════════════

function buildMatchAnalysis(
  h2hRows: any[],
  homeStatsDB: TeamStatsDB | null,
  awayStatsDB: TeamStatsDB | null,
  homeStats: any,
  awayStats: any,
  managerIntel: any,
  refereeIntel: any,
  lineupIntel: any,
  leagueId: number,
  leagueName: string,
  leagueStandings: TeamStatsDB[],
  isDerby: boolean,
  homeMotivation: string,
  awayMotivation: string,
  weatherNote: string | null,
  travelDistance: number,
  lineup: any,
): MatchAnalysis {
  // H2H
  let h2hHomeWins = 0, h2hDraws = 0, h2hAwayWins = 0, h2hGoals = 0, h2hOver25 = 0, h2hBtts = 0;
  const h2hTotal = h2hRows.length;

  for (const r of h2hRows) {
    const hs = Number(r.home_score);
    const as = Number(r.away_score);
    const isHomeTeam = Number(r.home_team_id) === (homeStatsDB?.teamId ?? 0);

    if (hs > as) { if (isHomeTeam) h2hHomeWins++; else h2hAwayWins++; }
    else if (hs < as) { if (isHomeTeam) h2hAwayWins++; else h2hHomeWins++; }
    else { h2hDraws++; }

    h2hGoals += hs + as;
    if (hs + as > 2) h2hOver25++;
    if (hs > 0 && as > 0) h2hBtts++;
  }

  const h2h: H2HSummary = {
    homeWins: h2hHomeWins, draws: h2hDraws, awayWins: h2hAwayWins,
    totalMeetings: h2hTotal,
    avgGoals: h2hTotal > 0 ? Math.round((h2hGoals / h2hTotal) * 10) / 10 : 0,
    over25Rate: h2hTotal > 0 ? Math.round((h2hOver25 / h2hTotal) * 100) / 100 : 0,
    bttsRate: h2hTotal > 0 ? Math.round((h2hBtts / h2hTotal) * 100) / 100 : 0,
    note: h2hTotal === 0 ? 'No H2H data' : `H2H: ${h2hHomeWins}W-${h2hDraws}D-${h2hAwayWins}L, avg ${h2hGoals / h2hTotal} goals`,
  };

  // Last 5
  const parseLast5 = (stats: TeamStatsDB | null): TeamLast5 => {
    if (!stats || stats.played === 0) {
      return { wins: 0, draws: 0, losses: 0, goalsScored: 0, goalsConceded: 0, form: '', cleanSheets: 0, failedToScore: 0 };
    }
    const formStr = stats.form || '';
    const last5 = formStr.slice(-5);
    const wins = (last5.match(/W/g) || []).length;
    const draws = (last5.match(/D/g) || []).length;
    const losses = (last5.match(/L/g) || []).length;
    const avgGF = stats.gf / stats.played;
    const avgGA = stats.ga / stats.played;

    return {
      wins, draws, losses,
      goalsScored: Math.round(avgGF * 5),
      goalsConceded: Math.round(avgGA * 5),
      form: last5,
      cleanSheets: Math.round((1 - avgGA / avgGF) * 2), // estimate
      failedToScore: losses, // rough
    };
  };

  const last5: Last5Summary = {
    home: parseLast5(homeStatsDB),
    away: parseLast5(awayStatsDB),
  };

  // Form
  const calcFormScore = (stats: TeamStatsDB | null): number => {
    if (!stats || stats.played === 0) return 0.5;
    const winRate = stats.won / stats.played;
    const formStr = stats.form || '';
    const recentWins = (formStr.slice(-5).match(/W/g) || []).length;
    const recentForm = recentWins / Math.min(5, formStr.length || 1);
    return clamp(winRate * 0.4 + recentForm * 0.6, 0, 1);
  };

  const homeFormScore = calcFormScore(homeStatsDB);
  const awayFormScore = calcFormScore(awayStatsDB);

  const form: FormSummary = {
    homeFormScore: Math.round(homeFormScore * 1000) / 1000,
    awayFormScore: Math.round(awayFormScore * 1000) / 1000,
    homeTrend: homeFormScore > 0.6 ? 'rising' : homeFormScore < 0.35 ? 'declining' : 'stable',
    awayTrend: awayFormScore > 0.6 ? 'rising' : awayFormScore < 0.35 ? 'declining' : 'stable',
    note: `Home: ${homeFormScore > 0.6 ? 'Hot' : homeFormScore < 0.35 ? 'Cold' : 'Mixed'} | Away: ${awayFormScore > 0.6 ? 'Hot' : awayFormScore < 0.35 ? 'Cold' : 'Mixed'}`,
  };

  // Manager
  const mgr: ManagerSummary = {
    homeManager: managerIntel.homeManager?.name || null,
    awayManager: managerIntel.awayManager?.name || null,
    homeStyle: managerIntel.homeManager?.tacticalProfile || 'Unknown',
    awayStyle: managerIntel.awayManager?.tacticalProfile || 'Unknown',
    tacticalMatchup: managerIntel.tacticalMatchup?.description || 'Balanced matchup',
    goalExpectationModifier: managerIntel.tacticalMatchup?.goalExpectationModifier || 0,
    bttsModifier: managerIntel.tacticalMatchup?.bttsModifier || 0,
  };

  // Gameplay
  // Use per-match xG (combined model output), not season totals
  const perMatchHomeXg = homeStatsDB && homeStatsDB.played > 0
    ? (homeStatsDB.xgf || homeStatsDB.gf) / homeStatsDB.played
    : (homeStats?.xgf || 1.2);
  const perMatchAwayXg = awayStatsDB && awayStatsDB.played > 0
    ? (awayStatsDB.xgf || awayStatsDB.gf) / awayStatsDB.played
    : (awayStats?.xgf || 1.0);
  const totalXg = perMatchHomeXg + perMatchAwayXg;
  const gameplay: GameplaySummary = {
    expectedStyle: managerIntel.tacticalMatchup?.expectedStyle || 'balanced',
    expectedGoals: Math.round(totalXg * 100) / 100,
    expectedCards: refereeIntel.cardExpectation || 'average',
    possessionExpectation: perMatchHomeXg > perMatchAwayXg ? 'home-dominant' : 'balanced',
    note: managerIntel.tacticalMatchup?.description || 'Standard match expected',
  };

  // League context
  const lAvg = calculateLeagueAvg(leagueStandings);
  const top3Pts = leagueStandings.slice(0, 3).reduce((s, t) => s + t.pts, 0);
  const bottom3Pts = leagueStandings.slice(-3).reduce((s, t) => s + t.pts, 0);
  const avgPts = leagueStandings.reduce((s, t) => s + t.pts, 0) / Math.max(1, leagueStandings.length);

  const league: LeagueContext = {
    leagueId,
    leagueName,
    avgGoalsPerMatch: Math.round(lAvg.avgGoalsScored * 100) / 100,
    homeWinRate: Math.round(lAvg.avgHomeGoals / Math.max(0.01, lAvg.avgGoalsScored) * 100) / 100,
    drawRate: 0.26, // approximate
    awayWinRate: Math.round(lAvg.avgAwayGoals / Math.max(0.01, lAvg.avgGoalsScored) * 100) / 100,
    over25Rate: Math.round((lAvg.avgHomeGoals + lAvg.avgAwayGoals > 2.5 ? 0.55 : 0.42) * 100) / 100,
    bttsRate: 0.48, // approximate
    competitiveness: top3Pts - bottom3Pts > 60 ? 'high' : top3Pts - bottom3Pts > 30 ? 'medium' : 'low',
  };

  // Situation
  const keyAbsences: string[] = [
    ...lineupIntel.homeKeyAbsences.slice(0, 2),
    ...lineupIntel.awayKeyAbsences.slice(0, 2),
  ];

  const situation: SituationalSummary = {
    isDerby,
    homeMotivation: homeMotivation as any,
    awayMotivation: awayMotivation as any,
    weatherNote,
    fatigueNote: (homeStatsDB?.played ?? 0) > 35 ? 'Home squad fatigued' : (awayStatsDB?.played ?? 0) > 35 ? 'Away squad fatigued' : null,
    travelNote: travelDistance > 1000 ? `Long travel: ${travelDistance}km` : null,
    keyAbsences,
  };

  const dataQuality = assessDataQuality(homeStatsDB, awayStatsDB, h2hRows.length);

  return { h2h, last5, form, manager: mgr, gameplay, league, situation, dataQuality };
}

// ══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════

function calculateLeagueAvg(standings: TeamStatsDB[]): LeagueAvgData {
  if (standings.length === 0) {
    return { avgHomeGoals: 1.35, avgAwayGoals: 1.15, avgGoalsScored: 1.25, avgGoalsConceded: 1.25, avgXgf: 1.25, avgXga: 1.25 };
  }
  const totalMatches = standings.reduce((s, t) => s + t.played, 0);
  const totalGoals = standings.reduce((s, t) => s + t.gf, 0);
  const totalXgf = standings.reduce((s, t) => s + t.xgf, 0);
  const totalXga = standings.reduce((s, t) => s + t.xga, 0);
  const avgGPM = totalMatches > 0 ? totalGoals / totalMatches : 1.25;
  return {
    avgHomeGoals: avgGPM * 0.54,
    avgAwayGoals: avgGPM * 0.46,
    avgGoalsScored: avgGPM,
    avgGoalsConceded: avgGPM,
    avgXgf: totalMatches > 0 ? totalXgf / totalMatches : avgGPM,
    avgXga: totalMatches > 0 ? totalXga / totalMatches : avgGPM,
  };
}

function calculateV4Weights(input: {
  models: Record<string, any>;
  hasStatsData: boolean;
  hasXgData: boolean;
  hasHomeElo: boolean;
  hasAwayElo: boolean;
  hasHomeManager: boolean;
  hasAwayManager: boolean;
  hasReferee: boolean;
  hasLineup: boolean;
  hasH2H: boolean;
}): any {
  let w = {
    elo: 0.17, poisson: 0.17, xg: 0.22, form: 0.10,
    attackDefense: 0.14, manager: 0.08, referee: 0.04, lineup: 0.08,
  };

  if (!input.hasXgData) { w.xg = 0.05; w.poisson = 0.24; }
  if (!input.hasStatsData) { w.poisson = 0.08; w.attackDefense = 0.08; w.xg = 0.04; w.elo = 0.35; w.form = 0.25; }
  if (!input.hasHomeElo || !input.hasAwayElo) { w.elo = 0.10; w.poisson += 0.04; w.xg += 0.03; }
  if (!input.hasHomeManager || !input.hasAwayManager) { w.manager = 0.02; w.elo += 0.03; w.xg += 0.03; }
  if (!input.hasReferee) { w.referee = 0.01; w.elo += 0.02; w.xg += 0.01; }
  if (!input.hasLineup) { w.lineup = 0.02; w.form += 0.03; w.elo += 0.03; }
  if (input.hasH2H) { /* H2H confidence boost already baked into model agreement */ }

  const total = Object.values(w).reduce((s: number, v) => s + v, 0);
  if (total > 0) {
    for (const k of Object.keys(w) as (keyof typeof w)[]) {
      w[k] = Math.round((w[k] / total) * 1000) / 1000;
    }
  }

  return w;
}

function combineV4Models(
  models: Record<string, any>,
  weights: any,
): { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number } {
  const modelList = [models.elo, models.poisson, models.xg, models.form, models.attackDefense, models.manager, models.referee, models.lineup];
  const weightList = [weights.elo, weights.poisson, weights.xg, weights.form, weights.attackDefense, weights.manager, weights.referee, weights.lineup];

  let totalRW = 0;
  const adjWeights = weightList.map((w: number, i: number) => { const aw = w * modelList[i].reliability; totalRW += aw; return aw; });

  if (totalRW === 0) return { homeWinProb: 0.42, drawProb: 0.28, awayWinProb: 0.30, homeExpectedGoals: 1.35, awayExpectedGoals: 1.15 };

  let h = 0, d = 0, a = 0, hxg = 0, axg = 0;
  for (let i = 0; i < modelList.length; i++) {
    const w = adjWeights[i] / totalRW;
    h += w * modelList[i].homeWinProb;
    d += w * modelList[i].drawProb;
    a += w * modelList[i].awayWinProb;
    hxg += w * modelList[i].homeExpectedGoals;
    axg += w * modelList[i].awayExpectedGoals;
  }
  const total = h + d + a;
  if (total === 0) return { homeWinProb: 0.42, drawProb: 0.28, awayWinProb: 0.30, homeExpectedGoals: 1.35, awayExpectedGoals: 1.15 };

  return { homeWinProb: h / total, drawProb: d / total, awayWinProb: a / total, homeExpectedGoals: Math.round(hxg * 100) / 100, awayExpectedGoals: Math.round(axg * 100) / 100 };
}

function calculateModelAgreement(models: Record<string, any>, weights: any): number {
  const modelList = [models.elo, models.poisson, models.xg, models.form, models.attackDefense, models.manager, models.referee, models.lineup];
  const weightList = [weights.elo, weights.poisson, weights.xg, weights.form, weights.attackDefense, weights.manager, weights.referee, weights.lineup];
  const homeWinProbs = modelList.map((m: any) => m.homeWinProb);
  const disagreement = weightedStdDev(homeWinProbs, weightList);
  return clamp(1 - disagreement * 4, 0.05, 0.95);
}

function assessMotivation(stats: TeamStatsDB | null): string {
  if (!stats || stats.played < 5) return 'medium';
  const pos = stats.position;
  if (pos >= 18) return 'must-win';
  if (pos <= 3) return 'high';
  if (pos <= 6) return 'high';
  if (pos >= 16) return 'high';
  if (pos >= 7 && pos <= 14 && stats.played > 30) return 'dead-rubber';
  return 'medium';
}

function motivationToScore(level: string): number {
  return level === 'must-win' ? 1.0 : level === 'high' ? 0.8 : level === 'medium' ? 0.5 : level === 'low' ? 0.3 : 0.1;
}

function assessDataQuality(home: TeamStatsDB | null, away: TeamStatsDB | null, h2hCount: number): number {
  if (!home && !away) return 0.05;
  let q = (!home || !away) ? 0.3 : 0.5;
  const min = Math.min(home?.played ?? 0, away?.played ?? 0);
  if (min >= 20) q += 0.3; else if (min >= 10) q += 0.2; else if (min >= 5) q += 0.1;
  if ((home?.xgf ?? 0) > 0 && (away?.xgf ?? 0) > 0) q += 0.1;
  if (h2hCount >= 3) q += 0.05;
  return Math.min(1, q);
}

function buildV4MarketData(oddsRow: any, polymarketRow: any): any {
  const o = oddsRow;
  const homeWinOdds = o ? Number(o.home_win) || null : null;
  const drawOdds = o ? Number(o.draw) || null : null;
  const awayWinOdds = o ? Number(o.away_win) || null : null;

  return {
    homeWinOdds, drawOdds, awayWinOdds,
    over15Odds: o ? Number(o.over_15_goals) || null : null,
    over25Odds: o ? Number(o.over_25_goals) || null : null,
    over35Odds: o ? Number(o.over_35_goals) || null : null,
    under25Odds: o ? Number(o.under_25_goals) || null : null,
    bttsYesOdds: o ? Number(o.btts_yes) || null : null,
    doubleChance1XOdds: o ? Number(o.double_chance_1x) || null : null,
    doubleChance12Odds: o ? Number(o.double_chance_12) || null : null,
    doubleChanceX2Odds: o ? Number(o.double_chance_x2) || null : null,
    dnbHomeOdds: o ? Number(o.draw_no_bet_home) || null : null,
    dnbAwayOdds: o ? Number(o.draw_no_bet_away) || null : null,
    impliedHomeWin: homeWinOdds ? impliedProbability(homeWinOdds) : null,
    impliedDraw: drawOdds ? impliedProbability(drawOdds) : null,
    impliedAwayWin: awayWinOdds ? impliedProbability(awayWinOdds) : null,
    overround: homeWinOdds && drawOdds && awayWinOdds ? calculateOverround([homeWinOdds, drawOdds, awayWinOdds]) : null,
    marketConfidence: homeWinOdds ? 0.5 : 0.1,
    polymarketPrices: polymarketRow ? {
      homeWin: Number(polymarketRow.home_win_price) || null,
      draw: Number(polymarketRow.draw_price) || null,
      awayWin: Number(polymarketRow.away_win_price) || null,
      over25: Number(polymarketRow.over_25_price) || null,
      bttsYes: Number(polymarketRow.btts_yes_price) || null,
    } : null,
  };
}
