// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Punter Brain v3 Engine Orchestrator
//
// THE MAD ENGINE. Reads from Turso, never from the API.
// 8 models. ALL markets. Safety first, odds observant.
//
// Pipeline:
// 1. Read data from Turso (events, standings, odds, lineups, managers, referees)
// 2. Build TeamStats from standings
// 3. Build Elo from finished events
// 4. Run 8 statistical models (Elo, Poisson, xG, Form, AttDef, Manager, Referee, Lineup)
// 5. Dynamic weights based on data availability
// 6. Combine models → base probabilities
// 7. Apply situational intelligence (weather, fatigue, motivation, derby)
// 8. Apply tactical adjustments (manager style, referee style, lineup impact)
// 9. Build FULL market probabilities (1X2, O/U 0.5-4.5, BTTS, DC, DNB, AH, CS)
// 10. Build market intelligence (odds, movement, polymarket)
// 11. Detect value bets across ALL markets
// 12. Assess risk with full context
// 13. Make punter decision (safety-first, but odds-observant)
// 14. Return complete prediction
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import type {
  PunterPredictionV3, ModelPrediction, ModelWeights, FullMarketProbs,
  SituationalFactorsV3, ManagerIntel, RefereeIntel, LineupIntel,
  MarketDataV3, RiskAssessmentV3, PunterDecisionV3, ValueBetV3,
  WeatherImpact, MotivationLevel,
} from './types';
import { ENGINE_VERSION } from './types';
import { calculateAllMarkets, buildGoalMatrix } from './full-markets';
import { buildManagerIntel, calculateManagerPrediction } from './intelligence/manager';
import { buildRefereeIntel, calculateRefereePrediction } from './intelligence/referee';
import { buildLineupIntel, calculateLineupPrediction } from './intelligence/lineup';
import { calculatePoissonPrediction } from '../poisson';
import { calculateXgPrediction } from '../xg-model';
import { calculateFormPrediction } from '../form';
import { calculateAttackDefensePrediction } from '../attack-defense';
import { updateEloRatings, calculateEloPrediction } from '../elo';
import { calculateOutcomeProbs, regressToMean, clamp, impliedProbability, calculateOverround, kellyCriterion, weightedStdDev, neutralPrediction } from '../utils';

// ── In-memory Elo cache (rebuilt from DB each run) ─────────────────
let eloCache = new Map<number, { rating: number; matches: number }>();
let eloBuilt = false;

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
// MAIN: Generate Predictions from Turso DB
// ══════════════════════════════════════════════════════════════════

let dbReady = false;

