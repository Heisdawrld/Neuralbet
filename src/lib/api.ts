import type {
  ApiEvent,
  ApiPrediction,
  ApiOdds,
  ApiStandingsResponse,
  MatchData,
  PredictionData,
  OddsData,
  StandingData,
  OurPredictionData,
  OurPredictionDataWithId,
  OurValueBetData,
  PunterTipV4Data,
  TipQuality,
} from './types';

const API_BASE = '/api/football';

async function fetchAPI<T>(params: Record<string, string>): Promise<T> {
  const searchParams = new URLSearchParams(params);
  const res = await fetch(`${API_BASE}?${searchParams.toString()}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

function normalizeEvent(e: ApiEvent): MatchData {
  return {
    id: e.id,
    homeTeam: e.home_team,
    awayTeam: e.away_team,
    homeTeamId: e.home_team_id,
    awayTeamId: e.away_team_id,
    leagueId: e.league_id,
    leagueName: '',
    eventDate: e.event_date,
    status: e.status,
    homeScore: e.home_score,
    awayScore: e.away_score,
    currentMinute: e.current_minute,
    period: e.period,
  };
}

function normalizePrediction(p: ApiPrediction): PredictionData {
  const isRecommended =
    p.recommendations.bet_favorite ||
    p.recommendations.over_25 ||
    p.recommendations.btts ||
    p.recommendations.winner;

  return {
    id: p.id,
    match: {
      id: p.event.id,
      homeTeam: p.event.home_team,
      awayTeam: p.event.away_team,
      homeTeamId: p.event.home_team_id,
      awayTeamId: p.event.away_team_id,
      leagueId: p.event.league_id,
      leagueName: p.event.league_name,
      eventDate: p.event.event_date,
      status: p.event.status,
      homeScore: null,
      awayScore: null,
      currentMinute: null,
      period: '',
    },
    homeWinProb: p.markets.match_result.prob_home / 100,
    drawProb: p.markets.match_result.prob_draw / 100,
    awayWinProb: p.markets.match_result.prob_away / 100,
    predicted: p.markets.match_result.predicted,
    homeXg: p.markets.expected_goals.home,
    awayXg: p.markets.expected_goals.away,
    over15Prob: p.markets.over_under.prob_over_15 / 100,
    over25Prob: p.markets.over_under.prob_over_25 / 100,
    over35Prob: p.markets.over_under.prob_over_35 / 100,
    bttsProb: p.markets.btts.prob_yes / 100,
    mostLikelyScore: p.markets.score.most_likely,
    confidence: p.model.confidence,
    recommendations: {
      favorite: p.recommendations.favorite,
      favoriteProb: p.recommendations.favorite_prob / 100,
      betFavorite: p.recommendations.bet_favorite,
      over15: p.recommendations.over_15,
      over25: p.recommendations.over_25,
      over35: p.recommendations.over_35,
      btts: p.recommendations.btts,
      winner: p.recommendations.winner,
    },
    isRecommended,
  };
}

// Convert OurPredictionData (Punter Brain v2) to legacy PredictionData for components
function normalizeOurPrediction(p: OurPredictionData): PredictionData {
  return {
    id: p.eventId,
    match: {
      id: p.eventId,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
      leagueId: p.leagueId,
      leagueName: p.leagueName,
      eventDate: p.eventDate,
      status: p.status,
      homeScore: null,
      awayScore: null,
      currentMinute: null,
      period: '',
    },
    homeWinProb: p.homeWinProb,
    drawProb: p.drawProb,
    awayWinProb: p.awayWinProb,
    predicted: p.predicted,
    homeXg: p.homeExpectedGoals,
    awayXg: p.awayExpectedGoals,
    over15Prob: p.over15Prob,
    over25Prob: p.over25Prob,
    over35Prob: p.over35Prob,
    bttsProb: p.bttsProb,
    mostLikelyScore: p.mostLikelyScore,
    confidence: p.confidence,
    recommendations: p.recommendations,
    isRecommended: p.isRecommended,
  };
}

// Events
export async function fetchEvents(dateFrom: string, dateTo: string, limit = 50) {
  const data = await fetchAPI<{ results?: ApiEvent[]; count?: number }>({
    endpoint: 'events/',
    date_from: dateFrom,
    date_to: dateTo,
    limit: String(limit),
  });
  return {
    results: (data.results || []).map(normalizeEvent),
    count: data.count || 0,
  };
}

export async function fetchLiveEvents() {
  const data = await fetchAPI<{ events?: ApiEvent[]; count?: number }>({
    endpoint: 'events/live/',
  });
  return {
    results: (data.events || []).map(normalizeEvent),
    count: data.count || 0,
  };
}

export async function fetchEventOdds(id: number): Promise<OddsData> {
  const data = await fetchAPI<ApiOdds>({ endpoint: `events/${id}/odds/` });
  return {
    eventId: data.event_id,
    homeWin: data.odds.home_win,
    draw: data.odds.draw,
    awayWin: data.odds.away_win,
    over15: data.odds.over_15_goals,
    over25: data.odds.over_25_goals,
    over35: data.odds.over_35_goals,
    bttsYes: data.odds.btts_yes,
  };
}

// Predictions (BSD API — kept for comparison)
export async function fetchPredictions(params?: { status?: string; limit?: number; recommended?: boolean }) {
  const p: Record<string, string> = { endpoint: 'predictions/', limit: String(params?.limit || 50) };
  if (params?.status) p.status = params.status;
  if (params?.recommended) p.recommended = 'true';
  const data = await fetchAPI<{ results?: ApiPrediction[]; count?: number }>(p);
  return {
    results: (data.results || []).map(normalizePrediction),
    count: data.count || 0,
  };
}

// Leagues
export async function fetchLeagues(limit = 200) {
  return fetchAPI<{ results?: Array<{ id: number; name: string; country: string; is_women: boolean; is_active: boolean; current_season: { id: number; name: string; year: number; start_date: string; end_date: string; is_current: boolean } | null }>; count?: number }>({
    endpoint: 'leagues/',
    limit: String(limit),
  });
}

export async function fetchLeagueStandings(leagueId: number): Promise<{ standings: StandingData[]; season: { name: string; year: number } }> {
  const data = await fetchAPI<ApiStandingsResponse>({
    endpoint: `leagues/${leagueId}/standings/`,
  });
  return {
    standings: (data.standings || []).map((s) => ({
      position: s.position,
      teamId: s.team_id,
      teamName: s.team_name,
      played: s.played,
      won: s.won,
      drawn: s.drawn,
      lost: s.lost,
      gf: s.gf,
      ga: s.ga,
      gd: s.gd,
      pts: s.pts,
      xgf: s.xgf,
      xga: s.xga,
      xgd: s.xgd,
      form: s.form,
      live: s.live,
    })),
    season: data.season,
  };
}

// Value Bets (BSD API — kept for comparison)
export async function fetchValueBets(): Promise<{ results: import('./types').ValueBetLegacy[]; count: number }> {
  const res = await fetch('/api/value-bets');
  if (!res.ok) throw new Error(`Value bets API error: ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v2 — Our Custom Engine
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch predictions from our Punter Brain v2 engine.
 * Returns both normalized (legacy) and raw (punter) data.
 */
export async function fetchOurPredictions(params?: {
  dateFrom?: string;
  dateTo?: string;
  leagueId?: number;
  limit?: number;
}): Promise<{
  results: PredictionData[];
  count: number;
  raw: OurPredictionData[];
}> {
  const searchParams = new URLSearchParams();
  if (params?.dateFrom) searchParams.set('date_from', params.dateFrom);
  if (params?.dateTo) searchParams.set('date_to', params.dateTo);
  if (params?.leagueId) searchParams.set('league_id', String(params.leagueId));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const res = await fetch(`/api/our-predictions?${searchParams.toString()}`);
  if (!res.ok) throw new Error(`Our predictions API error: ${res.status}`);
  const data: { results: OurPredictionData[]; count: number } = await res.json();
  return {
    results: (data.results || []).map(normalizeOurPrediction),
    count: data.count || 0,
    raw: data.results || [],
  };
}

export async function fetchOurValueBets(): Promise<{ results: OurValueBetData[]; count: number }> {
  const res = await fetch('/api/our-value-bets');
  if (!res.ok) throw new Error(`Our value bets API error: ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════
// PUNTER BRAIN v4 — THE SNIPER
//
// Study everything. Pick ONE. Or walk away.
// ═══════════════════════════════════════════════════════════════════════

export async function fetchV4Tips(params?: {
  dateFrom?: string;
  dateTo?: string;
  leagueId?: number;
  limit?: number;
  minQuality?: TipQuality;
}): Promise<{
  results: PunterTipV4Data[];
  count: number;
  stats: { gold: number; silver: number; bronze: number; skipped: number; withTip: number };
  engineVersion: string;
}> {
  const searchParams = new URLSearchParams();
  if (params?.dateFrom) searchParams.set('date_from', params.dateFrom);
  if (params?.dateTo) searchParams.set('date_to', params.dateTo);
  if (params?.leagueId) searchParams.set('league_id', String(params.leagueId));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.minQuality) searchParams.set('min_quality', params.minQuality);
  const res = await fetch(`/api/v4/predictions?${searchParams.toString()}`);
  if (!res.ok) throw new Error(`V4 predictions API error: ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════
// MATCH DETAIL — Full match data from Turso DB
// ═══════════════════════════════════════════════════════════════════════

export async function fetchMatchDetail(eventId: number): Promise<any> {
  const res = await fetch(`/api/match/${eventId}`);
  if (!res.ok) throw new Error(`Match detail API error: ${res.status}`);
  return res.json();
}
