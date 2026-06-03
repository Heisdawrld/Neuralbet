export type FixtureInput = {
  id: number;
  leagueId: number;
  leagueName?: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  odds?: Record<string, number | null>;
  memory?: {
    homeMomentum: number;
    awayMomentum: number;
    homeAttack: number;
    awayAttack: number;
    homeDefense: number;
    awayDefense: number;
    homeFatigue: number;
    awayFatigue: number;
  };
};

export type CipherPrediction = {
  fixtureId: number;
  market: string;
  selection: string;
  probability: number;
  fairOdds: number;
  bookmakerOdds: number | null;
  edge: number | null;
  confidence: 'STRONG' | 'LEAN' | 'WATCH' | 'SKIP';
  risk: 'SAFE' | 'BALANCED' | 'AGGRESSIVE' | 'NO_BET';
  stakeFraction: number;
  report: string;
  features: Record<string, unknown>;
};
