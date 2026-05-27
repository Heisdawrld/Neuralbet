// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Data Pipeline & Public API
//
// This is the orchestrator. It:
// 1. Fetches raw data from BSD API (NOT /predictions/)
// 2. Runs all 5 statistical models
// 3. Applies situational intelligence
// 4. Reads the market
// 5. Assesses risk
// 6. Makes the punter's decision
// 7. Returns the full prediction with all intelligence layers
// ═══════════════════════════════════════════════════════════════════════

import type { TeamStats, EloRating, LeagueAvgData, PunterPrediction, ModelPrediction } from './types';
import { updateEloRatings, getEloRatings, isCacheBuilt, calculateEloPrediction } from './elo';
import { calculatePoissonPrediction } from './poisson';
import { calculateXgPrediction } from './xg-model';
import { calculateAttackDefensePrediction } from './attack-defense';
import { calculateFormPrediction } from './form';
import { calculateDynamicWeights, combineModels, makePunterDecision, ENGINE_VERSION } from './punter-brain';
import { assessSituation, applySituationalAdjustments } from './intelligence/situational';
import { buildMarketData, detectValueBets } from './intelligence/market';
import { assessRisk, calculateBaseConfidence } from './intelligence/risk';
import { buildGoalMatrix, calculateDerivedMarkets, clamp, neutralPrediction } from './utils';

const BSD_API_KEY = process.env.BSD_API_KEY || '631a48f45a20b3352ea3863f8aa23baf610710e2';
const BSD_BASE_URL = 'https://sports.bzzoiro.com/api/v2/';

// ── In-memory cache with TTL ──────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

