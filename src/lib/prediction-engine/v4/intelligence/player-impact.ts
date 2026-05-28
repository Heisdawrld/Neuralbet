// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Player Impact Intelligence
//
// Key player absences can shift match probabilities significantly.
// A missing star striker can reduce xG by 15-25%.
// A missing goalkeeper can increase xG conceded by 10-20%.
//
// What this gives us:
// - Detect key player absences from lineup data
// - Assess impact of each absence on xG and win probability
// - Factor in player form (if they've been producing high xG)
// - Generate human-readable impact notes
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from '@/lib/db/turso-client';

export interface PlayerAbsence {
  playerName: string;
  playerId: number | null;
  position: string;
  reason: string;        // 'injured', 'suspended', 'doubtful', 'unavailable'
  impactRating: number;  // 0-1, how important this player is
  impactType: 'attacking' | 'defensive' | 'midfield' | 'goalkeeping' | 'overall';
  xgReduction: number;   // Estimated xG reduction for the team (0-0.5)
  probAdjustment: number; // Win probability adjustment (-0.1 to -0.05)
}

export interface PlayerImpactResult {
  homeAbsences: PlayerAbsence[];
  awayAbsences: PlayerAbsence[];
  /** Total xG adjustment for home team */
  homeXgAdjustment: number;
  /** Total xG adjustment for away team */
  awayXgAdjustment: number;
  /** Win probability adjustment for home team */
  homeWinProbAdjustment: number;
  /** Win probability adjustment for away team */
  awayWinProbAdjustment: number;
  /** Overall impact severity: 'none' | 'minor' | 'moderate' | 'significant' */
  severity: 'none' | 'minor' | 'moderate' | 'significant';
  /** Human-readable notes */
  notes: string[];
  /** Key absences list for SituationalSummary */
  keyAbsences: string[];
}

/**
 * Assess player impact from lineup data and player stats.
 */
export async function assessPlayerImpact(
  eventId: number,
  homeTeamId: number,
  awayTeamId: number,
  lineupData: any | null,
): Promise<PlayerImpactResult> {
  const db = getTursoClient();

  const homeAbsences: PlayerAbsence[] = [];
  const awayAbsences: PlayerAbsence[] = [];

  // Parse unavailable players from lineup data
  if (lineupData) {
    const homeUnavailable = safeParseJson(lineupData.home_unavailable_json);
    const awayUnavailable = safeParseJson(lineupData.away_unavailable_json);

    if (Array.isArray(homeUnavailable)) {
      for (const p of homeUnavailable) {
        homeAbsences.push(parseAbsence(p, 'home'));
      }
    }
    if (Array.isArray(awayUnavailable)) {
      for (const p of awayUnavailable) {
        awayAbsences.push(parseAbsence(p, 'away'));
      }
    }
  }

  // Enrich with player stats from DB (for top absences)
  await enrichWithPlayerStats(db, homeAbsences, homeTeamId);
  await enrichWithPlayerStats(db, awayAbsences, awayTeamId);

  // Calculate total adjustments
  let homeXgAdj = 0;
  let awayXgAdj = 0;
  let homeProbAdj = 0;
  let awayProbAdj = 0;
  const notes: string[] = [];
  const keyAbsences: string[] = [];

  for (const abs of homeAbsences) {
    homeXgAdj -= abs.xgReduction;
    homeProbAdj += abs.probAdjustment;
    if (abs.impactRating > 0.3) {
      notes.push(`${abs.playerName} (${abs.position}) missing for home side — ${abs.impactType} impact`);
      keyAbsences.push(abs.playerName);
    }
  }

  for (const abs of awayAbsences) {
    awayXgAdj -= abs.xgReduction;
    awayProbAdj += abs.probAdjustment;
    if (abs.impactRating > 0.3) {
      notes.push(`${abs.playerName} (${abs.position}) missing for away side — ${abs.impactType} impact`);
      keyAbsences.push(abs.playerName);
    }
  }

  // Determine severity
  const totalImpact = homeAbsences.reduce((s, a) => s + a.impactRating, 0) +
                      awayAbsences.reduce((s, a) => s + a.impactRating, 0);
  let severity: PlayerImpactResult['severity'] = 'none';
  if (totalImpact > 0.8) severity = 'significant';
  else if (totalImpact > 0.4) severity = 'moderate';
  else if (totalImpact > 0.1) severity = 'minor';

  return {
    homeAbsences,
    awayAbsences,
    homeXgAdjustment: Math.round(homeXgAdj * 100) / 100,
    awayXgAdjustment: Math.round(awayXgAdj * 100) / 100,
    homeWinProbAdjustment: Math.round(homeProbAdj * 1000) / 1000,
    awayWinProbAdjustment: Math.round(awayProbAdj * 1000) / 1000,
    severity,
    notes,
    keyAbsences,
  };
}

