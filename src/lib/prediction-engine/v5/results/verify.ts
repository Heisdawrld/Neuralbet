// ═══════════════════════════════════════════════════════════════════════
// Result Verification — Compares predictions against actual outcomes
//
// After a match finishes, this module:
// 1. Looks up the cached prediction for that fixture
// 2. Gets the actual final score from the events table
// 3. Determines which markets won/lost
// 4. Stores the result in prediction_results
// 5. Updates running accuracy metrics
//
// This is the feedback loop that makes the model GET BETTER over time.
// Without it, we're just making predictions into the void.
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient, safeExecute } from '@/lib/db/turso-client';

export interface VerificationResult {
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  predictedMarket: string | null;
  predictedSelection: string | null;
  predictedProbability: number | null;
  predictedEdge: number | null;
  actualHomeScore: number;
  actualAwayScore: number;
  outcome: 'win' | 'loss' | 'void' | 'no_prediction';
  brierScore: number | null;
  verifiedAt: string;
}

// ── Market outcome checker ──────────────────────────────────────────

function checkMarketOutcome(
  market: string,
  selection: string,
  homeScore: number,
  awayScore: number,
): 'win' | 'loss' | 'void' {
  const totalGoals = homeScore + awayScore;
  const m = market.toLowerCase();
  const s = selection.toLowerCase();

  // 1X2
  if (m.includes('home_win') || (m.includes('1x2') && s.includes('home'))) {
    return homeScore > awayScore ? 'win' : 'loss';
  }
  if (m.includes('away_win') || (m.includes('1x2') && s.includes('away'))) {
    return awayScore > homeScore ? 'win' : 'loss';
  }
  if (m.includes('draw') || (m.includes('1x2') && s.includes('draw'))) {
    return homeScore === awayScore ? 'win' : 'loss';
  }

  // Over/Under
  if (m.includes('over_15') || s.includes('over 1.5')) return totalGoals > 1.5 ? 'win' : 'loss';
  if (m.includes('over_25') || s.includes('over 2.5')) return totalGoals > 2.5 ? 'win' : 'loss';
  if (m.includes('over_35') || s.includes('over 3.5')) return totalGoals > 3.5 ? 'win' : 'loss';
  if (m.includes('under_15') || s.includes('under 1.5')) return totalGoals < 1.5 ? 'win' : 'loss';
  if (m.includes('under_25') || s.includes('under 2.5')) return totalGoals < 2.5 ? 'win' : 'loss';
  if (m.includes('under_35') || s.includes('under 3.5')) return totalGoals < 3.5 ? 'win' : 'loss';

  // BTTS
  if (m.includes('btts_yes') || s.includes('btts') && s.includes('yes')) {
    return (homeScore > 0 && awayScore > 0) ? 'win' : 'loss';
  }
  if (m.includes('btts_no') || s.includes('btts') && s.includes('no')) {
    return (homeScore === 0 || awayScore === 0) ? 'win' : 'loss';
  }

  // Double Chance
  if (m.includes('dc_1x') || s.includes('home or draw')) {
    return homeScore >= awayScore ? 'win' : 'loss';
  }
  if (m.includes('dc_x2') || s.includes('draw or away')) {
    return awayScore >= homeScore ? 'win' : 'loss';
  }
  if (m.includes('dc_12') || s.includes('home or away')) {
    return homeScore !== awayScore ? 'win' : 'loss';
  }

  // Draw No Bet
  if (m.includes('dnb_home')) {
    if (homeScore === awayScore) return 'void';
    return homeScore > awayScore ? 'win' : 'loss';
  }
  if (m.includes('dnb_away')) {
    if (homeScore === awayScore) return 'void';
    return awayScore > homeScore ? 'win' : 'loss';
  }

  // Can't determine — treat as void
  return 'void';
}

// ── Brier Score for a single prediction ─────────────────────────────

function computeSingleBrier(predictedProb: number, outcome: 'win' | 'loss' | 'void'): number | null {
  if (outcome === 'void') return null;
  const actual = outcome === 'win' ? 1 : 0;
  return (predictedProb - actual) ** 2;
}

// ── Verify a single finished match ──────────────────────────────────

