import type { TeamStats, EloRating, LeagueAvgData, EnsemblePrediction } from './types';
import { updateEloRatings, getEloRatings, isCacheBuilt } from './elo';
import { generateEnsemblePrediction } from './ensemble';

const BSD_API_KEY = '631a48f45a20b3352ea3863f8aa23baf610710e2';
const BSD_BASE_URL = 'https://sports.bzzoiro.com/api/v2/';

// ── In-memory cache with TTL ──────────────────────────────────────
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

// ── BSD API fetch helper ──────────────────────────────────────────
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

// ── BSD API response types ────────────────────────────────────────
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

// ── Convert BSD standing to our TeamStats ─────────────────────────
function standingToTeamStats(
  s: BsdStanding,
  leagueId: number,
  leagueName: string
): TeamStats {
  // Estimate home/away split (BSD doesn't provide this directly)
  // Assume roughly half matches are home and half away
  const homeMatches = Math.ceil(s.played / 2);
  const awayMatches = s.played - homeMatches;

  // Estimate home goals as ~57% of total scored (common football ratio)
  const homeGoalsScored = Math.round(s.gf * 0.57);
  const awayGoalsScored = s.gf - homeGoalsScored;
  const homeGoalsConceded = Math.round(s.ga * 0.43);
  const awayGoalsConceded = s.ga - homeGoalsConceded;

  // Estimate home/away W/D/L split
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
    xgf: s.xgf ?? s.gf, // Fall back to actual goals if xG unavailable
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

/**
 * Calculate league average data from standings.
 */
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

  // Each match contributes to both home and away scoring
  const avgGoalsPerMatch = totalMatches > 0 ? totalGoals / totalMatches : 1.25;
  const avgGoalsScored = avgGoalsPerMatch;
  const avgGoalsConceded = avgGoalsPerMatch; // symmetry

  // Home teams score about 54% of goals
  const avgHomeGoals = avgGoalsPerMatch * 0.54;
  const avgAwayGoals = avgGoalsPerMatch * 0.46;

  const avgXgf = totalMatches > 0 ? totalXgf / totalMatches : avgGoalsPerMatch;
  const avgXga = totalMatches > 0 ? totalXga / totalMatches : avgGoalsPerMatch;

  return { avgHomeGoals, avgAwayGoals, avgGoalsScored, avgGoalsConceded, avgXgf, avgXga };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Generate predictions for a list of upcoming events.
 *
 * Steps:
 * 1. Fetch upcoming events from BSD API
 * 2. For each unique league, fetch standings (for team stats/xG/form)
 * 3. Fetch recent match results (for Elo calculation)
 * 4. Build Elo ratings from match history
 * 5. Run all 5 models for each event
 * 6. Combine with ensemble
 * 7. Return predictions
 */
export async function generatePredictions(params?: {
  dateFrom?: string;
  dateTo?: string;
  leagueId?: number;
  limit?: number;
}): Promise<EnsemblePrediction[]> {
  const limit = params?.limit ?? 100;

  // Step 1: Fetch upcoming events
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
      setCache(cacheKey, events, 5 * 60 * 1000); // 5 min cache
    } catch (err) {
      console.error('Failed to fetch events:', err);
      return [];
    }
  }

  if (!events || events.length === 0) return [];

  // Step 2: Fetch standings for unique leagues
  const leagueIds = [...new Set(events.map((e) => e.league_id))];
  const standingsMap = new Map<number, TeamStats[]>(); // leagueId -> TeamStats[]

  for (const leagueId of leagueIds) {
    const standingsCacheKey = `standings_${leagueId}`;
    let teamStats = getCached<TeamStats[]>(standingsCacheKey);

    if (!teamStats) {
      try {
        const data = await fetchBSD<BsdStandingsResponse>(
          `leagues/${leagueId}/standings/`
        );
        const leagueName = `League ${leagueId}`;
        teamStats = (data.standings || []).map((s) =>
          standingToTeamStats(s, leagueId, leagueName)
        );
        setCache(standingsCacheKey, teamStats, 10 * 60 * 1000); // 10 min cache
      } catch (err) {
        console.error(`Failed to fetch standings for league ${leagueId}:`, err);
        teamStats = [];
      }
    }

    standingsMap.set(leagueId, teamStats);
  }

  // Step 3: Fetch recent match results for Elo calculation
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
        const now = new Date();
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const dateFrom = monthAgo.toISOString().split('T')[0];

        const data = await fetchBSD<{ results?: BsdEvent[] }>(
          `events/?status=finished&date_from=${dateFrom}&limit=500`
        );

        recentMatches = (data.results || [])
          .filter((e) => e.home_score !== null && e.away_score !== null)
          .map((e) => ({
            homeTeamId: e.home_team_id,
            awayTeamId: e.away_team_id,
            homeScore: e.home_score!,
            awayScore: e.away_score!,
          }));

        setCache(resultsCacheKey, recentMatches, 15 * 60 * 1000); // 15 min cache
      }

      // Step 4: Build Elo ratings
      updateEloRatings(recentMatches);
    } catch (err) {
      console.error('Failed to build Elo ratings:', err);
      // Continue with default Elo ratings
    }
  }

  const eloRatings: Map<number, EloRating> = getEloRatings();

  // Step 5 & 6: Run all models and combine for each event
  const predictions: EnsemblePrediction[] = [];

  for (const event of events) {
    try {
      const leagueStandings = standingsMap.get(event.league_id) || [];
      const homeStats =
        leagueStandings.find((t) => t.teamId === event.home_team_id) ?? null;
      const awayStats =
        leagueStandings.find((t) => t.teamId === event.away_team_id) ?? null;

      const leagueAvgData = calculateLeagueAvgData(leagueStandings);

      const prediction = generateEnsemblePrediction(
        {
          eventId: event.id,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          homeTeamId: event.home_team_id,
          awayTeamId: event.away_team_id,
          leagueId: event.league_id,
          leagueName: homeStats?.leagueName || awayStats?.leagueName || `League ${event.league_id}`,
          eventDate: event.event_date,
          status: event.status,
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
      // Skip this event gracefully
    }
  }

  return predictions;
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
