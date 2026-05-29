// ═══════════════════════════════════════════════════════════════════════
// BSD H2H fetcher (server-side, in-process)
//
// Server-only helper that pulls historical head-to-head meetings between
// two teams directly from the BSD API. Used as a fallback by
// /api/match/[id] when our local `events` table doesn't have enough
// finished fixtures involving both teams (typical for newly-synced
// fixtures, or international friendlies that don't appear in our
// forward window).
//
// Strategy: hit BSD's /teams/{homeTeamId}/fixtures/?status=finished
// with a wide date window, filter for fixtures where the opponent_id
// matches the awayTeamId. Cheap: one HTTP call, BSD returns a paginated
// finished-fixture list.
// ═══════════════════════════════════════════════════════════════════════

const BSD_API_KEY = process.env.BSD_API_KEY || '';
const BSD_BASE_URL = process.env.BSD_API_BASE_URL || 'https://sports.bzzoiro.com/api/v2/';

export interface BsdH2HMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  eventDate: string;
  status: string;
  /** True when the home team in this PAST meeting is the same as the
   *  current fixture's home team — used by UI to draw consistent badges. */
  isCurrentHomeAtHome: boolean;
}

interface BsdFixture {
  id: number;
  home_team_id: number;
  away_team_id: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  event_date: string;
  status: string;
}

/** How far back to look (BSD will paginate; we cap at 1 page = up to 50 rows). */
const LOOKBACK_DAYS = 4 * 365; // 4 years
const HARD_LIMIT = 10;

/**
 * Fetch the last N finished meetings between two teams.
 * Returns [] when:
 *   - BSD_API_KEY missing
 *   - BSD request fails
 *   - No qualifying matches exist
 *
 * Never throws — designed for callers that can fall back to an empty list.
 */
export async function fetchH2HFromBSD(
  homeTeamId: number,
  awayTeamId: number,
): Promise<BsdH2HMatch[]> {
  if (!BSD_API_KEY) return [];
  if (!homeTeamId || !awayTeamId) return [];

  const dateFrom = new Date(Date.now() - LOOKBACK_DAYS * 86400000)
    .toISOString().slice(0, 10);

  const url = new URL(`teams/${homeTeamId}/fixtures/`, BSD_BASE_URL);
  url.searchParams.set('status', 'finished');
  url.searchParams.set('date_from', `${dateFrom}T00:00:00Z`);
  url.searchParams.set('limit', '200'); // BSD max

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${BSD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 3600 }, // 1 hour edge cache
    });
    if (!res.ok) {
      console.warn(`[BSD H2H] HTTP ${res.status} for team ${homeTeamId}`);
      return [];
    }
    const data = await res.json();
    const fixtures: BsdFixture[] = Array.isArray(data?.results) ? data.results : [];

    // Filter: opponent matches awayTeamId on either side
    const meetings = fixtures.filter(
      (f) =>
        (f.home_team_id === homeTeamId && f.away_team_id === awayTeamId)
        || (f.away_team_id === homeTeamId && f.home_team_id === awayTeamId),
    );

    return meetings.slice(0, HARD_LIMIT).map((f) => ({
      homeTeamId: f.home_team_id,
      awayTeamId: f.away_team_id,
      homeTeam: f.home_team,
      awayTeam: f.away_team,
      homeScore: f.home_score,
      awayScore: f.away_score,
      eventDate: f.event_date,
      status: f.status,
      isCurrentHomeAtHome: f.home_team_id === homeTeamId,
    }));
  } catch (err) {
    console.error('[BSD H2H] Fetch failed:', err);
    return [];
  }
}
