import { NextRequest, NextResponse } from 'next/server';
import { eventOdds, bsdFetch, type BsdFixture } from '@/lib/bsd/client';
import { predictFixture } from '@/lib/cipher/model';
import { getStoredFixtureInput } from '@/lib/db/read-model';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const fixtureId = Number(new URL(req.url).searchParams.get('fixtureId'));
  if (!fixtureId) return NextResponse.json({ error: 'Missing fixtureId' }, { status: 400 });

  const stored = await getStoredFixtureInput(fixtureId).catch(() => null);
  if (stored) return NextResponse.json(predictFixture(stored));

  const fixture = await bsdFetch<BsdFixture>(`events/${fixtureId}/`);
  const odds = await eventOdds(fixtureId).catch(() => ({ odds: {} }));
  const prediction = predictFixture({
    id: fixture.id,
    leagueId: fixture.league_id,
    leagueName: fixture.league_name,
    homeTeamId: fixture.home_team_id,
    awayTeamId: fixture.away_team_id,
    homeTeam: fixture.home_team,
    awayTeam: fixture.away_team,
    kickoffAt: fixture.event_date,
    odds: odds.odds || {},
  });
  return NextResponse.json(prediction);
}
