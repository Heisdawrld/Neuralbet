// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Lineup Intelligence Model
//
// A punter knows: missing a star striker changes everything.
// A confirmed lineup is worth more than any model.
//
// Key signals:
// - Confirmed lineup = much higher reliability
// - Key absences (star players, GK, captain) = significant impact
// - Formation matchup (3-5-2 vs 4-3-3 = different game)
// - Squad rotation = weaker team
// ═══════════════════════════════════════════════════════════════════════

import type { LineupIntel, ModelPrediction } from '../types';
import { clamp } from '../../utils';

interface LineupData {
  lineup_status: string | null;
  home_formation: string | null;
  away_formation: string | null;
  home_players_json: string;
  away_players_json: string;
  home_unavailable_json: string;
  away_unavailable_json: string;
  home_confidence: number | null;
  away_confidence: number | null;
}

export interface TeamStandingData {
  team_id: number;
  team_name: string;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  played: number;
}

/**
 * Build lineup intelligence from Turso data.
 */
export function buildLineupIntel(
  lineup: LineupData | null,
  homeTeamName: string,
  awayTeamName: string
): LineupIntel {
  if (!lineup) {
    return {
      lineupStatus: 'unavailable',
      homeFormation: null,
      awayFormation: null,
      homeKeyAbsences: [],
      awayKeyAbsences: [],
      formationMatchup: 'Unknown — lineups not available',
      homeSquadStrength: 0.5,
      awaySquadStrength: 0.5,
    };
  }

  // Parse unavailable players
  const homeUnavailable = safeParseJson(lineup.home_unavailable_json);
  const awayUnavailable = safeParseJson(lineup.away_unavailable_json);

  const homeKeyAbsences = extractKeyAbsences(homeUnavailable, homeTeamName);
  const awayKeyAbsences = extractKeyAbsences(awayUnavailable, awayTeamName);

  // Formation matchup analysis
  const formationMatchup = analyzeFormationMatchup(
    lineup.home_formation,
    lineup.away_formation
  );

  // Squad strength based on key absences
  const homeSquadStrength = assessSquadStrength(homeKeyAbsences, 0.5);
  const awaySquadStrength = assessSquadStrength(awayKeyAbsences, 0.5);

  return {
    lineupStatus: lineup.lineup_status || 'unavailable',
    homeFormation: lineup.home_formation,
    awayFormation: lineup.away_formation,
    homeKeyAbsences: homeKeyAbsences.map((p) => p.name),
    awayKeyAbsences: awayKeyAbsences.map((p) => p.name),
    formationMatchup,
    homeSquadStrength,
    awaySquadStrength,
  };
}

