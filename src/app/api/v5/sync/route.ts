// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Sync API (Lightweight steps for Vercel 60s limit)
//
// GET /api/v5/sync?step=1  — Events + Leagues (fast, ~10s)
// GET /api/v5/sync?step=2  — Standings + Odds for upcoming (medium, ~30s)
// GET /api/v5/sync?step=3  — Lineups + Managers + Referees (medium, ~25s)
// GET /api/v5/sync?step=4  — H2H + Verify + Cache cleanup (medium, ~20s)
// GET /api/v5/sync          — Runs step 1 (safest default)
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
} from '@/lib/db/sync-engine';
import { syncH2HForUpcomingFixtures } from '@/lib/db/sync-h2h';
import { verifyAllPendingResults } from '@/lib/prediction-engine/v5/results/verify';
import { safeExecute } from '@/lib/db/turso-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let dbReady = false;
async function ensureDb(): Promise<void> {
  if (!dbReady) { await initializeDatabase(); dbReady = true; }
}

async function getIds(query: string): Promise<number[]> {
  try {
    const r = await safeExecute(query, []);
    return (r.rows || []).map((row: any) => Number(row.id || row.league_id)).filter(Boolean);
  } catch { return []; }
}

async function handleSync(request: NextRequest) {
  try {
    await ensureDb();
    const start = Date.now();
    const step = new URL(request.url).searchParams.get('step') || '1';
    const results: Record<string, any> = { step, errors: [] as string[] };

    if (step === '1') {
      // Events + finished + leagues — minimal, fast
      try { results.events = await syncEvents('notstarted', 50); } catch (e: any) { results.errors.push(e.message); }
      try { results.finished = await syncFinishedEvents(3); } catch (e: any) { results.errors.push(e.message); }
      try { results.leagues = await syncLeagues(); } catch (e: any) { results.errors.push(e.message); }
      // Clean stale 0-0 scores
      try { await safeExecute(`UPDATE events SET home_score=NULL, away_score=NULL WHERE status='notstarted' AND home_score=0 AND away_score=0`, []); } catch {}
    }

    else if (step === '2') {
      // Standings (top 8 leagues) + odds (top 20 events)
      const leagueIds = await getIds(`SELECT DISTINCT league_id FROM events WHERE status='notstarted' LIMIT 8`);
      const eventIds = await getIds(`SELECT id FROM events WHERE status='notstarted' ORDER BY event_date ASC LIMIT 20`);
      try { results.standings = await syncStandings(leagueIds); } catch (e: any) { results.errors.push(e.message); }
      try { results.odds = await syncOdds(eventIds); } catch (e: any) { results.errors.push(e.message); }
    }

    else if (step === '3') {
      // Lineups + managers + referees
      const eventIds = await getIds(`SELECT id FROM events WHERE status='notstarted' ORDER BY event_date ASC LIMIT 20`);
      try { results.lineups = await syncLineups(eventIds); } catch (e: any) { results.errors.push(e.message); }
      try { results.managers = await syncManagers(); } catch (e: any) { results.errors.push(e.message); }
      try { results.referees = await syncReferees(); } catch (e: any) { results.errors.push(e.message); }
    }

    else if (step === '4') {
      // H2H + verify + cache cleanup
      try { const h = await syncH2HForUpcomingFixtures(3); results.h2h = h.h2hRowsWritten; } catch (e: any) { results.errors.push(e.message); }
      // Clear stale SKIP predictions
      try { const c = await safeExecute(`DELETE FROM predictions_v2 WHERE no_safe_pick=1 AND updated_at < datetime('now','-2 hours')`, []); results.skipsCleared = c.rowsAffected || 0; } catch {}
      // Verify
      try { const v = await verifyAllPendingResults(); results.verification = { verified: v.verified, wins: v.accuracy.wins, losses: v.accuracy.losses, hitRate: v.accuracy.hitRate, avgBrier: v.accuracy.avgBrier }; } catch (e: any) { results.errors.push(e.message); }
    }

    results.duration = `${((Date.now() - start) / 1000).toFixed(1)}s`;
    results.nextStep = step === '1' ? '2' : step === '2' ? '3' : step === '3' ? '4' : 'done';
    results.success = true;
    results.timestamp = new Date().toISOString();

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: 'Sync failed', details: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handleSync(req); }
export async function POST(req: NextRequest) { return handleSync(req); }