// ── BSD API fetch helper ──────────────────────────────────────────────
async function fetchBSD<T>(path: string): Promise<T> {
  const url = `${BSD_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${BSD_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`BSD API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── BSD API response types ────────────────────────────────────────────
interface BsdEvent {
  id: number;
  league_id: number;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  event_date: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  is_local_derby?: boolean;
  is_neutral_ground?: boolean;
}

interface BsdStanding {
  position: number;
  team_id: number;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  xgf: number | null;
  xga: number | null;
  xgd: number | null;
  xg_games: number | null;
  form: string | null;
  live: boolean;
}

interface BsdStandingsResponse {
  league_id: number;
  standings: BsdStanding[];
}

interface BsdOdds {
  event_id: number;
  odds: {
    home_win: number | null;
    draw: number | null;
    away_win: number | null;
    over_15_goals: number | null;
    over_25_goals: number | null;
    over_35_goals: number | null;
    under_15_goals: number | null;
    under_25_goals: number | null;
    under_35_goals: number | null;
    btts_yes: number | null;
    btts_no: number | null;
  };
}

interface BsdLeague {
  id: number;
  name: string;
  country: string;
}

// ── Convert BSD standing to our TeamStats ─────────────────────────────
function standingToTeamStats(
  s: BsdStanding,
  leagueId: number,
  leagueName: string
): TeamStats {
  const homeMatches = Math.ceil(s.played / 2);
  const awayMatches = s.played - homeMatches;

  const homeGoalsScored = Math.round(s.gf * 0.57);
  const awayGoalsScored = s.gf - homeGoalsScored;
  const homeGoalsConceded = Math.round(s.ga * 0.43);
  const awayGoalsConceded = s.ga - homeGoalsConceded;

  const homeWins = Math.round(s.won * 0.6);
  const homeDraws = Math.round(s.drawn * 0.5);
  const homeLosses = homeMatches - homeWins - homeDraws;
  const awayWins = s.won - homeWins;
  const awayDraws = s.drawn - homeDraws;
  const awayLosses = awayMatches - awayWins - awayDraws;

  return {
    teamId: s.team_id,
    teamName: s.team_name,
    matchesPlayed: s.played,
    goalsScored: s.gf,
    goalsConceded: s.ga,
    xgf: s.xgf ?? s.gf,
    xga: s.xga ?? s.ga,
    wins: s.won,
    draws: s.drawn,
    losses: s.lost,
    form: s.form ?? '',
    homeMatches,
    homeGoalsScored,
    homeGoalsConceded,
    homeWins: Math.max(0, homeWins),
    homeDraws: Math.max(0, homeDraws),
    homeLosses: Math.max(0, homeLosses),
    awayMatches,
    awayGoalsScored,
    awayGoalsConceded,
    awayWins: Math.max(0, awayWins),
    awayDraws: Math.max(0, awayDraws),
    awayLosses: Math.max(0, awayLosses),
    leaguePosition: s.position,
    leagueId,
    leagueName,
    points: s.pts,
    xgd: s.xgd ?? 0,
  };
}

function calculateLeagueAvgData(standings: TeamStats[]): LeagueAvgData {
  if (standings.length === 0) {
    return {
      avgHomeGoals: 1.35,
      avgAwayGoals: 1.15,
      avgGoalsScored: 1.25,
      avgGoalsConceded: 1.25,
      avgXgf: 1.25,
      avgXga: 1.25,
    };
  }

  const totalMatches = standings.reduce((s, t) => s + t.matchesPlayed, 0);
  const totalGoals = standings.reduce((s, t) => s + t.goalsScored, 0);
  const totalXgf = standings.reduce((s, t) => s + t.xgf, 0);
  const totalXga = standings.reduce((s, t) => s + t.xga, 0);

  const avgGoalsPerMatch = totalMatches > 0 ? totalGoals / totalMatches : 1.25;
  const avgHomeGoals = avgGoalsPerMatch * 0.54;
  const avgAwayGoals = avgGoalsPerMatch * 0.46;
  const avgXgf = totalMatches > 0 ? totalXgf / totalMatches : avgGoalsPerMatch;
  const avgXga = totalMatches > 0 ? totalXga / totalMatches : avgGoalsPerMatch;

  return {
    avgHomeGoals,
    avgAwayGoals,
    avgGoalsScored: avgGoalsPerMatch,
    avgGoalsConceded: avgGoalsPerMatch,
    avgXgf,
    avgXga,
  };
}

// ── League name cache ─────────────────────────────────────────────────
const leagueNameCache = new Map<number, string>();

async function fetchLeagueName(leagueId: number): Promise<string> {
  if (leagueNameCache.has(leagueId)) return leagueNameCache.get(leagueId)!;

  try {
    const data = await fetchBSD<BsdLeague>(`leagues/${leagueId}/`);
    const name = data.name || `League ${leagueId}`;
    leagueNameCache.set(leagueId, name);
    return name;
  } catch {
    return `League ${leagueId}`;
  }
}

// ══════════════════════════════════════════════════════════════════════
// PUBLIC API — Generate Full Punter Predictions
// ══════════════════════════════════════════════════════════════════════

export async function generatePredictions(params?: {
  dateFrom?: string;
  dateTo?: string;
  leagueId?: number;
  limit?: number;
}): Promise<PunterPrediction[]> {
  const limit = params?.limit ?? 100;

  // ── Step 1: Fetch upcoming events ────────────────────────────────
  const cacheKey = `events_${params?.dateFrom ?? ''}_${params?.dateTo ?? ''}_${params?.leagueId ?? ''}_${limit}`;
  let events = getCached<BsdEvent[]>(cacheKey);

  if (!events) {
    try {
      let eventPath = `events/?status=notstarted&limit=${limit}`;
      if (params?.dateFrom) eventPath += `&date_from=${params.dateFrom}`;
      if (params?.dateTo) eventPath += `&date_to=${params.dateTo}`;
      if (params?.leagueId) eventPath += `&league_id=${params.leagueId}`;

      const data = await fetchBSD<{ results?: BsdEvent[] }>(eventPath);
      events = data.results || [];
      setCache(cacheKey, events, 5 * 60 * 1000);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      return [];
    }
  }

  if (!events || events.length === 0) return [];

  // ── Step 2: Fetch standings for unique leagues ───────────────────
  const leagueIds = [...new Set(events.map((e) => e.league_id))];
  const standingsMap = new Map<number, TeamStats[]>();
  const leagueNameMap = new Map<number, string>();

  for (const leagueId of leagueIds) {
    // Fetch league name (with cache)
    const nameCacheKey = `leaguename_${leagueId}`;
    let leagueName = getCached<string>(nameCacheKey);
    if (!leagueName) {
      leagueName = await fetchLeagueName(leagueId);
      setCache(nameCacheKey, leagueName, 30 * 60 * 1000); // 30 min cache
    }
    leagueNameMap.set(leagueId, leagueName);

    // Fetch standings
    const standingsCacheKey = `standings_${leagueId}`;
    let teamStats = getCached<TeamStats[]>(standingsCacheKey);

    if (!teamStats) {
      try {
        const data = await fetchBSD<BsdStandingsResponse>(
          `leagues/${leagueId}/standings/`
        );
        teamStats = (data.standings || []).map((s) =>
          standingToTeamStats(s, leagueId, leagueName!)
        );
        setCache(standingsCacheKey, teamStats, 10 * 60 * 1000);
      } catch (err) {
        console.error(`Failed to fetch standings for league ${leagueId}:`, err);
        teamStats = [];
      }
    }

    standingsMap.set(leagueId, teamStats);
  }

  // ── Step 3: Build Elo ratings ────────────────────────────────────
  if (!isCacheBuilt()) {
    try {
      const resultsCacheKey = 'recent_results_elo';
      let recentMatches = getCached<
        Array<{
          homeTeamId: number;
          awayTeamId: number;
          homeScore: number;
          awayScore: number;
        }>
      >(resultsCacheKey);

      if (!recentMatches) {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];

        const data = await fetchBSD<{ results?: BsdEvent[] }>(
          `events/?status=finished&date_from=${monthAgo}&limit=500`
        );

        recentMatches = (data.results || [])
          .filter((e) => e.home_score !== null && e.away_score !== null)
          .map((e) => ({
            homeTeamId: e.home_team_id,
            awayTeamId: e.away_team_id,
            homeScore: e.home_score!,
            awayScore: e.away_score!,
          }));

        setCache(resultsCacheKey, recentMatches, 15 * 60 * 1000);
      }

      updateEloRatings(recentMatches);
    } catch (err) {
      console.error('Failed to build Elo ratings:', err);
    }
  }

  const eloRatings: Map<number, EloRating> = getEloRatings();

  // ── Step 4: Run full pipeline for each event ─────────────────────
  const predictions: PunterPrediction[] = [];

  for (const event of events) {
    try {
      const leagueStandings = standingsMap.get(event.league_id) || [];
      const homeStats = leagueStandings.find((t) => t.teamId === event.home_team_id) ?? null;
      const awayStats = leagueStandings.find((t) => t.teamId === event.away_team_id) ?? null;
      const leagueAvgData = calculateLeagueAvgData(leagueStandings);
      const leagueName = leagueNameMap.get(event.league_id) || `League ${event.league_id}`;

      const prediction = generateFullPrediction(
        {
          eventId: event.id,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          homeTeamId: event.home_team_id,
          awayTeamId: event.away_team_id,
          leagueId: event.league_id,
          leagueName,
          eventDate: event.event_date,
          status: event.status,
          isDerby: event.is_local_derby ?? false,
          isNeutralGround: event.is_neutral_ground ?? false,
        },
        homeStats,
        awayStats,
        eloRatings,
        leagueAvgData
      );

      if (prediction) {
        predictions.push(prediction);
      }
    } catch (err) {
      console.error(`Failed to predict event ${event.id}:`, err);
    }
  }

  return predictions;
}

