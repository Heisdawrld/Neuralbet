// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Predict API
//
// GET /api/v5/predict?fixtureId=12345
//
// Checks predictions_v2 for a cached prediction less than 6 hours old.
// If cached: returns the full prediction as it was emitted by the engine
// (we now persist the complete PredictionResult JSON so reconstruction is
// loss-less — earlier versions of this route dropped script/confidence/
// abstainCode fields, which manifested as 'unknown' / 'medium' / null on
// every cache hit).
// If not cached: runs V5 engine, stores the full result, returns it.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { safeExecute } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import { runV5Prediction } from '@/lib/prediction-engine/v5';
import type { PredictionResult } from '@/lib/prediction-engine/v5';

export const dynamic = 'force-dynamic';

let dbReady = false;
async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

function safeParse(val: unknown): any {
  if (!val) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Reconstruct a PredictionResult from a cached row.
 * Preserves every field that the engine emits, including script primary,
 * confidence levels, and abstain code.
 */
function reconstructFromCache(row: any): PredictionResult | null {
  // Preferred: full JSON blob (stored from this version onward)
  const fullJson = safeParse(row.full_json);
  if (fullJson && typeof fullJson === 'object' && fullJson.calibratedProbs) {
    return fullJson as PredictionResult;
  }

  // Fallback: legacy partial-column reconstruction. Returns null when
  // the cached row is too stale/incomplete to be trusted (caller will
  // re-run the engine).
  const probs = safeParse(row.calibrated_probs_json) || {};
  if (Object.keys(probs).length === 0) return null;
  return {
    fixtureId: Number(row.event_id),
    homeTeam: (row.home_team as string) || '',
    awayTeam: (row.away_team as string) || '',
    expectedGoals: safeParse(row.expected_goals_json) || { home: 0, away: 0, total: 0 },
    bestPick: safeParse(row.best_pick_json),
    backupPicks: safeParse(row.backup_picks_json) || [],
    noSafePick: Boolean(row.no_safe_pick),
    noSafePickReason: null,
    abstainCode: null,
    confidence: { model: 'medium', value: 'medium', volatility: 'medium' },
    reasonCodes: safeParse(row.reason_codes_json) || [],
    script: { primary: 'unknown', confidence: 0.5 },
    calibratedProbs: probs,
    dataCompleteness: Number(row.data_completeness || 0),
    engineVersion: (row.engine_version as string) || '5.0.0',
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    // Ensure full_json column exists (additive migration — ALTER fails silently
    // if the column already exists, so safe to call on every request).
    try {
      await safeExecute(`ALTER TABLE predictions_v2 ADD COLUMN full_json TEXT`, []);
    } catch { /* column exists, ignore */ }

    const { searchParams } = new URL(request.url);
    const fixtureIdParam = searchParams.get('fixtureId');
    if (!fixtureIdParam) {
      return NextResponse.json({ error: 'Missing fixtureId parameter' }, { status: 400 });
    }
    const fixtureId = Number(fixtureIdParam);
    if (!fixtureId || isNaN(fixtureId)) {
      return NextResponse.json({ error: 'Invalid fixtureId parameter' }, { status: 400 });
    }

    // Allow opt-out of cache via ?fresh=1 (useful for backtest + debugging)
    const fresh = searchParams.get('fresh') === '1';

    // ── Step 1: Try cache ────────────────────────────────────────────
    if (!fresh) {
      try {
        const predResult = await safeExecute(
          `SELECT * FROM predictions_v2 WHERE event_id = ?`,
          [fixtureId],
        );
        const cachedPred = predResult.rows?.[0];
        if (cachedPred) {
          const updatedAt = new Date(cachedPred.updated_at as string);
          const ttlBoundary = new Date(Date.now() - CACHE_TTL_MS);
          if (updatedAt > ttlBoundary) {
            const reconstructed = reconstructFromCache(cachedPred);
            if (reconstructed) return NextResponse.json(reconstructed);
            // Cache row exists but is incomplete → fall through and re-run
          }
        }
      } catch {
        // predictions_v2 may not exist on a fresh DB — fall through
      }
    }

    // ── Step 2: Run V5 engine ──────────────────────────────────────
    const prediction = await runV5Prediction(fixtureId);

    // ── Step 3: Cache full prediction (loss-less) ──────────────────
    try {
      await safeExecute(
        `INSERT INTO predictions_v2 (
          event_id, home_team, away_team,
          expected_goals_json, best_pick_json, backup_picks_json,
          no_safe_pick, calibrated_probs_json, reason_codes_json,
          data_completeness, engine_version, full_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(event_id) DO UPDATE SET
          home_team = excluded.home_team,
          away_team = excluded.away_team,
          expected_goals_json = excluded.expected_goals_json,
          best_pick_json = excluded.best_pick_json,
          backup_picks_json = excluded.backup_picks_json,
          no_safe_pick = excluded.no_safe_pick,
          calibrated_probs_json = excluded.calibrated_probs_json,
          reason_codes_json = excluded.reason_codes_json,
          data_completeness = excluded.data_completeness,
          engine_version = excluded.engine_version,
          full_json = excluded.full_json,
          updated_at = datetime('now')`,
        [
          fixtureId,
          prediction.homeTeam,
          prediction.awayTeam,
          JSON.stringify(prediction.expectedGoals),
          prediction.bestPick ? JSON.stringify(prediction.bestPick) : null,
          JSON.stringify(prediction.backupPicks),
          prediction.noSafePick ? 1 : 0,
          JSON.stringify(prediction.calibratedProbs),
          JSON.stringify(prediction.reasonCodes),
          prediction.dataCompleteness,
          prediction.engineVersion,
          JSON.stringify(prediction),
        ],
      );
    } catch (cacheErr) {
      console.error(`[V5 Predict] Failed to cache prediction for fixture ${fixtureId}:`, cacheErr);
    }

    return NextResponse.json(prediction);
  } catch (error: any) {
    console.error('[V5 Predict] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate prediction', details: error.message },
      { status: 500 },
    );
  }
}
