import { clamp } from '../../utils';

export type MatchMemoryRow = {
  id: number;
  league_id: number;
  home_team_id: number;
  away_team_id: number;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
};

export type TeamMemory = {
  teamId: number;
  teamName: string;
  leagueId: number | null;
  lastMatches: Array<{
    fixtureId: number;
    date: string;
    opponent: string;
    venue: 'home' | 'away';
    goalsFor: number;
    goalsAgainst: number;
    result: 'W' | 'D' | 'L';
  }>;
  momentumScore: number;
  attackForm: number;
  defenseForm: number;
  fatigueScore: number;
  volatilityScore: number;
};

const WEIGHTS = [1, 0.9, 0.8, 0.7, 0.62, 0.55, 0.48, 0.42, 0.36, 0.31];

function resultPoints(gf: number, ga: number) {
  return gf > ga ? 3 : gf === ga ? 1 : 0;
}

function daysBetween(a: string, b: string) {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

export function buildTeamMemory(teamId: number, teamName: string, rows: MatchMemoryRow[]): TeamMemory {
  const sorted = rows
    .filter((r) => r.home_score != null && r.away_score != null)
    .sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime())
    .slice(0, 10);

  const lastMatches = sorted.map((r) => {
    const home = r.home_team_id === teamId;
    const gf = home ? Number(r.home_score) : Number(r.away_score);
    const ga = home ? Number(r.away_score) : Number(r.home_score);
    return {
      fixtureId: r.id,
      date: r.kickoff_at,
      opponent: home ? r.away_team : r.home_team,
      venue: home ? 'home' as const : 'away' as const,
      goalsFor: gf,
      goalsAgainst: ga,
      result: gf > ga ? 'W' as const : gf === ga ? 'D' as const : 'L' as const,
    };
  });

  if (lastMatches.length === 0) {
    return {
      teamId,
      teamName,
      leagueId: null,
      lastMatches: [],
      momentumScore: 0.5,
      attackForm: 0.5,
      defenseForm: 0.5,
      fatigueScore: 0.35,
      volatilityScore: 0.5,
    };
  }

  let weightTotal = 0;
  let pointsWeighted = 0;
  let gfWeighted = 0;
  let gaWeighted = 0;
  let volatilityWeighted = 0;

  lastMatches.forEach((m, idx) => {
    const w = WEIGHTS[idx] ?? 0.25;
    weightTotal += w;
    pointsWeighted += (resultPoints(m.goalsFor, m.goalsAgainst) / 3) * w;
    gfWeighted += clamp(m.goalsFor / 3, 0, 1) * w;
    gaWeighted += clamp(m.goalsAgainst / 3, 0, 1) * w;
    volatilityWeighted += clamp((m.goalsFor + m.goalsAgainst) / 5, 0, 1) * w;
  });

  const now = new Date().toISOString();
  const mostRecent = lastMatches[0]?.date ?? now;
  const secondRecent = lastMatches[1]?.date ?? mostRecent;
  const restDays = daysBetween(now, mostRecent);
  const fixtureCompression = daysBetween(mostRecent, secondRecent);

  const fatigueScore = clamp(
    (restDays <= 2 ? 0.85 : restDays <= 4 ? 0.6 : 0.35) +
    (fixtureCompression <= 3 ? 0.18 : fixtureCompression <= 5 ? 0.08 : 0),
    0,
    1,
  );

  const leagueId = sorted[0]?.league_id ?? null;

  return {
    teamId,
    teamName,
    leagueId,
    lastMatches,
    momentumScore: Number((pointsWeighted / weightTotal).toFixed(4)),
    attackForm: Number((gfWeighted / weightTotal).toFixed(4)),
    defenseForm: Number((1 - gaWeighted / weightTotal).toFixed(4)),
    fatigueScore: Number(fatigueScore.toFixed(4)),
    volatilityScore: Number((volatilityWeighted / weightTotal).toFixed(4)),
  };
}

export function combineFixtureMemory(home?: TeamMemory | null, away?: TeamMemory | null) {
  return {
    homeMomentum: home?.momentumScore ?? 0.5,
    awayMomentum: away?.momentumScore ?? 0.5,
    homeAttack: home?.attackForm ?? 0.5,
    awayAttack: away?.attackForm ?? 0.5,
    homeDefense: home?.defenseForm ?? 0.5,
    awayDefense: away?.defenseForm ?? 0.5,
    homeFatigue: home?.fatigueScore ?? 0.35,
    awayFatigue: away?.fatigueScore ?? 0.35,
  };
}
