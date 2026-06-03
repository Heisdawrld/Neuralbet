const BASE = process.env.BSD_API_BASE_URL || 'https://sports.bzzoiro.com/api/v2/';

export async function bsdFetch<T>(path: string): Promise<T> {
  const key = process.env.BSD_API_KEY;
  if (!key) throw new Error('BSD_API_KEY is not configured');
  const res = await fetch(new URL(path, BASE), {
    headers: { Authorization: `Token ${key}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`BSD ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export type BsdFixture = {
  id: number; league_id: number; league_name?: string;
  home_team_id: number; home_team: string; away_team_id: number; away_team: string;
  event_date: string; status: string; home_score?: number | null; away_score?: number | null;
};

export async function listFixtures(dateFrom: string, dateTo: string) {
  const all: BsdFixture[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const data = await bsdFetch<{ results?: BsdFixture[]; next?: string | null }>(
      `events/?date_from=${dateFrom}&date_to=${dateTo}&limit=${limit}&offset=${offset}`
    );
    const page = data.results || [];
    all.push(...page);
    if (!data.next || page.length < limit || all.length >= 3000) break;
    offset += limit;
  }
  return all;
}

export async function eventOdds(fixtureId: number) {
  return bsdFetch<{ event_id: number; odds?: Record<string, number | null> }>(`events/${fixtureId}/odds/`);
}
