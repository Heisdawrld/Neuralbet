// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Odds Movement & Steam Detection
//
// The market knows things we don't. When odds move sharply in one
// direction across multiple bookmakers, that's called "steam."
// Steam = smart money is moving the line.
//
// What this gives us:
// - Detect steam moves (sharp odds movement)
// - Measure direction and magnitude of movement
// - Use as a signal: if market moves toward our model → boost confidence
//   if market moves away → reduce confidence, or consider contrarian play
// - Track which bookmakers are moving (sharp vs recreational books)
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from '@/lib/db/turso-client';

export interface OddsMovementEntry {
  market: string;
  outcome: string;
  bookmakerName: string | null;
  decimalOdds: number;
  previousDecimalOdds: number | null;
  movement: string | null;  // 'up', 'down', null
  isMaxQuote: boolean;
}

export interface SteamSignal {
  market: string;
  outcome: string;
  direction: 'toward_model' | 'away_from_model' | 'neutral';
  magnitude: number;         // 0-1, how strong the steam is
  confidence: number;        // 0-1, how reliable the signal is
  description: string;
}

export interface SteamDetectionResult {
  hasSteam: boolean;
  signals: SteamSignal[];
  /** Overall steam score: positive = market agrees with model, negative = disagrees */
  steamScore: number;
  /** Number of bookmakers showing movement */
  bookmakersMoving: number;
  /** Note for analysis */
  note: string;
}

/**
 * Detect steam from odds_movement data.
 * Steam = significant, multi-bookmaker movement in one direction.
 */
