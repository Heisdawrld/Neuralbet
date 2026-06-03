import { describe, expect, it } from 'vitest';
import { buildTeamMemory } from './team-memory';

describe('team memory', () => {
  it('builds momentum, attack, defense, fatigue and volatility from recent matches', () => {
    const memory = buildTeamMemory(1, 'Home FC', [
      { id: 1, league_id: 10, home_team_id: 1, away_team_id: 2, home_team: 'Home FC', away_team: 'Away FC', kickoff_at: new Date(Date.now() - 2 * 86400000).toISOString(), home_score: 3, away_score: 1 },
      { id: 2, league_id: 10, home_team_id: 3, away_team_id: 1, home_team: 'Third FC', away_team: 'Home FC', kickoff_at: new Date(Date.now() - 5 * 86400000).toISOString(), home_score: 0, away_score: 2 },
      { id: 3, league_id: 10, home_team_id: 1, away_team_id: 4, home_team: 'Home FC', away_team: 'Fourth FC', kickoff_at: new Date(Date.now() - 10 * 86400000).toISOString(), home_score: 1, away_score: 1 },
    ]);

    expect(memory.teamId).toBe(1);
    expect(memory.lastMatches).toHaveLength(3);
    expect(memory.momentumScore).toBeGreaterThan(0.6);
    expect(memory.attackForm).toBeGreaterThan(0.4);
    expect(memory.defenseForm).toBeGreaterThan(0.4);
    expect(memory.fatigueScore).toBeGreaterThan(0.5);
    expect(memory.volatilityScore).toBeGreaterThan(0);
  });
});
