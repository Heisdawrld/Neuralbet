import type {
  ApiEvent,
  ApiPrediction,
  ApiOdds,
  ApiStandingsResponse,
  MatchData,
  PredictionData,
  OddsData,
  StandingData,
  ValueBetData,
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
    leagueName: '', // Events don't include league name, will be enriched later
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

// Predictions
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

// Value Bets
export async function fetchValueBets(): Promise<{ results: ValueBetData[]; count: number }> {
  const res = await fetch('/api/value-bets');
  if (!res.ok) throw new Error(`Value bets API error: ${res.status}`);
  return res.json();
}
