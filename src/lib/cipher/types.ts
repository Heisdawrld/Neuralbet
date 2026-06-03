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

export type Confidence = 'STRONG' | 'LEAN' | 'WATCH' | 'SKIP';
export type Risk = 'SAFE' | 'BALANCED' | 'AGGRESSIVE' | 'NO_BET';

export type CipherPick = {
  market: string;
  selection: string;
  probability: number;
  fairOdds: number;
  bookmakerOdds: number | null;
  edge: number | null;
  confidence: Confidence;
  risk: Risk;
  stakeFraction: number;
  premiumOnly: boolean;
};

export type CipherPrediction = CipherPick & {
  fixtureId: number;
  report: string;
  features: Record<string, unknown>;
  picks: CipherPick[];
  tier: 'free' | 'premium';
  lockedPicks: number;
};