export async function verifyMatchResult(eventId: number): Promise<VerificationResult | null> {
  const db = getTursoClient();

  // Get actual result
  const eventResult = await safeExecute(
    `SELECT id, home_team, away_team, home_score, away_score, status FROM events WHERE id = ?`,
    [eventId]
  );

  const event = eventResult.rows?.[0];
  if (!event) return null;

  const status = (event.status as string || '').toUpperCase();
  const finishedStatuses = ['FT', 'AET', 'PEN', 'FINISHED', 'COMPLETE'];
  if (!finishedStatuses.includes(status)) return null;

  const homeScore = Number(event.home_score);
  const awayScore = Number(event.away_score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  // Get prediction
  const predResult = await safeExecute(
    `SELECT * FROM predictions_v2 WHERE event_id = ?`,
    [eventId]
  );
  const pred = predResult.rows?.[0];

  let predictedMarket: string | null = null;
  let predictedSelection: string | null = null;
  let predictedProb: number | null = null;
  let predictedEdge: number | null = null;
  let outcome: 'win' | 'loss' | 'void' | 'no_prediction' = 'no_prediction';
  let brierScore: number | null = null;

  if (pred) {
    // Try full_json first, then legacy columns
    let bestPick: any = null;
    if (pred.full_json) {
      try {
        const full = JSON.parse(pred.full_json as string);
        bestPick = full.bestPick;
      } catch {}
    }
    if (!bestPick && pred.best_pick_json) {
      try { bestPick = JSON.parse(pred.best_pick_json as string); } catch {}
    }

    if (bestPick && bestPick.marketKey && bestPick.selection) {
      predictedMarket = bestPick.marketKey;
      predictedSelection = bestPick.selection;
      predictedProb = bestPick.modelProbability ?? null;
      predictedEdge = bestPick.edge ?? null;

      outcome = checkMarketOutcome(predictedMarket!, predictedSelection!, homeScore, awayScore);
      if (predictedProb != null) {
        brierScore = computeSingleBrier(predictedProb, outcome);
      }
    } else {
      outcome = 'no_prediction'; // Engine abstained (SKIP)
    }
  }

  const verifiedAt = new Date().toISOString();

  // Store result
  await db.execute({
    sql: `INSERT INTO prediction_results (
      event_id, home_team, away_team,
      predicted_market, predicted_selection, predicted_probability, predicted_edge,
      actual_home_score, actual_away_score,
      outcome, brier_score, verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      actual_home_score = excluded.actual_home_score,
      actual_away_score = excluded.actual_away_score,
      outcome = excluded.outcome,
      brier_score = excluded.brier_score,
      verified_at = excluded.verified_at`,
    args: [
      eventId,
      event.home_team as string,
      event.away_team as string,
      predictedMarket,
      predictedSelection,
      predictedProb,
      predictedEdge,
      homeScore,
      awayScore,
      outcome,
      brierScore,
      verifiedAt,
    ],
  });

  return {
    eventId,
    homeTeam: event.home_team as string,
    awayTeam: event.away_team as string,
    predictedMarket,
    predictedSelection,
    predictedProbability: predictedProb,
    predictedEdge: predictedEdge,
    actualHomeScore: homeScore,
    actualAwayScore: awayScore,
    outcome,
    brierScore,
    verifiedAt,
  };
}

// ── Batch verify all unverified finished matches ────────────────────

export async function verifyAllPendingResults(): Promise<{
  verified: number;
  results: VerificationResult[];
  accuracy: { wins: number; losses: number; voids: number; skips: number; hitRate: number; avgBrier: number };
}> {
  const db = getTursoClient();

  // Find finished events that have predictions but no verification yet
  const pending = await safeExecute(`
    SELECT e.id FROM events e
    INNER JOIN predictions_v2 p ON e.id = p.event_id
    LEFT JOIN prediction_results r ON e.id = r.event_id
    WHERE e.status IN ('FT', 'AET', 'PEN', 'finished', 'complete')
      AND e.home_score IS NOT NULL
      AND e.away_score IS NOT NULL
      AND r.event_id IS NULL
    ORDER BY e.event_date DESC
    LIMIT 200
  `, []);

  const results: VerificationResult[] = [];
  for (const row of pending.rows || []) {
    const result = await verifyMatchResult(Number(row.id));
    if (result) results.push(result);
  }

  // Compute running accuracy
  const allResults = await safeExecute(
    `SELECT outcome, brier_score FROM prediction_results WHERE outcome != 'no_prediction'`,
    []
  );

  let wins = 0, losses = 0, voids = 0, skips = 0;
  let brierSum = 0, brierCount = 0;

  for (const row of allResults.rows || []) {
    const o = row.outcome as string;
    if (o === 'win') wins++;
    else if (o === 'loss') losses++;
    else if (o === 'void') voids++;
    else skips++;

    const b = Number(row.brier_score);
    if (Number.isFinite(b)) {
      brierSum += b;
      brierCount++;
    }
  }

  const settled = wins + losses;
  const hitRate = settled > 0 ? (wins / settled) * 100 : 0;
  const avgBrier = brierCount > 0 ? brierSum / brierCount : 0;

  return {
    verified: results.length,
    results,
    accuracy: { wins, losses, voids, skips, hitRate, avgBrier },
  };
}

// ── Get accuracy stats (for dashboard display) ──────────────────────

export async function getAccuracyStats(): Promise<{
  totalVerified: number;
  wins: number;
  losses: number;
  hitRate: number;
  avgBrier: number;
  recentResults: Array<{ eventId: number; homeTeam: string; awayTeam: string; outcome: string; brierScore: number | null }>;
}> {
  const allResults = await safeExecute(
    `SELECT * FROM prediction_results WHERE outcome IN ('win', 'loss') ORDER BY verified_at DESC`,
    []
  );

  let wins = 0, losses = 0;
  let brierSum = 0, brierCount = 0;

  for (const row of allResults.rows || []) {
    if (row.outcome === 'win') wins++;
    else losses++;
    const b = Number(row.brier_score);
    if (Number.isFinite(b)) { brierSum += b; brierCount++; }
  }

  const settled = wins + losses;

  const recent = (allResults.rows || []).slice(0, 20).map((r: any) => ({
    eventId: Number(r.event_id),
    homeTeam: r.home_team as string,
    awayTeam: r.away_team as string,
    outcome: r.outcome as string,
    brierScore: r.brier_score != null ? Number(r.brier_score) : null,
  }));

  return {
    totalVerified: settled,
    wins,
    losses,
    hitRate: settled > 0 ? (wins / settled) * 100 : 0,
    avgBrier: brierCount > 0 ? brierSum / brierCount : 0,
    recentResults: recent,
  };
}