function parseAbsence(playerData: any, side: 'home' | 'away'): PlayerAbsence {
  const name = playerData.player_name || playerData.name || 'Unknown';
  const position = playerData.position || playerData.role || '';
  const reason = playerData.reason || playerData.absence_reason || 'unavailable';
  const playerId = playerData.player_id || playerData.id || null;

  // Estimate impact based on position
  let impactRating = 0.2;
  let impactType: PlayerAbsence['impactType'] = 'overall';
  let xgReduction = 0.05;
  let probAdjustment = -0.02;

  const pos = position.toLowerCase();
  if (pos.includes('forward') || pos.includes('striker') || pos.includes('attacker')) {
    impactRating = 0.5;
    impactType = 'attacking';
    xgReduction = 0.15;
    probAdjustment = -0.04;
  } else if (pos.includes('midfield')) {
    impactRating = 0.35;
    impactType = 'midfield';
    xgReduction = 0.08;
    probAdjustment = -0.03;
  } else if (pos.includes('defender') || pos.includes('back')) {
    impactRating = 0.3;
    impactType = 'defensive';
    xgReduction = 0.03;
    probAdjustment = -0.02;
  } else if (pos.includes('goalkeeper') || pos.includes('keeper') || pos.includes('gk')) {
    impactRating = 0.45;
    impactType = 'goalkeeping';
    xgReduction = 0.05;
    probAdjustment = -0.05;
  }

  // Suspended = definitely out, higher impact
  if (reason.toLowerCase().includes('suspend')) {
    probAdjustment *= 1.2;
    xgReduction *= 1.1;
  }

  // Doubtful = might play, lower impact
  if (reason.toLowerCase().includes('doubt')) {
    probAdjustment *= 0.5;
    xgReduction *= 0.5;
    impactRating *= 0.5;
  }

  return {
    playerName: name,
    playerId,
    position,
    reason,
    impactRating: Math.round(impactRating * 100) / 100,
    impactType,
    xgReduction: Math.round(xgReduction * 100) / 100,
    probAdjustment: Math.round(probAdjustment * 1000) / 1000,
  };
}

async function enrichWithPlayerStats(db: any, absences: PlayerAbsence[], teamId: number): Promise<void> {
  // Try to look up each player's recent stats to better gauge impact
  for (const abs of absences) {
    if (!abs.playerId) continue;

    try {
      const statsResult = await db.execute({
        sql: `SELECT p.position, p.specific_position, p.market_value_eur,
                     c.goals, c.assists, c.avg_rating, c.matches
              FROM players p
              LEFT JOIN player_career c ON p.id = c.player_id
              WHERE p.id = ?
              ORDER BY c.season_id DESC LIMIT 1`,
        args: [abs.playerId],
      });

      if (statsResult.rows.length > 0) {
        const stats = statsResult.rows[0];
        const goals = Number(stats.goals || 0);
        const assists = Number(stats.assists || 0);
        const matches = Number(stats.matches || 1);
        const rating = Number(stats.avg_rating || 0);
        const marketValue = Number(stats.market_value_eur || 0);

        // Upgrade impact for high-producing players
        const goalsPerMatch = goals / Math.max(1, matches);
        if (goalsPerMatch > 0.5) {
          abs.impactRating = Math.min(1, abs.impactRating + 0.2);
          abs.xgReduction = Math.min(0.4, abs.xgReduction + goalsPerMatch * 0.1);
          abs.probAdjustment = Math.max(-0.1, abs.probAdjustment - 0.02);
        }

        // High rating = key player
        if (rating > 7.0) {
          abs.impactRating = Math.min(1, abs.impactRating + 0.1);
        }

        // High market value = key player
        if (marketValue > 30000000) {
          abs.impactRating = Math.min(1, abs.impactRating + 0.15);
          abs.probAdjustment = Math.max(-0.1, abs.probAdjustment - 0.01);
        }
      }
    } catch {
      // Silently skip if player stats not available
    }
  }
}

function safeParseJson(val: unknown): any {
  if (!val) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val;
}

/**
 * Apply player impact adjustments to xG and win probabilities.
 */
export function applyPlayerImpact(
  homeXg: number,
  awayXg: number,
  homeWinProb: number,
  awayWinProb: number,
  playerImpact: PlayerImpactResult,
): { adjustedHomeXg: number; adjustedAwayXg: number; adjustedHomeWinProb: number; adjustedAwayWinProb: number } {
  return {
    adjustedHomeXg: Math.max(0.2, homeXg + playerImpact.homeXgAdjustment),
    adjustedAwayXg: Math.max(0.2, awayXg + playerImpact.awayXgAdjustment),
    adjustedHomeWinProb: Math.max(0.02, homeWinProb + playerImpact.homeWinProbAdjustment),
    adjustedAwayWinProb: Math.max(0.02, awayWinProb + playerImpact.awayWinProbAdjustment),
  };
}
