// ═══════════════════════════════════════════════════════════════════════
// src/lib/api.ts — Frontend API client
//
// Wraps:
//   • /api/football (BSD proxy) — used by live-matches, leagues, odds
//   • /api/v4/predictions (V5-backed legacy alias) — predictions tab
//   • /api/our-value-bets (V5-backed legacy alias) — value-bets tab
//
// All endpoints called here are server routes in src/app/api/*.
// ═══════════════════════════════════════════════════════════════════════

import type {
  ApiEvent,
  ApiOdds,
  ApiStandingsResponse,
  MatchData,
  OddsData,
  StandingData,
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

// ─────────────────────────────────────────────────────────────────────
// Live matches — via BSD proxy
// ─────────────────────────────────────────────────────────────────────
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
    under15: data.odds.under_15_goals,
    under25: data.odds.under_25_goals,
    under35: data.odds.under_35_goals,
    bttsYes: data.odds.btts_yes,
    bttsNo: data.odds.btts_no,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Leagues — via BSD proxy
// ─────────────────────────────────────────────────────────────────────
export async function fetchLeagues(limit = 200) {
  return fetchAPI<{
    results?: Array<{
      id: number; name: string; country: string; is_women: boolean; is_active: boolean;
      current_season: {
        id: number; name: string; year: number;
        start_date: string; end_date: string; is_current: boolean;
      } | null;
    }>;
    count?: number;
  }>({
    endpoint: 'leagues/',
    limit: String(limit),
  });
}

export async function fetchLeagueStandings(leagueId: number): Promise<{
  standings: StandingData[];
  season: { name: string; year: number };
}> {
  const data = await fetchAPI<ApiStandingsResponse>({
    endpoint: `leagues/${leagueId}/standings/`,
  });
  return {
    standings: data.standings.map((s) => ({
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
      form: s.form,
    })),
    season: {
      name: data.season.name,
      year: data.season.year,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// V5-backed legacy endpoints (PunterTipV4 + ValueBet shapes preserved)
// ─────────────────────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error(`v4 tips API error: ${res.status}`);
  return res.json();
}

export async function fetchOurValueBets(): Promise<{
  results: OurValueBetData[];
  count: number;
}> {
  const res = await fetch('/api/our-value-bets');
  if (!res.ok) throw new Error(`value-bets API error: ${res.status}`);
  return res.json();
}
