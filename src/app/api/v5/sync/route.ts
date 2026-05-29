// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Sync API (Step-based to avoid Vercel 60s timeout)
//
// GET /api/v5/sync?step=1   — Events + Leagues + Standings
// GET /api/v5/sync?step=2   — Odds + Lineups + Managers + Referees
// GET /api/v5/sync?step=3   — Stats + Polymarket + H2H + Verify
// GET /api/v5/sync?step=all — Run everything (may timeout on hobby)
// GET /api/v5/sync           — Same as step=1 (safest default)
// POST also supported.
//
// Call steps 1→2→3 sequentially to do a full sync within limits.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db/schema';
import {
  syncEvents,
  syncFinishedEvents,
  syncLeagues,
  syncStandings,
  syncOdds,
  syncLineups,
  syncManagers,
  syncReferees,
  syncEventStats,
  syncPolymarket,
} from '@/lib/db/sync-engine';
import { syncH2HForUpcomingFixtures } from '@/lib/db/sync-h2h';
import { verifyAllPendingResults } from '@/lib/prediction-engine/v5/results/verify';
import { getTursoClient, safeExecute } from '@/lib/db/turso-client';

export const dynamic = 'force-dynamic';

let dbReady = false;
async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

// ── Helpers to get event/league IDs from DB ─────────────────────────

async function getUpcomingEventIds(): Promise<number[]> {
  try {
    const r = await safeExecute(
      `SELECT id FROM events WHERE status = 'notstarted' ORDER BY event_date ASC LIMIT 80`,
      []
    );
    return (r.rows || []).map((row: any) => Number(row.id)).filter(Boolean);
  } catch { return []; }
}

async function getLeagueIds(): Promise<number[]> {
  try {
    const r = await safeExecute(
      `SELECT DISTINCT league_id FROM events WHERE status = 'notstarted' LIMIT 30`,
      []
    );
    return (r.rows || []).map((row: any) => Number(row.league_id)).filter(Boolean);
  } catch { return []; }
}

async function getFinishedEventIds(): Promise<number[]> {
  try {
    const r = await safeExecute(
      `SELECT id FROM events WHERE status IN ('finished','FT','AET','PEN') ORDER BY event_date DESC LIMIT 80`,
      []
    );
    return (r.rows || []).map((row: any) => Number(row.id)).filter(Boolean);
  } catch { return []; }
}

// ── Step runners ────────────────────────────────────────────────────

async function runStep1() {
  const results: Record<string, any> = { step: 1, errors: [] };

  try { results.events = await syncEvents('notstarted', 200); }
  catch (e: any) { results.errors.push(`Events: ${e.message}`); }

  try { results.finishedEvents = await syncFinishedEvents(7); }
  catch (e: any) { results.errors.push(`Finished: ${e.message}`); }

  try { results.leagues = await syncLeagues(); }
  catch (e: any) { results.errors.push(`Leagues: ${e.message}`); }

  try {
    const leagueIds = await getLeagueIds();
    results.standings = await syncStandings(leagueIds);
  } catch (e: any) { results.errors.push(`Standings: ${e.message}`); }

  // Clean stale 0-0 scores for upcoming matches (BUG #11 cleanup)
  try {
    await safeExecute(
      `UPDATE events SET home_score = NULL, away_score = NULL
       WHERE status = 'notstarted' AND home_score = 0 AND away_score = 0`,
      []
    );
  } catch {}

  return results;
}

async function runStep2() {
  const results: Record<string, any> = { step: 2, errors: [] };
  const eventIds = await getUpcomingEventIds();

  try { results.odds = await syncOdds(eventIds); }
  catch (e: any) { results.errors.push(`Odds: ${e.message}`); }

  try { results.lineups = await syncLineups(eventIds); }
  catch (e: any) { results.errors.push(`Lineups: ${e.message}`); }

  try { results.managers = await syncManagers(); }
  catch (e: any) { results.errors.push(`Managers: ${e.message}`); }

  try { results.referees = await syncReferees(); }
  catch (e: any) { results.errors.push(`Referees: ${e.message}`); }

  return results;
}

async function runStep3() {
  const results: Record<string, any> = { step: 3, errors: [] };
  const eventIds = await getUpcomingEventIds();
  const finishedIds = await getFinishedEventIds();

  try { results.eventStats = await syncEventStats(finishedIds); }
  catch (e: any) { results.errors.push(`Stats: ${e.message}`); }

  try { results.polymarket = await syncPolymarket(eventIds); }
  catch (e: any) { results.errors.push(`Polymarket: ${e.message}`); }

  try {
    const h2h = await syncH2HForUpcomingFixtures(7);
    results.h2h = h2h.h2hRowsWritten;
  } catch (e: any) { results.errors.push(`H2H: ${e.message}`); }

  // Invalidate stale SKIP predictions so engine re-runs with new data
  try {
    const cleared = await safeExecute(
      `DELETE FROM predictions_v2 WHERE no_safe_pick = 1
       AND updated_at < datetime('now', '-2 hours')`,
      []
    );
    results.staleSkipsCleared = cleared.rowsAffected || 0;
  } catch {}

  // Verify finished results
  try {
    const v = await verifyAllPendingResults();
    results.verification = {
      verified: v.verified,
      wins: v.accuracy.wins,
      losses: v.accuracy.losses,
      hitRate: v.accuracy.hitRate,
      avgBrier: v.accuracy.avgBrier,
    };
  } catch (e: any) { results.errors.push(`Verify: ${e.message}`); }

  return results;
}

// ── Route handler ───────────────────────────────────────────────────

async function handleSync(request: NextRequest) {
  try {
    await ensureDb();
    const startTime = Date.now();

    const { searchParams } = new URL(request.url);
    const step = searchParams.get('step') || '1';

    let results: Record<string, any>;

    if (step === 'all') {
      const r1 = await runStep1();
      const r2 = await runStep2();
      const r3 = await runStep3();
      results = { step: 'all', ...r1, ...r2, ...r3, errors: [...(r1.errors || []), ...(r2.errors || []), ...(r3.errors || [])] };
    } else if (step === '2') {
      results = await runStep2();
    } else if (step === '3') {
      results = await runStep3();
    } else {
      results = await runStep1();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      ...results,
      duration: `${duration}s`,
      nextStep: step === '1' ? '2' : step === '2' ? '3' : step === '3' ? 'done' : 'done',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[V5 Sync] Error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) { return handleSync(request); }
export async function POST(request: NextRequest) { return handleSync(request); }
