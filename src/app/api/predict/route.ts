import { NextRequest, NextResponse } from 'next/server';
import { eventOdds, bsdFetch, type BsdFixture } from '@/lib/bsd/client';
import { predictFixture } from '@/lib/cipher/model';
import { getStoredFixtureInput } from '@/lib/db/read-model';
import { getAuth } from '@/lib/auth/server';
import { getEntitlement, logPredictionUse } from '@/lib/auth/entitlements';
import { savePredictionRecord } from '@/lib/performance/records';

export const dynamic = 'force-dynamic';

async function buildFixtureInput(fixtureId: number) {
  const stored = await getStoredFixtureInput(fixtureId).catch(() => null);
  if (stored) return stored;

  const fixture = await bsdFetch<BsdFixture>(`events/${fixtureId}/`);
  const odds = await eventOdds(fixtureId).catch(() => ({ odds: {} }));
  return {
    id: fixture.id,
    leagueId: fixture.league_id,
    leagueName: fixture.league_name,
    homeTeamId: fixture.home_team_id,
    awayTeamId: fixture.away_team_id,
    homeTeam: fixture.home_team,
    awayTeam: fixture.away_team,
    kickoffAt: fixture.event_date,
    odds: odds.odds || {},
  };
}

export async function GET(req: NextRequest) {
  const fixtureId = Number(new URL(req.url).searchParams.get('fixtureId'));
  if (!fixtureId) return NextResponse.json({ error: 'Missing fixtureId' }, { status: 400 });

  const { userId } = await getAuth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entitlement = await getEntitlement(userId);
  if (entitlement.plan === 'free' && entitlement.remaining <= 0) {
    return NextResponse.json({
      error: 'Free prediction limit reached',
      entitlement,
      upgrade: { price: 19, plan: 'premium', message: 'Upgrade to unlock unlimited predictions and all markets.' },
    }, { status: 402 });
  }

  const input = await buildFixtureInput(fixtureId);
  const prediction = predictFixture(input, { tier: entitlement.plan });
  await savePredictionRecord({ userId, prediction, fixture: { leagueId: input.leagueId, kickoffAt: input.kickoffAt } });
  await logPredictionUse(userId, fixtureId);

  return NextResponse.json({ ...prediction, entitlement: { ...entitlement, predictionsToday: entitlement.predictionsToday + 1, remaining: Math.max(0, entitlement.remaining - 1) } });
}
