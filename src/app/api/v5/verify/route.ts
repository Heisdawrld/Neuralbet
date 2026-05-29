// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Verify API
//
// GET /api/v5/verify
//   Verifies all pending finished matches against predictions.
//   Returns accuracy stats + newly verified results.
//
// GET /api/v5/verify?stats=true
//   Returns accuracy stats only (no verification triggered).
//
// This is the feedback loop. Call it after syncing to score results.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db/schema';
import { verifyAllPendingResults, getAccuracyStats } from '@/lib/prediction-engine/v5/results/verify';

export const dynamic = 'force-dynamic';

let dbReady = false;
async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDb();

    const { searchParams } = new URL(request.url);
    const statsOnly = searchParams.get('stats') === 'true';

    if (statsOnly) {
      const stats = await getAccuracyStats();
      return NextResponse.json({
        mode: 'stats',
        ...stats,
      });
    }

    // Full verification run
    const result = await verifyAllPendingResults();

    return NextResponse.json({
      mode: 'verify',
      newlyVerified: result.verified,
      results: result.results,
      accuracy: result.accuracy,
    });
  } catch (error: any) {
    console.error('[V5 Verify] Error:', error);
    return NextResponse.json(
      { error: 'Verification failed', details: error.message },
      { status: 500 }
    );
  }
}
