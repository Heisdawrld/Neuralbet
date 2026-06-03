import { db } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import { eventOdds, listFixtures, type BsdFixture } from '@/lib/bsd/client';
import { buildTeamMemory, type MatchMemoryRow } from '@/lib/cipher/memory/team-memory';

function isoDate(daysOffset: number) {
  const d = new Date(Date.now() + daysOffset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function normalizeFixture(e: BsdFixture) {
  return {
    id: e.id,
    leagueId: e.league_id,
    leagueName: e.league_name ?? null,
    homeTeamId: e.home_team_id,
    homeTeam: e.home_team,
    awayTeamId: e.away_team_id,
    awayTeam: e.away_team,
    kickoffAt: e.event_date,
    status: e.status,
    homeScore: e.home_score ?? null,
    awayScore: e.away_score ?? null,
  };
}

export async function syncFixturesWindow(options: { pastDays?: number; futureDays?: number } = {}) {
  await ensureSchema();
  const cx = db();
  const pastDays = options.pastDays ?? 30;
  const futureDays = options.futureDays ?? 14;
  const dateFrom = isoDate(-pastDays);
  const dateTo = isoDate(futureDays);
  const fixtures = await listFixtures(dateFrom, dateTo);

  let upserted = 0;
  for (const raw of fixtures) {
    const f = normalizeFixture(raw);
    await cx.execute({
      sql: `INSERT INTO fixtures (
        id, league_id, league_name, home_team_id, home_team, away_team_id, away_team,
        kickoff_at, status, home_score, away_score, raw_json, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        league_id=excluded.league_id,
        league_name=excluded.league_name,
        home_team_id=excluded.home_team_id,
        home_team=excluded.home_team,
        away_team_id=excluded.away_team_id,
        away_team=excluded.away_team,
        kickoff_at=excluded.kickoff_at,
        status=excluded.status,
        home_score=excluded.home_score,
        away_score=excluded.away_score,
        raw_json=excluded.raw_json,
        synced_at=excluded.synced_at`,
      args: [
        f.id, f.leagueId, f.leagueName, f.homeTeamId, f.homeTeam, f.awayTeamId, f.awayTeam,
        f.kickoffAt, f.status, f.homeScore, f.awayScore, JSON.stringify(raw),
      ],
    });
    upserted++;
  }

  return { dateFrom, dateTo, fetched: fixtures.length, upserted };
}

export async function syncUpcomingOdds(limit = 100) {
  await ensureSchema();
  const cx = db();
  const rows = await cx.execute({
    sql: `SELECT id FROM fixtures WHERE status IN ('notstarted', 'scheduled', 'NS') AND kickoff_at >= datetime('now') ORDER BY kickoff_at ASC LIMIT ?`,
    args: [limit],
  });

  let synced = 0;
  let failed = 0;

  for (const row of rows.rows) {
    const fixtureId = Number(row.id);
    try {
      const odds = await eventOdds(fixtureId);
      await cx.execute({
        sql: `INSERT INTO odds_snapshots (fixture_id, source, odds_json, captured_at) VALUES (?, 'bsd', ?, datetime('now'))`,
        args: [fixtureId, JSON.stringify(odds.odds ?? odds)],
      });
      synced++;
    } catch {
      failed++;
    }
  }

  return { targeted: rows.rows.length, synced, failed };
}

export async function rebuildTeamMemory() {
  await ensureSchema();
  const cx = db();
  const teams = await cx.execute(`
    SELECT home_team_id AS team_id, home_team AS team_name FROM fixtures
    UNION
    SELECT away_team_id AS team_id, away_team AS team_name FROM fixtures
  `);

  let updated = 0;
  for (const team of teams.rows) {
    const teamId = Number(team.team_id);
    const teamName = String(team.team_name);
    const matches = await cx.execute({
      sql: `SELECT id, league_id, home_team_id, away_team_id, home_team, away_team, kickoff_at, home_score, away_score
            FROM fixtures
            WHERE (home_team_id = ? OR away_team_id = ?)
              AND status IN ('finished', 'FT', 'finished_after_extra_time', 'finished_after_penalties')
              AND home_score IS NOT NULL AND away_score IS NOT NULL
            ORDER BY kickoff_at DESC
            LIMIT 10`,
      args: [teamId, teamId],
    });

    const memory = buildTeamMemory(teamId, teamName, matches.rows as unknown as MatchMemoryRow[]);
    await cx.execute({
      sql: `INSERT INTO team_memory (
        team_id, team_name, league_id, last_matches_json, momentum_score, attack_form, defense_form, fatigue_score, volatility_score, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(team_id) DO UPDATE SET
        team_name=excluded.team_name,
        league_id=excluded.league_id,
        last_matches_json=excluded.last_matches_json,
        momentum_score=excluded.momentum_score,
        attack_form=excluded.attack_form,
        defense_form=excluded.defense_form,
        fatigue_score=excluded.fatigue_score,
        volatility_score=excluded.volatility_score,
        updated_at=excluded.updated_at`,
      args: [
        memory.teamId,
        memory.teamName,
        memory.leagueId,
        JSON.stringify(memory.lastMatches),
        memory.momentumScore,
        memory.attackForm,
        memory.defenseForm,
        memory.fatigueScore,
        memory.volatilityScore,
      ],
    });
    updated++;
  }

  return { teams: teams.rows.length, updated };
}

export async function runSync(options: { pastDays?: number; futureDays?: number; oddsLimit?: number } = {}) {
  const fixtures = await syncFixturesWindow(options);
  const odds = await syncUpcomingOdds(options.oddsLimit ?? 100);
  const memory = await rebuildTeamMemory();
  return { fixtures, odds, memory };
}