export async function detectSteam(
  eventId: number,
  modelProbabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    bttsYes: number;
  },
): Promise<SteamDetectionResult> {
  const db = getTursoClient();

  // Load odds movement data
  const movementResult = await db.execute({
    sql: `SELECT market, outcome, bookmaker_name, decimal_odds, previous_decimal_odds,
                 movement, is_max_quote
          FROM odds_movement WHERE event_id = ?
          ORDER BY market, outcome`,
    args: [eventId],
  });

  const movements: OddsMovementEntry[] = movementResult.rows.map(r => ({
    market: r.market as string,
    outcome: r.outcome as string,
    bookmakerName: r.bookmaker_name as string || null,
    decimalOdds: Number(r.decimal_odds),
    previousDecimalOdds: r.previous_decimal_odds != null ? Number(r.previous_decimal_odds) : null,
    movement: r.movement as string || null,
    isMaxQuote: Boolean(r.is_max_quote),
  }));

  if (movements.length === 0) {
    return {
      hasSteam: false,
      signals: [],
      steamScore: 0,
      bookmakersMoving: 0,
      note: 'No odds movement data available',
    };
  }

  // Group movements by market+outcome to detect consensus
  const grouped = new Map<string, OddsMovementEntry[]>();
  for (const m of movements) {
    const key = `${m.market}|${m.outcome}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  const signals: SteamSignal[] = [];
  let totalSteamScore = 0;

  for (const [key, entries] of grouped) {
    const [market, outcome] = key.split('|');

    // Count movements in each direction
    let downMovements = 0;  // odds shortening = more likely (market thinks this is more probable)
    let upMovements = 0;    // odds drifting = less likely
    let totalMovement = 0;

    for (const e of entries) {
      if (e.previousDecimalOdds === null) continue;
      const diff = e.previousDecimalOdds - e.decimalOdds; // positive = odds shortened
      if (diff > 0.02) {
        downMovements++;
        totalMovement += diff;
      } else if (diff < -0.02) {
        upMovements++;
        totalMovement += Math.abs(diff);
      }
    }

    const totalBookmakers = entries.length;
    const movingBookmakers = downMovements + upMovements;

    if (movingBookmakers === 0) continue;

    // STEAM: >50% of bookmakers moving in same direction
    const isSteam = movingBookmakers > 1 && (downMovements > totalBookmakers * 0.5 || upMovements > totalBookmakers * 0.5);

    if (!isSteam) continue;

    // Direction: odds shortening means market thinks MORE likely
    const oddsShortening = downMovements > upMovements;
    const impliedProbChange = oddsShortening ? 1 : -1; // +1 = market thinks more likely, -1 = less likely

    // Compare with model probability
    const modelProb = getModelProbForOutcome(modelProbabilities, market, outcome);
    const impliedProb = 1 / (entries[0]?.decimalOdds || 2.0);
    const modelSaysLikely = modelProb > impliedProb;

    let direction: 'toward_model' | 'away_from_model' | 'neutral';
    if ((oddsShortening && modelSaysLikely) || (!oddsShortening && !modelSaysLikely)) {
      direction = 'toward_model';
    } else if ((oddsShortening && !modelSaysLikely) || (!oddsShortening && modelSaysLikely)) {
      direction = 'away_from_model';
    } else {
      direction = 'neutral';
    }

    // Magnitude: how much the odds moved, scaled
    const avgMovement = totalMovement / Math.max(1, movingBookmakers);
    const magnitude = Math.min(1, avgMovement / 0.3); // 0.3 movement = max magnitude

    // Confidence: based on number of bookmakers agreeing
    const agreement = movingBookmakers / Math.max(1, totalBookmakers);
    const confidence = Math.min(1, agreement * (movingBookmakers / 3)); // 3+ books = high confidence

    // Steam score contribution
    const scoreContribution = direction === 'toward_model'
      ? magnitude * confidence
      : direction === 'away_from_model'
        ? -magnitude * confidence
        : 0;

    totalSteamScore += scoreContribution;

    signals.push({
      market,
      outcome,
      direction,
      magnitude: Math.round(magnitude * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      description: `${movingBookmakers} books moving ${oddsShortening ? 'down' : 'up'} on ${outcome} in ${market} — ${direction === 'toward_model' ? 'supports our read' : direction === 'away_from_model' ? 'market disagrees with us' : 'neutral'}`,
    });
  }

  const hasSteam = signals.length > 0 && Math.abs(totalSteamScore) > 0.1;
  const bookmakersMoving = new Set(movements.filter(m => m.previousDecimalOdds !== null).map(m => m.bookmakerName)).size;

  const note = hasSteam
    ? `STEAM DETECTED: ${signals.length} signal(s), score ${totalSteamScore.toFixed(2)} — ${totalSteamScore > 0 ? 'market confirms our read' : 'market pushing against our model'}`
    : 'No significant steam detected';

  return {
    hasSteam,
    signals,
    steamScore: Math.round(totalSteamScore * 100) / 100,
    bookmakersMoving,
    note,
  };
}

function getModelProbForOutcome(
  probs: { homeWin: number; draw: number; awayWin: number; over25: number; bttsYes: number },
  market: string,
  outcome: string,
): number {
  const key = `${market.toLowerCase()}_${outcome.toLowerCase()}`;
  switch (key) {
    case '1x2_home win': case 'match_result_home win': case '1x2_home': case 'match_result_home': return probs.homeWin;
    case '1x2_draw': case 'match_result_draw': return probs.draw;
    case '1x2_away win': case 'match_result_away win': case '1x2_away': case 'match_result_away': return probs.awayWin;
    case 'over/under_over': case 'over/under_over 2.5': return probs.over25;
    case 'btts_yes': return probs.bttsYes;
    default: return 0.5;
  }
}

/**
 * Apply steam adjustments to candidate bet scores.
 * If steam is toward the model → boost confidence.
 * If steam is away → reduce confidence and flag as risky.
 */
export function applySteamToCandidates(
  candidates: any[],
  steamResult: SteamDetectionResult,
): any[] {
  if (!steamResult.hasSteam) return candidates;

  return candidates.map(c => {
    let adjustedScore = c.riskRewardScore || c.adjustedScore || 0;
    let reasoning = c.reasoning || '';

    // Find matching steam signal
    const matchingSignal = steamResult.signals.find(
      s => s.market.toLowerCase() === c.market?.toLowerCase() ||
           s.outcome.toLowerCase() === c.selection?.toLowerCase()
    );

    if (matchingSignal) {
      if (matchingSignal.direction === 'toward_model') {
        // Market confirms our read — boost
        adjustedScore *= (1 + matchingSignal.magnitude * 0.3);
        reasoning += ` | Steam confirms: ${matchingSignal.description}`;
      } else if (matchingSignal.direction === 'away_from_model') {
        // Market disagrees — be cautious
        adjustedScore *= (1 - matchingSignal.magnitude * 0.25);
        reasoning += ` | ⚠ Market pushing against: ${matchingSignal.description}`;
      }
    }

    // Overall steam score effect
    if (steamResult.steamScore > 0.3) {
      adjustedScore *= 1.1; // General boost when market agrees
    } else if (steamResult.steamScore < -0.3) {
      adjustedScore *= 0.85; // General penalty when market disagrees
    }

    return {
      ...c,
      riskRewardScore: adjustedScore,
      reasoning,
      _steamApplied: true,
    };
  });
}
