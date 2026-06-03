import { db } from './client';
import { ensureSchema } from './schema';
import { combineFixtureMemory, type TeamMemory } from '@/lib/cipher/memory/team-memory';
import type { FixtureInput } from '@/lib/cipher/types';

type FixtureRow = {
  id: number;
  league_id: number;
  league_name: string | null;
  home_team_id: number;
  away_team_id: number;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: string;
  raw_json: string;
};

type MemoryRow = {
  team_id: number;
  team_name: string;
  league_id: number | null;
  last_matches_json: string;
  momentum_score: number;
  attack_form: number;
  defense_form: number;
  fatigue_score: number;
  volatility_score: number;
};

function parseMemory(row?: MemoryRow | null): TeamMemory | null {
  if (!row) return null;
  return {
    teamId: Number(row.team_id),
    teamName: String(row.team_name),
    leagueId: row.league_id == null ? null : Number(row.league_id),
    lastMatches: JSON.parse(String(row.last_matches_json || '[]')),
    momentumScore: Number(row.momentum_score),
    attackForm: Number(row.attack_form),
    defenseForm: Number(row.defense_form),
    fatigueScore: Number(row.fatigue_score),
    volatilityScore: Number(row.volatility_score ?? 0.5),
  };
}

export async function getStoredFixtureInput(fixtureId: number): Promise<FixtureInput | null> {
  await ensureSchema();
  const cx = db();
  const fixtureResult = await cx.execute({ sql: `SELECT * FROM fixtures WHERE id = ?`, args: [fixtureId] });
  const fixture = fixtureResult.rows[0] as unknown as FixtureRow | undefined;
  if (!fixture) return null;

  const oddsResult = await cx.execute({
    sql: `SELECT odds_json FROM odds_snapshots WHERE fixture_id = ? ORDER BY captured_at DESC LIMIT 1`,
    args: [fixtureId],
  });
  const odds = oddsResult.rows[0]?.odds_json ? JSON.parse(String(oddsResult.rows[0].odds_json)) : {};

  const memoryResult = await cx.execute({
    sql: `SELECT * FROM team_memory WHERE team_id IN (?, ?)`,
    args: [fixture.home_team_id, fixture.away_team_id],
  });
  const memoryRows = memoryResult.rows as unknown as MemoryRow[];
  const homeMemory = parseMemory(memoryRows.find((m) => Number(m.team_id) === Number(fixture.home_team_id)));
  const awayMemory = parseMemory(memoryRows.find((m) => Number(m.team_id) === Number(fixture.away_team_id)));

  return {
    id: Number(fixture.id),
    leagueId: Number(fixture.league_id),
    leagueName: fixture.league_name,
    homeTeamId: Number(fixture.home_team_id),
    awayTeamId: Number(fixture.away_team_id),
    homeTeam: fixture.home_team,
    awayTeam: fixture.away_team,
    kickoffAt: fixture.kickoff_at,
    odds,
    memory: combineFixtureMemory(homeMemory, awayMemory),
  };
}

export async function listStoredFixtures(dateFrom: string, dateTo: string) {
  await ensureSchema();
  const result = await db().execute({
    sql: `SELECT id, league_id, league_name, home_team_id, home_team, away_team_id, away_team, kickoff_at AS event_date, status, home_score, away_score
          FROM fixtures
          WHERE date(kickoff_at) BETWEEN date(?) AND date(?)
          ORDER BY kickoff_at ASC`,
    args: [dateFrom, dateTo],
  });
  return result.rows;
}