/**
 * Generate a full punter prediction for a single match.
 *
 * This is the COMPLETE pipeline:
 * 1. Run 5 statistical models
 * 2. Calculate dynamic weights
 * 3. Combine models
 * 4. Apply situational adjustments
 * 5. Build derived markets
 * 6. Fetch market data & detect value
 * 7. Assess risk
 * 8. Make punter decision
 */
function generateFullPrediction(
  event: {
    eventId: number;
    homeTeam: string;
    awayTeam: string;
    homeTeamId: number;
    awayTeamId: number;
    leagueId: number;
    leagueName: string;
    eventDate: string;
    status: string;
    isDerby: boolean;
    isNeutralGround: boolean;
  },
  homeStats: TeamStats | null,
  awayStats: TeamStats | null,
  eloRatings: Map<number, EloRating>,
  leagueAvgData: LeagueAvgData | null
): PunterPrediction | null {
  if (!homeStats && !awayStats && !leagueAvgData) return null;

  // Default stats when missing
  const defaultStats: TeamStats = {
    teamId: 0, teamName: '', matchesPlayed: 0, goalsScored: 0, goalsConceded: 0,
    xgf: 0, xga: 0, wins: 0, draws: 0, losses: 0, form: '',
    homeMatches: 0, homeGoalsScored: 0, homeGoalsConceded: 0,
    homeWins: 0, homeDraws: 0, homeLosses: 0,
    awayMatches: 0, awayGoalsScored: 0, awayGoalsConceded: 0,
    awayWins: 0, awayDraws: 0, awayLosses: 0,
    leaguePosition: 0, leagueId: event.leagueId, leagueName: event.leagueName,
    points: 0, xgd: 0,
  };

  const hStats = homeStats ?? { ...defaultStats, teamId: event.homeTeamId, teamName: event.homeTeam };
  const aStats = awayStats ?? { ...defaultStats, teamId: event.awayTeamId, teamName: event.awayTeam };

  const defaultLeagueAvg: LeagueAvgData = {
    avgHomeGoals: 1.35, avgAwayGoals: 1.15, avgGoalsScored: 1.25,
    avgGoalsConceded: 1.25, avgXgf: 1.25, avgXga: 1.25,
  };
  const leagueAvg = leagueAvgData ?? defaultLeagueAvg;

  // ══════════════════════════════════════════════════════════════════
  // PHASE 1: Run Statistical Models
  // ══════════════════════════════════════════════════════════════════

  const homeElo = eloRatings.get(event.homeTeamId);
  const awayElo = eloRatings.get(event.awayTeamId);

  const eloPred = calculateEloPrediction(homeElo, awayElo);

  const hasStatsData = hStats.matchesPlayed > 0 && aStats.matchesPlayed > 0;
  const poissonPred = hasStatsData
    ? calculatePoissonPrediction(hStats, aStats, leagueAvg)
    : neutralPrediction();

  const formPred = calculateFormPrediction(
    {
      homeForm: hStats.form || '',
      awayForm: aStats.form || '',
      homeGoalForm: hStats.matchesPlayed > 0 ? hStats.goalsScored / hStats.matchesPlayed : 1.2,
      awayGoalForm: aStats.matchesPlayed > 0 ? aStats.goalsScored / aStats.matchesPlayed : 1.0,
    },
    {
      homeForm: aStats.form ? aStats.form.split('').reverse().join('') : '',
      awayForm: hStats.form ? hStats.form.split('').reverse().join('') : '',
      homeGoalForm: aStats.matchesPlayed > 0 ? aStats.awayGoalsScored / Math.max(1, aStats.awayMatches) : 1.0,
      awayGoalForm: hStats.matchesPlayed > 0 ? hStats.homeGoalsScored / Math.max(1, hStats.homeMatches) : 1.2,
    }
  );

  const hasXgData = hStats.xgf > 0 && aStats.xgf > 0 && leagueAvg.avgXgf > 0;
  const xgPred = hasXgData
    ? calculateXgPrediction(hStats, aStats, leagueAvg)
    : neutralPrediction();

  const attackDefensePred = hasStatsData
    ? calculateAttackDefensePrediction(hStats, aStats, leagueAvg)
    : neutralPrediction();

  const models = {
    elo: eloPred,
    poisson: poissonPred,
    xg: xgPred,
    form: formPred,
    attackDefense: attackDefensePred,
  };

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2: Dynamic Weights & Model Combination
  // ══════════════════════════════════════════════════════════════════

  const weights = calculateDynamicWeights({
    models,
    hasStatsData,
    hasXgData,
    homeFormLength: hStats.form?.length ?? 0,
    awayFormLength: aStats.form?.length ?? 0,
    hasHomeElo: homeElo !== undefined,
    hasAwayElo: awayElo !== undefined,
  });

  const combined = combineModels(models, weights);

  // ══════════════════════════════════════════════════════════════════
  // PHASE 3: Situational Intelligence
  // ══════════════════════════════════════════════════════════════════

  const situation = assessSituation(
    homeStats,
    awayStats,
    event.isDerby,
    event.isNeutralGround,
    event.leagueId
  );

  // Apply situational adjustments to combined probabilities
  const adjusted = applySituationalAdjustments(
    combined.homeWinProb,
    combined.drawProb,
    combined.awayWinProb,
    situation
  );

  // ══════════════════════════════════════════════════════════════════
  // PHASE 4: Derived Markets
  // ══════════════════════════════════════════════════════════════════

  const goalMatrix = buildGoalMatrix(
    Math.max(0.3, combined.homeExpectedGoals),
    Math.max(0.2, combined.awayExpectedGoals),
    7, 0.1
  );
  const derivedMarkets = calculateDerivedMarkets(goalMatrix);

  // Determine predicted outcome
  let predicted: 'H' | 'D' | 'A';
  if (adjusted.homeWinProb >= adjusted.drawProb && adjusted.homeWinProb >= adjusted.awayWinProb) {
    predicted = 'H';
  } else if (adjusted.awayWinProb >= adjusted.drawProb && adjusted.awayWinProb >= adjusted.homeWinProb) {
    predicted = 'A';
  } else {
    predicted = 'D';
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 5: Market Intelligence (placeholder — will be filled by API route)
  // ══════════════════════════════════════════════════════════════════

  const market: import('./types').MarketData = {
    homeWinOdds: null, drawOdds: null, awayWinOdds: null,
    over25Odds: null, under25Odds: null, bttsYesOdds: null,
    over15Odds: null, over35Odds: null,
    impliedHomeWin: null, impliedDraw: null, impliedAwayWin: null,
    overround: null, marketConfidence: 0.1,
  };

  // ══════════════════════════════════════════════════════════════════
  // PHASE 6: Risk Assessment
  // ══════════════════════════════════════════════════════════════════

  const baseConfidence = calculateBaseConfidence(models, weights);
  const risk = assessRisk(models, weights, situation, market, baseConfidence);

  // ══════════════════════════════════════════════════════════════════
  // PHASE 7: Punter Decision
  // ══════════════════════════════════════════════════════════════════

  const decision = makePunterDecision(
    risk.adjustedConfidence,
    risk,
    situation,
    market,
    null, // No value bet data yet — will be enriched by API route
    adjusted.homeWinProb,
    adjusted.awayWinProb
  );

  // ══════════════════════════════════════════════════════════════════
  // PHASE 8: Build Recommendations
  // ══════════════════════════════════════════════════════════════════

  const favorite = adjusted.homeWinProb > adjusted.awayWinProb ? event.homeTeam : event.awayTeam;
  const favoriteProb = Math.max(adjusted.homeWinProb, adjusted.awayWinProb);

  const confidence = risk.adjustedConfidence;

  const recommendations = {
    favorite,
    favoriteProb,
    betFavorite: confidence > 0.45 && favoriteProb > 0.45 && decision.action !== 'pass',
    over15: derivedMarkets.over15Prob > 0.55 && decision.action !== 'pass',
    over25: derivedMarkets.over25Prob > 0.50 && confidence > 0.4 && decision.action !== 'pass',
    over35: derivedMarkets.over35Prob > 0.45 && confidence > 0.5 && decision.action !== 'pass',
    btts: derivedMarkets.bttsProb > 0.50 && confidence > 0.4 && decision.action !== 'pass',
    winner: confidence > 0.55 && favoriteProb > 0.50 && decision.action !== 'pass' && decision.action !== 'watch',
  };

  const isRecommended =
    recommendations.betFavorite ||
    recommendations.over25 ||
    recommendations.btts ||
    recommendations.winner;

  return {
    eventId: event.eventId,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    homeTeamId: event.homeTeamId,
    awayTeamId: event.awayTeamId,
    leagueId: event.leagueId,
    leagueName: event.leagueName,
    eventDate: event.eventDate,
    status: event.status,

    homeWinProb: Math.round(adjusted.homeWinProb * 10000) / 10000,
    drawProb: Math.round(adjusted.drawProb * 10000) / 10000,
    awayWinProb: Math.round(adjusted.awayWinProb * 10000) / 10000,
    predicted,
    homeExpectedGoals: combined.homeExpectedGoals,
    awayExpectedGoals: combined.awayExpectedGoals,

    over15Prob: Math.round(derivedMarkets.over15Prob * 10000) / 10000,
    over25Prob: Math.round(derivedMarkets.over25Prob * 10000) / 10000,
    over35Prob: Math.round(derivedMarkets.over35Prob * 10000) / 10000,
    bttsProb: Math.round(derivedMarkets.bttsProb * 10000) / 10000,
    mostLikelyScore: derivedMarkets.mostLikelyScore,

    models,
    weights,
    situational: situation,
    market,
    risk,
    decision,
    valueBets: [], // Will be filled by API route when odds are available

    confidence: Math.round(confidence * 10000) / 10000,
    recommendations,
    isRecommended,
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * Enrich a prediction with market data and value bets.
 * Called by API routes after fetching odds.
 */
export function enrichWithMarketData(
  prediction: PunterPrediction,
  odds: BsdOdds
): PunterPrediction {
  const market = buildMarketData(odds.odds);

  // Re-assess risk with market data
  const baseConfidence = calculateBaseConfidence(prediction.models, prediction.weights);
  const risk = assessRisk(prediction.models, prediction.weights, prediction.situational, market, baseConfidence);

  // Detect value bets
  const valueBets = detectValueBets(
    prediction.homeWinProb,
    prediction.drawProb,
    prediction.awayWinProb,
    prediction.over25Prob,
    prediction.over15Prob,
    prediction.over35Prob,
    prediction.bttsProb,
    market,
    prediction.homeTeam,
    prediction.awayTeam,
    risk.adjustedConfidence,
    risk.riskLevel
  );

  // Re-make punter decision with market data
  const bestValueBet = valueBets.length > 0 ? valueBets[0] : null;
  const decision = makePunterDecision(
    risk.adjustedConfidence,
    risk,
    prediction.situational,
    market,
    bestValueBet ? { edge: bestValueBet.edge, valueRating: bestValueBet.valueRating } : null,
    prediction.homeWinProb,
    prediction.awayWinProb
  );

  // Update recommendations with market-aware decision
  const confidence = risk.adjustedConfidence;
  const favorite = prediction.homeWinProb > prediction.awayWinProb ? prediction.homeTeam : prediction.awayTeam;
  const favoriteProb = Math.max(prediction.homeWinProb, prediction.awayWinProb);

  const recommendations = {
    favorite,
    favoriteProb,
    betFavorite: confidence > 0.45 && favoriteProb > 0.45 && decision.action !== 'pass',
    over15: prediction.over15Prob > 0.55 && decision.action !== 'pass',
    over25: prediction.over25Prob > 0.50 && confidence > 0.4 && decision.action !== 'pass',
    over35: prediction.over35Prob > 0.45 && confidence > 0.5 && decision.action !== 'pass',
    btts: prediction.bttsProb > 0.50 && confidence > 0.4 && decision.action !== 'pass',
    winner: confidence > 0.55 && favoriteProb > 0.50 && decision.action !== 'pass' && decision.action !== 'watch',
  };

  const isRecommended =
    recommendations.betFavorite ||
    recommendations.over25 ||
    recommendations.btts ||
    recommendations.winner;

  return {
    ...prediction,
    market,
    risk,
    decision,
    valueBets,
    confidence: Math.round(confidence * 10000) / 10000,
    recommendations,
    isRecommended,
  };
}

/**
 * Fetch odds for a specific event from BSD API.
 */
export async function fetchEventOdds(
  eventId: number
): Promise<BsdOdds | null> {
  const cacheKey = `odds_${eventId}`;
  const cached = getCached<BsdOdds>(cacheKey);
  if (cached) return cached;

  try {
    const odds = await fetchBSD<BsdOdds>(`events/${eventId}/odds/`);
    setCache(cacheKey, odds, 5 * 60 * 1000);
    return odds;
  } catch {
    return null;
  }
}