export async function generateV3Predictions(params?: {
  dateFrom?: string;
  dateTo?: string;
  leagueId?: number;
  limit?: number;
}): Promise<PunterPredictionV3[]> {
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

  for (const leagueId of leagueIds) {
    // Get league name
    const leagueResult = await db.execute({
      sql: `SELECT name FROM leagues WHERE id = ?`,
      args: [leagueId],
    });
    const leagueName = (leagueResult.rows[0]?.name as string) || `League ${leagueId}`;
    leagueNameMap.set(leagueId, leagueName);

    // Get standings
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
  }

  // ── Step 3: Build Elo from finished events ──────────────────────
  if (!eloBuilt) {
    const finishedResult = await db.execute(
      `SELECT home_team_id, away_team_id, home_score, away_score FROM events
       WHERE status = 'finished' AND home_score IS NOT NULL AND away_score IS NOT NULL
       ORDER BY event_date DESC LIMIT 1000`
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
  const predictions: PunterPredictionV3[] = [];

  for (const event of events) {
    try {
      const eventId = Number(event.id);
      const leagueId = Number(event.league_id);
      const homeTeamId = Number(event.home_team_id);
      const awayTeamId = Number(event.away_team_id);

      const leagueStandings = standingsMap.get(leagueId) || [];
      const leagueAvg = calculateLeagueAvg(leagueStandings);
      const leagueName = leagueNameMap.get(leagueId) || `League ${leagueId}`;

      // Find team stats
      const homeStatsDB = leagueStandings.find((t) => t.teamId === homeTeamId) ?? null;
      const awayStatsDB = leagueStandings.find((t) => t.teamId === awayTeamId) ?? null;
      const homeStats = homeStatsDB ? dbTeamStatsToModel(homeStatsDB, leagueId, leagueName) : null;
      const awayStats = awayStatsDB ? dbTeamStatsToModel(awayStatsDB, leagueId, leagueName) : null;

      // ── Load extra data from Turso ─────────────────────────────
      const [oddsRow, lineupRow, homeManagerRow, awayManagerRow, refereeRow, polymarketRow] = await Promise.all([
        db.execute({ sql: `SELECT * FROM event_odds WHERE event_id = ?`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM event_lineups WHERE event_id = ?`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM managers WHERE id = (SELECT home_coach_id FROM events WHERE id = ?)`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM managers WHERE id = (SELECT away_coach_id FROM events WHERE id = ?)`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM referees WHERE id = (SELECT referee_id FROM events WHERE id = ?)`, args: [eventId] }),
        db.execute({ sql: `SELECT * FROM polymarket_odds WHERE event_id = ?`, args: [eventId] }),
      ]);

      // ── PHASE 1: Run 8 Statistical Models ─────────────────────
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
      const weights = calculateV3Weights({
        models,
        hasStatsData,
        hasXgData,
        hasHomeElo: homeElo !== undefined,
        hasAwayElo: awayElo !== undefined,
        hasHomeManager: homeManagerRow.rows.length > 0,
        hasAwayManager: awayManagerRow.rows.length > 0,
        hasReferee: refereeRow.rows.length > 0,
        hasLineup: lineupRow.rows.length > 0 && (lineupRow.rows[0] as any)?.lineup_status !== 'unavailable',
      });

      // ── PHASE 3: Combine Models ───────────────────────────────
      const combined = combineV3Models(models, weights);

      // ── PHASE 4: Situational Intelligence ──────────────────────
      const situation = assessV3Situation(
        hStats, aStats,
        Boolean(event.is_local_derby),
        Boolean(event.is_neutral_ground),
        Number(event.travel_distance_km || 0),
        Number(event.weather_code || 0),
        event.weather_description as string || null,
        Number(event.weather_wind_speed || 0),
        Number(event.weather_temperature_c || 0),
        leagueId
      );

      // ── PHASE 5: Tactical Adjustments ─────────────────────────
      const managerIntel = buildManagerIntel(homeManagerRow.rows[0] as any || null, awayManagerRow.rows[0] as any || null);
      const refereeIntel = buildRefereeIntel(refereeRow.rows[0] as any || null);
      const lineupIntel = buildLineupIntel(lineupRow.rows[0] as any || null, event.home_team as string, event.away_team as string);

      // Apply adjustments to combined probabilities
      let { homeWinProb, drawProb, awayWinProb, homeExpectedGoals, awayExpectedGoals } = combined;

      // Weather adjustment
      if (situation.weatherImpact && situation.weatherImpact.goalReduction > 0) {
        const wr = situation.weatherImpact.goalReduction;
        homeExpectedGoals *= (1 - wr * 0.5);
        awayExpectedGoals *= (1 - wr * 0.5);
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

      // Situational adjustments (derby, motivation, etc.)
      if (situation.isDerby) {
        const pull = 0.08;
        if (homeWinProb > awayWinProb) { homeWinProb -= pull; } else { awayWinProb -= pull; }
        drawProb += pull * 0.3;
      }
      if (situation.isNeutralGround) {
        const homeEdge = homeWinProb - awayWinProb;
        homeWinProb -= homeEdge * 0.4;
        awayWinProb += homeEdge * 0.4;
      }
      if (situation.motivationGap > 0.3) {
        homeWinProb += situation.motivationGap * 0.05;
        awayWinProb -= situation.motivationGap * 0.05;
      } else if (situation.motivationGap < -0.3) {
        awayWinProb += Math.abs(situation.motivationGap) * 0.05;
        homeWinProb -= Math.abs(situation.motivationGap) * 0.05;
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

      // ── PHASE 7: Market Intelligence ──────────────────────────
      const market = buildV3MarketData(oddsRow.rows[0] as any, polymarketRow.rows[0] as any);

      // ── PHASE 8: Risk Assessment ──────────────────────────────
      const risk = assessV3Risk(models, weights, situation, market, lineupIntel, refereeIntel);

      // ── PHASE 9: Value Bets ───────────────────────────────────
      const valueBets = detectV3ValueBets(markets, market, risk);

      // ── PHASE 10: Punter Decision ─────────────────────────────
      const decision = makeV3Decision(risk, situation, market, valueBets, homeWinProb, awayWinProb);

      const predicted: 'H' | 'D' | 'A' = homeWinProb >= drawProb && homeWinProb >= awayWinProb ? 'H'
        : awayWinProb >= drawProb ? 'A' : 'D';

      const confidence = risk.adjustedConfidence;
      const isRecommended = decision.action !== 'pass' && decision.action !== 'watch' && valueBets.some(vb => vb.isActionable);

      predictions.push({
        eventId,
        homeTeam: event.home_team as string,
        awayTeam: event.away_team as string,
        homeTeamId,
        awayTeamId,
        leagueId,
        leagueName,
        eventDate: event.event_date as string,
        status: event.status as string,
        markets,
        predicted,
        models,
        weights,
        situational: situation,
        managerIntel,
        refereeIntel,
        lineupIntel,
        market,
        risk,
        decision,
        valueBets,
        confidence,
        isRecommended,
        engineVersion: ENGINE_VERSION,
      });
    } catch (err) {
      console.error(`[V3] Failed to predict event ${event.id}:`, err);
    }
  }

  return predictions;
}

// ── Helper: Calculate league averages from standings ──────────────
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

// ── V3 Dynamic Weights ────────────────────────────────────────────
function calculateV3Weights(input: {
  models: Record<string, ModelPrediction>;
  hasStatsData: boolean;
  hasXgData: boolean;
  hasHomeElo: boolean;
  hasAwayElo: boolean;
  hasHomeManager: boolean;
  hasAwayManager: boolean;
  hasReferee: boolean;
  hasLineup: boolean;
}): ModelWeights {
  // Base weights
  let w: ModelWeights = {
    elo: 0.18,
    poisson: 0.18,
    xg: 0.22,
    form: 0.10,
    attackDefense: 0.14,
    manager: 0.08,
    referee: 0.04,
    lineup: 0.06,
  };

  // Adjust based on data availability
  if (!input.hasXgData) { w.xg = 0.05; w.poisson = 0.24; }
  if (!input.hasStatsData) { w.poisson = 0.08; w.attackDefense = 0.08; w.xg = 0.04; w.elo = 0.35; w.form = 0.25; }
  if (!input.hasHomeElo || !input.hasAwayElo) { w.elo = 0.10; w.poisson += 0.04; w.xg += 0.04; }
  if (!input.hasHomeManager || !input.hasAwayManager) { w.manager = 0.02; w.elo += 0.03; w.xg += 0.03; }
  if (!input.hasReferee) { w.referee = 0.01; w.elo += 0.02; w.xg += 0.01; }
  if (!input.hasLineup) { w.lineup = 0.02; w.form += 0.02; w.elo += 0.02; }

  // Normalize
  const total = w.elo + w.poisson + w.xg + w.form + w.attackDefense + w.manager + w.referee + w.lineup;
  if (total > 0) {
    w.elo /= total; w.poisson /= total; w.xg /= total; w.form /= total;
    w.attackDefense /= total; w.manager /= total; w.referee /= total; w.lineup /= total;
  }

  return {
    elo: Math.round(w.elo * 1000) / 1000,
    poisson: Math.round(w.poisson * 1000) / 1000,
    xg: Math.round(w.xg * 1000) / 1000,
    form: Math.round(w.form * 1000) / 1000,
    attackDefense: Math.round(w.attackDefense * 1000) / 1000,
    manager: Math.round(w.manager * 1000) / 1000,
    referee: Math.round(w.referee * 1000) / 1000,
    lineup: Math.round(w.lineup * 1000) / 1000,
  };
}

// ── V3 Combine Models ─────────────────────────────────────────────
function combineV3Models(
  models: Record<string, ModelPrediction>,
  weights: ModelWeights
): { homeWinProb: number; drawProb: number; awayWinProb: number; homeExpectedGoals: number; awayExpectedGoals: number } {
  const modelList = [models.elo, models.poisson, models.xg, models.form, models.attackDefense, models.manager, models.referee, models.lineup];
  const weightList = [weights.elo, weights.poisson, weights.xg, weights.form, weights.attackDefense, weights.manager, weights.referee, weights.lineup];

  let totalRW = 0;
  const adjWeights = weightList.map((w, i) => { const aw = w * modelList[i].reliability; totalRW += aw; return aw; });

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

// ── V3 Situational Assessment ─────────────────────────────────────
function assessV3Situation(
  homeStats: any, awayStats: any,
  isDerby: boolean, isNeutralGround: boolean,
  travelDistance: number,
  weatherCode: number, weatherDesc: string | null,
  windSpeed: number, temperature: number,
  leagueId: number
): SituationalFactorsV3 {
  const notes: string[] = [];
  const homeMotivation = assessMotivation(homeStats);
  const awayMotivation = assessMotivation(awayStats);
  const motivationGap = motivationToScore(homeMotivation) - motivationToScore(awayMotivation);

  // Weather impact
  let weatherImpact: WeatherImpact | null = null;
  if (weatherCode >= 3 || windSpeed > 30 || (temperature !== 0 && temperature < 0)) {
    let goalReduction = 0;
    let bttsReduction = 0;
    if (weatherCode === 3) { goalReduction = 0.05; bttsReduction = 0.03; notes.push('Rain — slightly reduced goal expectation'); }
    if (weatherCode === 4) { goalReduction = 0.12; bttsReduction = 0.08; notes.push('Snow — significantly reduced goal expectation'); }
    if (weatherCode === 5) { goalReduction = 0.2; bttsReduction = 0.12; notes.push('Extreme weather — major goal reduction'); }
    if (windSpeed > 40) { goalReduction += 0.08; bttsReduction += 0.04; notes.push('Strong wind — disrupts long balls and crosses'); }
    if (temperature < 0) { goalReduction += 0.03; notes.push('Freezing conditions — slow pitch'); }

    weatherImpact = {
      code: weatherCode,
      description: weatherDesc || '',
      windSpeed,
      temperature,
      goalReduction: clamp(goalReduction, 0, 0.3),
      bttsReduction: clamp(bttsReduction, 0, 0.2),
    };
  }

  const travelFactor = isDerby ? 0.1 : Math.min(1, travelDistance / 3000);

  return {
    isDerby, isNeutralGround,
    homeMotivation, awayMotivation, motivationGap,
    homeFatigue: estimateFatigue(homeStats),
    awayFatigue: estimateFatigue(awayStats),
    travelFactor,
    dataQuality: assessDataQuality(homeStats, awayStats),
    sampleSizeWarning: (homeStats?.matchesPlayed ?? 0) < 5 || (awayStats?.matchesPlayed ?? 0) < 5,
    notes,
    weatherImpact,
    altitudeFactor: 0,
    fixtureCongestion: { home: 0, away: 0 },
  };
}

function assessMotivation(stats: any): MotivationLevel {
  if (!stats || stats.matchesPlayed < 5) return 'medium';
  const pos = stats.leaguePosition || stats.position || 10;
  if (pos >= 18) return 'must-win';
  if (pos <= 3) return 'high';
  if (pos <= 6) return 'high';
  if (pos >= 16) return 'high';
  if (pos >= 7 && pos <= 14 && stats.matchesPlayed > 30) return 'dead-rubber';
  return 'medium';
}

function motivationToScore(level: MotivationLevel): number {
  return level === 'must-win' ? 1.0 : level === 'high' ? 0.8 : level === 'medium' ? 0.5 : level === 'low' ? 0.3 : 0.1;
}

function estimateFatigue(stats: any): number {
  if (!stats) return 0.3;
  const mp = stats.matchesPlayed || 0;
  return mp > 35 ? 0.7 : mp > 25 ? 0.5 : mp > 15 ? 0.3 : 0.15;
}

function assessDataQuality(home: any, away: any): number {
  if (!home && !away) return 0.05;
  let q = (!home || !away) ? 0.3 : 0.5;
  const min = Math.min(home?.matchesPlayed ?? 0, away?.matchesPlayed ?? 0);
  if (min >= 20) q += 0.3; else if (min >= 10) q += 0.2; else if (min >= 5) q += 0.1;
  if ((home?.xgf ?? 0) > 0 && (away?.xgf ?? 0) > 0) q += 0.15;
  return Math.min(1, q);
}

// ── V3 Market Data ────────────────────────────────────────────────
function buildV3MarketData(oddsRow: any, polymarketRow: any): MarketDataV3 {
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
    oddsMovement: null,
    polymarketPrices: polymarketRow ? {
      homeWin: Number(polymarketRow.home_win_price) || null,
      draw: Number(polymarketRow.draw_price) || null,
      awayWin: Number(polymarketRow.away_win_price) || null,
      over25: Number(polymarketRow.over_25_price) || null,
      bttsYes: Number(polymarketRow.btts_yes_price) || null,
    } : null,
  };
}

// ── V3 Risk Assessment ────────────────────────────────────────────
function assessV3Risk(
  models: Record<string, ModelPrediction>,
  weights: ModelWeights,
  situation: SituationalFactorsV3,
  market: MarketDataV3,
  lineup: LineupIntel,
  referee: RefereeIntel
): RiskAssessmentV3 {
  const riskFactors: string[] = [];
  const modelList = [models.elo, models.poisson, models.xg, models.form, models.attackDefense, models.manager, models.referee, models.lineup];
  const weightList = [weights.elo, weights.poisson, weights.xg, weights.form, weights.attackDefense, weights.manager, weights.referee, weights.lineup];
  const homeWinProbs = modelList.map((m) => m.homeWinProb);
  const disagreement = weightedStdDev(homeWinProbs, weightList);

  const dataReliabilityIssue = situation.dataQuality < 0.4;
  if (dataReliabilityIssue) riskFactors.push('Insufficient data');
  let situationalRisk = false;
  if (situation.isDerby) { situationalRisk = true; riskFactors.push('Derby match'); }
  if (situation.weatherImpact) { situationalRisk = true; riskFactors.push('Weather conditions'); }

  let marketRisk = false;
  if (market.impliedHomeWin && market.impliedAwayWin) {
    const modelFav = Math.max(...homeWinProbs);
    const marketFav = Math.max(market.impliedHomeWin, market.impliedAwayWin);
    if (Math.abs(modelFav - marketFav) > 0.15) { marketRisk = true; riskFactors.push('Model vs market disagreement'); }
  }
  if (!market.homeWinOdds) { marketRisk = true; riskFactors.push('No odds data'); }

  const lineupRisk = lineup.lineupStatus === 'unavailable' || lineup.homeKeyAbsences.length > 2 || lineup.awayKeyAbsences.length > 2;
  if (lineupRisk) riskFactors.push('Lineup uncertainty');
  const weatherRisk = situation.weatherImpact !== null && situation.weatherImpact.goalReduction > 0.1;
  const refereeRisk = referee.referee !== null && Math.abs(referee.over25Modifier) > 0.05;
  const managerUncertainty = models.manager.reliability < 0.2;

  let riskScore = clamp(disagreement * 2.5, 0, 0.25);
  if (dataReliabilityIssue) riskScore += clamp(1 - situation.dataQuality, 0, 0.25);
  if (situationalRisk) riskScore += 0.15;
  if (marketRisk) riskScore += 0.15;
  if (lineupRisk) riskScore += 0.1;
  riskScore = clamp(riskScore, 0, 1);

  let riskLevel: RiskAssessmentV3['riskLevel'] = 'very-low';
  if (riskScore > 0.7) riskLevel = 'avoid';
  else if (riskScore > 0.55) riskLevel = 'very-high';
  else if (riskScore > 0.4) riskLevel = 'high';
  else if (riskScore > 0.25) riskLevel = 'medium';
  else if (riskScore > 0.1) riskLevel = 'low';

  // Base confidence from model agreement
  const drawProbs = modelList.map((m) => m.drawProb);
  const totalDisagreement = (disagreement + weightedStdDev(drawProbs, weightList)) / 2;
  let baseConfidence = clamp(1 - totalDisagreement * 4, 0.05, 0.95);
  const totalW = weightList.reduce((s, w) => s + w, 0);
  if (totalW > 0) {
    const reliabilityBoost = modelList.reduce((s, m, i) => s + m.reliability * (weightList[i] / totalW), 0);
    baseConfidence = baseConfidence * 0.6 + reliabilityBoost * 0.4;
  }
  const adjustedConfidence = clamp(baseConfidence * (1 - riskScore * 0.6), 0.05, 1);

  return {
    riskLevel, riskScore, modelDisagreement: disagreement,
    dataReliabilityIssue, situationalRisk, marketRisk,
    riskFactors, adjustedConfidence,
    lineupRisk, weatherRisk, refereeRisk, managerUncertainty,
  };
}

// ── V3 Value Bet Detection ────────────────────────────────────────
function detectV3ValueBets(
  markets: FullMarketProbs,
  market: MarketDataV3,
  risk: RiskAssessmentV3
): ValueBetV3[] {
  const valueBets: ValueBetV3[] = [];
  const edgeThreshold = market.overround !== null && market.overround < 0.05 ? 0.04 : 0.06;

  // 1X2
  if (market.homeWinOdds) {
    valueBets.push(...evaluateV3Market('1X2', 'Home Win', markets.homeWin, market.homeWinOdds, edgeThreshold, risk, 'primary'));
  }
  if (market.drawOdds) {
    valueBets.push(...evaluateV3Market('1X2', 'Draw', markets.draw, market.drawOdds, edgeThreshold, risk, 'primary'));
  }
  if (market.awayWinOdds) {
    valueBets.push(...evaluateV3Market('1X2', 'Away Win', markets.awayWin, market.awayWinOdds, edgeThreshold, risk, 'primary'));
  }

  // Over/Under
  if (market.over15Odds) valueBets.push(...evaluateV3Market('Over/Under 1.5', 'Over 1.5', markets.over15, market.over15Odds, edgeThreshold, risk, 'secondary'));
  if (market.over25Odds) valueBets.push(...evaluateV3Market('Over/Under 2.5', 'Over 2.5', markets.over25, market.over25Odds, edgeThreshold, risk, 'primary'));
  if (market.over35Odds) valueBets.push(...evaluateV3Market('Over/Under 3.5', 'Over 3.5', markets.over35, market.over35Odds, edgeThreshold, risk, 'secondary'));
  if (market.bttsYesOdds) valueBets.push(...evaluateV3Market('BTTS', 'Yes', markets.bttsYes, market.bttsYesOdds, edgeThreshold, risk, 'primary'));

  // Double Chance
  if (market.doubleChance1XOdds) valueBets.push(...evaluateV3Market('Double Chance', '1X', markets.doubleChance1X, market.doubleChance1XOdds, edgeThreshold, risk, 'secondary'));
  if (market.doubleChance12Odds) valueBets.push(...evaluateV3Market('Double Chance', '12', markets.doubleChance12, market.doubleChance12Odds, edgeThreshold, risk, 'secondary'));
  if (market.doubleChanceX2Odds) valueBets.push(...evaluateV3Market('Double Chance', 'X2', markets.doubleChanceX2, market.doubleChanceX2Odds, edgeThreshold, risk, 'secondary'));

  // DNB
  if (market.dnbHomeOdds) valueBets.push(...evaluateV3Market('Draw No Bet', 'Home', markets.dnbHome, market.dnbHomeOdds, edgeThreshold, risk, 'secondary'));
  if (market.dnbAwayOdds) valueBets.push(...evaluateV3Market('Draw No Bet', 'Away', markets.dnbAway, market.dnbAwayOdds, edgeThreshold, risk, 'secondary'));

  valueBets.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
  return valueBets;
}

function evaluateV3Market(
  marketName: string, selection: string,
  modelProb: number, odds: number,
  edgeThreshold: number, risk: RiskAssessmentV3,
  marketType: 'primary' | 'secondary' | 'exotic'
): ValueBetV3[] {
  const impProb = impliedProbability(odds);
  const edge = modelProb - impProb;
  const confidence = risk.adjustedConfidence;
  const riskMultiplier = risk.riskLevel === 'very-high' || risk.riskLevel === 'avoid' ? 0.2
    : risk.riskLevel === 'high' ? 0.4 : risk.riskLevel === 'medium' ? 0.6 : 0.8;

  const rawKelly = kellyCriterion(modelProb, odds);
  const adjustedKelly = clamp(rawKelly * 0.25 * confidence * riskMultiplier, 0, 0.1);
  const valueRating = Math.min(5, Math.max(1, Math.round(edge * confidence / 0.08 * 5)));

  const isActionable = edge > edgeThreshold && confidence > 0.3 && risk.riskLevel !== 'avoid' && adjustedKelly > 0.005;

  // Safety class
  let safetyClass: ValueBetV3['safetyClass'] = 'moderate';
  if (edge > 0.1 && confidence > 0.6 && risk.riskLevel === 'low') safetyClass = 'safe';
  else if (risk.riskLevel === 'high' || risk.riskLevel === 'very-high') safetyClass = 'risky';
  else if (risk.riskLevel === 'avoid') safetyClass = 'avoid';

  if (edge <= edgeThreshold) return [];

  return [{
    market: marketName, selection, modelProbability: modelProb,
    impliedProbability: impProb, odds, edge,
    kellyStake: rawKelly * 0.25, adjustedKelly, valueRating,
    isActionable, marketType, safetyClass,
  }];
}

// ── V3 Punter Decision ────────────────────────────────────────────
function makeV3Decision(
  risk: RiskAssessmentV3,
  situation: SituationalFactorsV3,
  market: MarketDataV3,
  valueBets: ValueBetV3[],
  homeWinProb: number,
  awayWinProb: number
): PunterDecisionV3 {
  // Absolute blocks
  if (risk.riskLevel === 'avoid') {
    return { action: 'pass', reasoning: 'Too risky — ' + risk.riskFactors.slice(0, 2).join(', '), primaryRecommendation: null, decisionConfidence: 0.9, isContrarian: false, isSafePlay: false, riskRewardScore: 0, bestMarket: null, bestSelection: null, bestOdds: null };
  }
  if (situation.homeMotivation === 'dead-rubber' && situation.awayMotivation === 'dead-rubber') {
    return { action: 'pass', reasoning: 'Dead rubber — both teams have nothing to play for', primaryRecommendation: null, decisionConfidence: 0.85, isContrarian: false, isSafePlay: false, riskRewardScore: 0.1, bestMarket: null, bestSelection: null, bestOdds: null };
  }

  const confidence = risk.adjustedConfidence;
  const maxProb = Math.max(homeWinProb, awayWinProb);
  const bestVb = valueBets.find(vb => vb.isActionable && vb.safetyClass !== 'avoid') ?? null;
  const hasValue = bestVb !== null;
  const hasStrongValue = bestVb !== null && (bestVb.edge ?? 0) > 0.10;
  const safeValueBets = valueBets.filter(vb => vb.isActionable && vb.safetyClass === 'safe');

  // Model-market alignment
  const aligned = market.impliedHomeWin && market.impliedAwayWin
    ? (homeWinProb > awayWinProb ? market.impliedHomeWin > market.impliedAwayWin : market.impliedAwayWin > market.impliedHomeWin)
    : true;

  let isSafePlay = aligned && hasValue && (risk.riskLevel === 'low' || risk.riskLevel === 'very-low');
  let isContrarian = !aligned && hasValue && confidence > 0.5;

  // Risk-reward score
  let riskRewardScore = 0;
  if (bestVb && bestVb.edge) {
    const rm = risk.riskLevel === 'very-low' ? 1.2 : risk.riskLevel === 'low' ? 1.0 : risk.riskLevel === 'medium' ? 0.7 : 0.4;
    riskRewardScore = clamp(bestVb.edge * confidence * rm * 5, 0, 1);
  }

  let action: PunterDecisionV3['action'] = 'pass';
  let reasoning = '';
  let decisionConfidence = 0;

  // SAFETY FIRST: Strong bet only when everything aligns
  if (confidence > 0.65 && hasStrongValue && (risk.riskLevel === 'very-low' || risk.riskLevel === 'low') && aligned && maxProb > 0.45) {
    action = 'strong-bet';
    reasoning = 'High confidence, strong value, low risk — the punter goes big';
    decisionConfidence = 0.85;
  } else if (confidence > 0.5 && hasValue && risk.riskLevel !== 'very-high' && maxProb > 0.4) {
    action = 'bet';
    reasoning = aligned ? 'Good confidence with value — model and market agree' : 'Value detected despite market disagreement — contrarian play';
    decisionConfidence = 0.7;
  } else if (confidence > 0.35 && hasValue && risk.riskLevel !== 'very-high') {
    action = 'small-bet';
    reasoning = 'Moderate confidence with edge — worth a small punt';
    decisionConfidence = 0.55;
  } else if (confidence > 0.3 && (hasValue || maxProb > 0.45)) {
    action = 'watch';
    reasoning = 'Interesting but not enough conviction to bet';
    decisionConfidence = 0.4;
  } else {
    action = 'pass';
    reasoning = !hasValue ? 'No value detected — market has this priced right' : 'Risk too high — the punter walks away';
    decisionConfidence = 0.6;
  }

  // Determine best market recommendation
  let bestMarket: string | null = null;
  let bestSelection: string | null = null;
  let bestOdds: number | null = null;

  // Prefer safe bets first
  if (safeValueBets.length > 0) {
    bestMarket = safeValueBets[0].market;
    bestSelection = safeValueBets[0].selection;
    bestOdds = safeValueBets[0].odds;
  } else if (bestVb) {
    bestMarket = bestVb.market;
    bestSelection = bestVb.selection;
    bestOdds = bestVb.odds;
  }

  return { action, reasoning, primaryRecommendation: bestSelection ? `${bestSelection} in ${bestMarket}` : null, decisionConfidence, isContrarian, isSafePlay, riskRewardScore, bestMarket, bestSelection, bestOdds };
}
