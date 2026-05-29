// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — BSD API Client
//
// Typed, retry-capable client for the BSD Sports API.
// All server-side consumption of external data goes through here.
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT = 15_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

export class BSDClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor() {
    // Env already includes /api/v2/ path — keep as-is for compatibility
    this.baseUrl = process.env.BSD_API_BASE_URL || 'https://sports.bzzoiro.com/api/v2/';
    this.apiKey = process.env.BSD_API_KEY || '';
    this.timeout = DEFAULT_TIMEOUT;
  }

  // ── Core fetcher with retry + backoff ──────────────────────────────

  private async fetchWithRetry<T>(path: string, attempt = 1): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`BSD API ${res.status}: ${text}`);
      }

      return (await res.json()) as T;
    } catch (err: any) {
      clearTimeout(timer);

      // Retry on transient errors
      if (attempt < MAX_RETRIES && this.isRetryable(err)) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        await this.sleep(backoff + Math.random() * 200);
        return this.fetchWithRetry<T>(path, attempt + 1);
      }

      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private isRetryable(err: any): boolean {
    if (err.name === 'AbortError') return true;
    if (err.message?.includes('503') || err.message?.includes('502') || err.message?.includes('429')) return true;
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Public fetch (for on-demand enrichment) ──────────────────────
  async fetchWithRetryPublic<T>(path: string): Promise<T> {
    return this.fetchWithRetry<T>(path);
  }

  // ── Public API Methods ─────────────────────────────────────────────

  /**
   * Fetch events for a date range.
   * GET /api/v2/events/?date_from=...&date_to=...
   */
  async fetchEvents(dateFrom: string, dateTo: string): Promise<any[]> {
    const data = await this.fetchWithRetry<{ results?: any[]; count?: number }>(
      `events/?date_from=${dateFrom}&date_to=${dateTo}&limit=500`
    );
    return data.results || [];
  }

  /**
   * Fetch full detail for a single event.
   * GET /api/v2/events/{eventId}/
   */
  async fetchEventDetail(eventId: number): Promise<any> {
    return this.fetchWithRetry<any>(`events/${eventId}/`);
  }

  /**
   * Fetch standings for a league.
   * GET /api/v2/leagues/{leagueId}/standings/
   */
  async fetchStandings(leagueId: number): Promise<any[]> {
    const data = await this.fetchWithRetry<{
      league_id: number;
      standings?: any[];
    }>(`leagues/${leagueId}/standings/`);
    return data.standings || [];
  }

  /**
   * Fetch recent events for a team.
   * GET /api/v2/teams/{teamId}/events/?page=...
   */
  async fetchTeamRecentEvents(teamId: number, page: number = 0): Promise<any[]> {
    const data = await this.fetchWithRetry<{ results?: any[] }>(
      `teams/${teamId}/events/?page=${page}&limit=20`
    );
    return data.results || [];
  }

  /**
   * Fetch odds for a specific event.
   * GET /api/v2/events/{eventId}/odds/
   */
  async fetchEventOdds(eventId: number): Promise<any> {
    return this.fetchWithRetry<any>(`events/${eventId}/odds/`);
  }

  /**
   * Fetch lineups for a specific event.
   * GET /api/v2/events/{eventId}/lineups/
   */
  async fetchEventLineups(eventId: number): Promise<any> {
    return this.fetchWithRetry<any>(`events/${eventId}/lineups/`);
  }

  /**
   * Fetch manager profile by team ID.
   * GET /api/v2/teams/{teamId}/manager/
   */
  async fetchManagerByTeamId(teamId: number): Promise<any> {
    return this.fetchWithRetry<any>(`teams/${teamId}/manager/`);
  }

  /**
   * Fetch referee profile.
   * GET /api/v2/referees/{refereeId}/
   */
  async fetchReferee(refereeId: number): Promise<any> {
    return this.fetchWithRetry<any>(`referees/${refereeId}/`);
  }

  /**
   * Fetch venue details.
   * GET /api/v2/venues/{venueId}/
   */
  async fetchVenue(venueId: number): Promise<any> {
    return this.fetchWithRetry<any>(`venues/${venueId}/`);
  }

  /**
   * Fetch event metadata (fun facts, AI preview).
   * GET /api/v2/events/{eventId}/metadata/
   */
  async fetchEventMetadata(eventId: number): Promise<any> {
    return this.fetchWithRetry<any>(`events/${eventId}/metadata/`);
  }

  /**
   * Fetch currently live events.
   * GET /api/v2/events/?status=in&limit=200
   */
  async fetchLiveEvents(): Promise<any[]> {
    const data = await this.fetchWithRetry<{ results?: any[] }>(
      `events/?status=in&limit=200`
    );
    return data.results || [];
  }

  /**
   * Fetch player stats for an event.
   * GET /api/v2/events/{eventId}/player-stats/
   */
  async fetchEventPlayerStats(eventId: number): Promise<any> {
    return this.fetchWithRetry<any>(`events/${eventId}/player-stats/`);
  }

  /**
   * Fetch Polymarket odds for an event.
   * GET /api/v2/events/{eventId}/polymarket/
   */
  async fetchPolymarketOdds(eventId: number): Promise<any> {
    return this.fetchWithRetry<any>(`events/${eventId}/polymarket/`);
  }

  /**
   * Fetch multi-bookmaker odds comparison for an event.
   * GET /api/v2/events/{eventId}/odds/movement/
   */
  async fetchOddsComparison(eventId: number): Promise<any> {
    return this.fetchWithRetry<any>(`events/${eventId}/odds/movement/`);
  }

  /**
   * Fetch events by status.
   * GET /api/v2/events/?status=...&limit=...
   */
  async fetchEventsByStatus(status: string, limit: number = 200): Promise<any[]> {
    const data = await this.fetchWithRetry<{ results?: any[] }>(
      `events/?status=${status}&limit=${limit}`
    );
    return data.results || [];
  }

  /**
   * Fetch active leagues.
   * GET /api/v2/leagues/?is_active=true&limit=200
   */
  async fetchLeagues(): Promise<any[]> {
    const data = await this.fetchWithRetry<{ results?: any[] }>(
      `leagues/?is_active=true&limit=200`
    );
    return data.results || [];
  }

  /**
   * Fetch event statistics (xG, shots, possession).
   * GET /api/v2/events/{eventId}/stats/
   */
  async fetchEventStats(eventId: number): Promise<any> {
    return this.fetchWithRetry<any>(`events/${eventId}/stats/`);
  }

  /**
   * Construct a team logo URL from team ID.
   */
  getTeamLogoUrl(teamId: number): string {
    // Strip /api/v2/ from base URL to get the root
    const root = this.baseUrl.replace(/\/api\/v2\/?$/, '');
    return `${root}/img/team/${teamId}/`;
  }

  /**
   * Construct a league logo URL from league ID.
   */
  getLeagueLogoUrl(leagueId: number): string {
    const root = this.baseUrl.replace(/\/api\/v2\/?$/, '');
    return `${root}/img/league/${leagueId}/`;
  }
}

// Singleton export
export const bsdClient = new BSDClient();
