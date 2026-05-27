// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Manager Intelligence Model
//
// Managers shape teams. A defensive manager vs an attacking manager
// creates a completely different game than two attacking managers.
// ═══════════════════════════════════════════════════════════════════════

import type { ManagerIntel, ManagerProfile, TacticalMatchup, ModelPrediction } from '../types';
import { buildGoalMatrix, calculateOutcomeProbs, clamp } from '../../utils';

interface ManagerData {
  id: number;
  name: string;
  tactical_profile: string | null;
  preferred_formation: string | null;
  avg_goals_scored: number;
  avg_goals_conceded: number;
  avg_possession: number;
  clean_sheet_pct: number;
  btts_pct: number;
  over_25_pct: number;
  win_pct: number;
}

export function buildManagerIntel(
  homeManager: ManagerData | null,
  awayManager: ManagerData | null
): ManagerIntel {
  const homeProfile = homeManager ? toManagerProfile(homeManager) : null;
  const awayProfile = awayManager ? toManagerProfile(awayManager) : null;
  const tacticalMatchup = analyzeTacticalMatchup(homeProfile, awayProfile);
  return { homeManager: homeProfile, awayManager: awayProfile, tacticalMatchup };
}

function toManagerProfile(m: ManagerData): ManagerProfile {
  return {
    id: m.id,
    name: m.name,
    tacticalProfile: m.tactical_profile || 'balanced',
    preferredFormation: m.preferred_formation || '4-4-2',
    avgGoalsScored: m.avg_goals_scored || 1.3,
    avgGoalsConceded: m.avg_goals_conceded || 1.1,
    avgPossession: m.avg_possession || 50,
    cleanSheetPct: m.clean_sheet_pct || 0.3,
    bttsPct: m.btts_pct || 0.5,
    over25Pct: m.over_25_pct || 0.5,
    winPct: m.win_pct || 0.4,
  };
}

function analyzeTacticalMatchup(
  home: ManagerProfile | null,
  away: ManagerProfile | null
): TacticalMatchup | null {
  if (!home || !away) return null;

  const avgTotalGoals = (home.avgGoalsScored + home.avgGoalsConceded + away.avgGoalsScored + away.avgGoalsConceded) / 4;
  const goalExpectationModifier = clamp((avgTotalGoals - 2.5) / 3, -0.3, 0.3);
  const avgBtts = (home.bttsPct + away.bttsPct) / 2;
  const bttsModifier = clamp((avgBtts - 0.5) * 0.4, -0.1, 0.1);

  let expectedStyle: TacticalMatchup['expectedStyle'] = 'balanced';
  let description = '';
  const hs = home.tacticalProfile;
  const as = away.tacticalProfile;

  if (hs === 'attacking' && as === 'attacking') {
    expectedStyle = 'open';
    description = 'Both managers attack — expect an open, high-scoring game';
  } else if (hs === 'defensive' && as === 'defensive') {
    expectedStyle = 'defensive';
    description = 'Both managers defend — expect a cagey, low-scoring affair';
  } else if (hs === 'attacking' && as === 'defensive') {
    expectedStyle = 'asymmetric';
    description = 'Home attacks, away defends — patience and counters will decide';
  } else if (hs === 'defensive' && as === 'attacking') {
    expectedStyle = 'asymmetric';
    description = 'Away attacks, home defends — home will sit deep and counter';
  } else {
    description = 'Balanced tactical matchup — no clear style advantage';
  }

  return { description, expectedStyle, goalExpectationModifier, bttsModifier };
}

/**
 * Manager model prediction — uses manager avg goals and style.
 */
export function calculateManagerPrediction(
  homeManager: ManagerData | null,
  awayManager: ManagerData | null
): ModelPrediction {
  if (!homeManager || !awayManager) {
    return { homeWinProb: 0.42, drawProb: 0.28, awayWinProb: 0.30, homeExpectedGoals: 1.35, awayExpectedGoals: 1.15, reliability: 0.05 };
  }

  const homeXg = homeManager.avg_goals_scored || 1.35;
  const homeXga = homeManager.avg_goals_conceded || 1.1;
  const awayXg = awayManager.avg_goals_scored || 1.1;
  const awayXga = awayManager.avg_goals_conceded || 1.25;

  const homeExpectedGoals = clamp((homeXg + awayXga) / 2 * 1.05, 0.3, 4.0);
  const awayExpectedGoals = clamp((awayXg + homeXga) / 2 * 0.95, 0.2, 3.5);

  const matrix = buildGoalMatrix(homeExpectedGoals, awayExpectedGoals, 7, 0.1);
  const outcomes = calculateOutcomeProbs(matrix);

  let reliability = 0.25;
  if (homeManager.win_pct > 0.6) reliability = 0.65;
  else if (homeManager.win_pct > 0.45) reliability = 0.5;

  return {
    homeWinProb: outcomes.homeWinProb,
    drawProb: outcomes.drawProb,
    awayWinProb: outcomes.awayWinProb,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    reliability,
  };
}
