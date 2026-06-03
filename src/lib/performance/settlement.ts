export type FixtureScore = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type SettlementResult = {
  status: 'won' | 'lost' | 'void' | 'pending';
  reason: string;
};

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function settlePick(market: string, selection: string, fixture: FixtureScore): SettlementResult {
  const { homeScore, awayScore } = fixture;
  if (homeScore == null || awayScore == null) return { status: 'pending', reason: 'fixture_not_finished' };

  const total = homeScore + awayScore;
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;
  const draw = homeScore === awayScore;
  const s = norm(selection);
  const home = norm(fixture.homeTeam);
  const away = norm(fixture.awayTeam);

  if (market === '1X2') {
    if (s === 'draw') return { status: draw ? 'won' : 'lost', reason: draw ? 'draw_result' : 'not_draw' };
    if (s === home) return { status: homeWon ? 'won' : 'lost', reason: homeWon ? 'home_won' : 'home_not_won' };
    if (s === away) return { status: awayWon ? 'won' : 'lost', reason: awayWon ? 'away_won' : 'away_not_won' };
  }

  if (market === 'Double Chance') {
    if (s.includes(home) && s.includes('draw')) return { status: (homeWon || draw) ? 'won' : 'lost', reason: (homeWon || draw) ? 'home_or_draw' : 'away_won' };
    if (s.includes(away) && s.includes('draw')) return { status: (awayWon || draw) ? 'won' : 'lost', reason: (awayWon || draw) ? 'away_or_draw' : 'home_won' };
  }

  if (market === 'Draw No Bet') {
    if (draw) return { status: 'void', reason: 'draw_no_bet_push' };
    if (s === home) return { status: homeWon ? 'won' : 'lost', reason: homeWon ? 'home_won' : 'home_lost' };
    if (s === away) return { status: awayWon ? 'won' : 'lost', reason: awayWon ? 'away_won' : 'away_lost' };
  }

  if (market === 'Goals') {
    if (s.includes('over 1.5')) return { status: total > 1.5 ? 'won' : 'lost', reason: `total_goals_${total}` };
    if (s.includes('over 2.5')) return { status: total > 2.5 ? 'won' : 'lost', reason: `total_goals_${total}` };
    if (s.includes('under 2.5')) return { status: total < 2.5 ? 'won' : 'lost', reason: `total_goals_${total}` };
  }

  if (market === 'BTTS') {
    const yes = homeScore > 0 && awayScore > 0;
    if (s.includes('yes')) return { status: yes ? 'won' : 'lost', reason: yes ? 'both_scored' : 'not_both_scored' };
    if (s.includes('no')) return { status: !yes ? 'won' : 'lost', reason: !yes ? 'not_both_scored' : 'both_scored' };
  }

  return { status: 'void', reason: 'unsupported_market_or_selection' };
}

export function profitUnits(status: SettlementResult['status'], stakeUnits: number, bookmakerOdds: number | null) {
  if (status === 'pending') return 0;
  if (status === 'void') return 0;
  if (status === 'lost') return -stakeUnits;
  if (!bookmakerOdds || bookmakerOdds <= 1) return 0;
  return stakeUnits * (bookmakerOdds - 1);
}