function safeParseJson(json: string): any[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface AbsentPlayer {
  name: string;
  position: string;
  impact: number; // 0-1
}

function extractKeyAbsences(unavailable: any[], teamName: string): AbsentPlayer[] {
  const absences: AbsentPlayer[] = [];

  for (const p of unavailable) {
    const position = (p.position || '').toUpperCase();
    let impact = 0.2; // Default low impact

    // Higher impact for key positions
    if (position === 'G' || position === 'GK') impact = 0.4; // GK absence = huge
    else if (position === 'F' || position.includes('STRIKER') || position.includes('FORWARD')) impact = 0.35;
    else if (position === 'M' || position.includes('MIDFIELD')) impact = 0.25;
    else if (position === 'D' || position.includes('DEFENDER')) impact = 0.3;

    absences.push({
      name: p.name || p.short_name || 'Unknown',
      position,
      impact,
    });
  }

  return absences.sort((a, b) => b.impact - a.impact);
}

function analyzeFormationMatchup(
  homeFormation: string | null,
  awayFormation: string | null
): string {
  if (!homeFormation || !awayFormation) return 'Formations not available';

  const hDef = getFormationDefenders(homeFormation);
  const aDef = getFormationDefenders(awayFormation);
  const hAtt = getFormationAttackers(homeFormation);
  const aAtt = getFormationAttackers(awayFormation);

  if (hDef >= 5 && aAtt >= 3) return 'Home defensive wall vs away attacking trio — low-scoring expected';
  if (aDef >= 5 && hAtt >= 3) return 'Away defensive wall vs home attacking trio — tactical battle';
  if (hAtt >= 3 && aAtt >= 3) return 'Both teams attack-minded — expect an open game';
  if (hDef >= 5 && aDef >= 5) return 'Both teams defensive — cagey affair likely';
  if (hAtt >= 3 && aDef <= 3) return 'Home attacks with numbers vs thin away defense — goals likely';
  if (aAtt >= 3 && hDef <= 3) return 'Away attacks with numbers vs thin home defense — goals likely';

  return `${homeFormation} vs ${awayFormation} — standard tactical matchup`;
}

function getFormationDefenders(formation: string): number {
  const parts = formation.split('-').map(Number);
  return parts[0] || 4;
}

function getFormationAttackers(formation: string): number {
  const parts = formation.split('-').map(Number);
  return parts.length > 2 ? parts[parts.length - 1] : 1;
}

function assessSquadStrength(absences: AbsentPlayer[], baseStrength: number): number {
  let strength = baseStrength;
  for (const a of absences) {
    strength -= a.impact * 0.15; // Each absence reduces strength
  }
  return clamp(strength, 0.2, 0.9);
}

/**
 * Lineup-adjusted model prediction.
 *
 * Adjusts base prediction based on squad strength differences.
 */
export function calculateLineupPrediction(
  lineup: LineupIntel,
  homeStats: TeamStandingData | null,
  awayStats: TeamStandingData | null
): ModelPrediction {
  if (lineup.lineupStatus === 'unavailable') {
    return { homeWinProb: 0.42, drawProb: 0.28, awayWinProb: 0.30, homeExpectedGoals: 1.35, awayExpectedGoals: 1.15, reliability: 0.05 };
  }

  const homeStrength = lineup.homeSquadStrength;
  const awayStrength = lineup.awaySquadStrength;
  const strengthDiff = homeStrength - awayStrength;

  // Base probabilities adjusted by squad strength
  let homeWinProb = 0.42 + strengthDiff * 0.3;
  let drawProb = 0.28;
  let awayWinProb = 0.30 - strengthDiff * 0.3;

  // Home advantage
  homeWinProb += 0.05;
  awayWinProb -= 0.05;

  // Expected goals based on squad strength
  const homeGoalBase = (homeStats?.gf || 1.3) / Math.max(1, homeStats?.played || 1);
  const awayGoalBase = (awayStats?.gf || 1.0) / Math.max(1, awayStats?.played || 1);

  const homeExpectedGoals = clamp(homeGoalBase * (homeStrength / 0.5) * 1.05, 0.3, 3.5);
  const awayExpectedGoals = clamp(awayGoalBase * (awayStrength / 0.5) * 0.95, 0.2, 3.0);

  // Normalize probabilities
  homeWinProb = Math.max(0.05, homeWinProb);
  awayWinProb = Math.max(0.05, awayWinProb);
  drawProb = Math.max(0.05, drawProb);
  const total = homeWinProb + drawProb + awayWinProb;

  // Reliability: confirmed lineups are much more reliable
  let reliability = 0.15;
  if (lineup.lineupStatus === 'confirmed') reliability = 0.55;
  else if (lineup.lineupStatus === 'predicted') reliability = 0.3;

  // If there are key absences, reduce reliability slightly (more uncertainty)
  const totalAbsences = lineup.homeKeyAbsences.length + lineup.awayKeyAbsences.length;
  if (totalAbsences > 3) reliability -= 0.1;

  return {
    homeWinProb: homeWinProb / total,
    drawProb: drawProb / total,
    awayWinProb: awayWinProb / total,
    homeExpectedGoals: Math.round(homeExpectedGoals * 100) / 100,
    awayExpectedGoals: Math.round(awayExpectedGoals * 100) / 100,
    reliability: clamp(reliability, 0.05, 0.7),
  };
}
