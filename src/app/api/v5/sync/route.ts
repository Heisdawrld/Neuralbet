// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Sync API (REBUILT)
//
// POST /api/v5/sync
// GET  /api/v5/sync (also supported for convenience)
//
// Full data pipeline: BSD API → Turso DB.
// Calls every sync-engine function so the engine has ALL data it needs.
//
// Pipeline steps:
//   1. Events (upcoming + recently finished)
//   2. Leagues
//   3. Standings (for all leagues with events)
//   4. Odds (consensus per event)
//   5. Lineups (predicted/confirmed per event)
//   6. Managers (for all teams with events)
//   7. Referees (for all events with referee_id)
//   8. Event stats (for finished events — xG, shots, possession)
//   9. Polymarket odds (prediction market prices)
//  10. H2H (historical head-to-head matches)
//  11. Verify finished results (feedback loop)
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

interface SyncStats {
  events: number;
  finishedEvents: number;
  leagues: number;
  standings: number;
  odds: number;
  lineups: number;
  managers: number;
  referees: number;
  eventStats: number;
  polymarket: number;
  h2h: number;
  errors: string[];
}

async function runFullSync(): Promise<SyncStats> {
  const stats: SyncStats = {
    events: 0, finishedEvents: 0, leagues: 0, standings: 0,
    odds: 0, lineups: 0, managers: 0, referees: 0,
    eventStats: 0, polymarket: 0, h2h: 0, errors: [],
  };

  // ── 1. Sync upcoming events ─────────────────────────────────────
  try {
    stats.events = await syncEvents('notstarted', 200);
  } catch (err: any) {
    stats.errors.push(`Events: ${err?.message ?? err}`);
  }

  // ── 2. Sync recently finished events (for scores + learning) ────
  try {
    stats.finishedEvents = await syncFinishedEvents(7);
  } catch (err: any) {
    stats.errors.push(`Finished events: ${err?.message ?? err}`);
  }

  // ── 3. Sync leagues ─────────────────────────────────────────────
  try {
    stats.leagues = await syncLeagues();
  } catch (err: any) {
    stats.errors.push(`Leagues: ${err?.message ?? err}`);
  }

  // ── 4. Get event IDs + league IDs for targeted sync ─────────────
  let eventIds: number[] = [];
  let leagueIds: number[] = [];
  try {
    const upcoming = await safeExecute(
      `SELECT id, league_id FROM events WHERE status = 'notstarted' ORDER BY event_date ASC LIMIT 100`,
      []
    );
    eventIds = (upcoming.rows || []).map((r: any) => Number(r.id)).filter(Boolean);
    leagueIds = Array.from(new Set((upcoming.rows || []).map((r: any) => Number(r.league_id)).filter(Boolean)));
  } catch {}

  // Also get recently finished event IDs for stats sync
  let finishedEventIds: number[] = [];
  try {
    const finished = await safeExecute(
      `SELECT id FROM events WHERE status IN ('finished', 'FT', 'AET', 'PEN') ORDER BY event_date DESC LIMIT 100`,
      []
    );
    finishedEventIds = (finished.rows || []).map((r: any) => Number(r.id)).filter(Boolean);
  } catch {}

  // ── 5. Sync standings for all leagues with upcoming events ──────
  try {
    stats.standings = await syncStandings(leagueIds);
  } catch (err: any) {
    stats.errors.push(`Standings: ${err?.message ?? err}`);
  }

  // ── 6. Sync odds for upcoming events ────────────────────────────
  try {
    stats.odds = await syncOdds(eventIds);
  } catch (err: any) {
    stats.errors.push(`Odds: ${err?.message ?? err}`);
  }

  // ── 7. Sync lineups for upcoming events ─────────────────────────
  try {
    stats.lineups = await syncLineups(eventIds);
  } catch (err: any) {
    stats.errors.push(`Lineups: ${err?.message ?? err}`);
  }

  // ── 8. Sync managers ────────────────────────────────────────────
  try {
    stats.managers = await syncManagers();
  } catch (err: any) {
    stats.errors.push(`Managers: ${err?.message ?? err}`);
  }

  // ── 9. Sync referees ────────────────────────────────────────────
  try {
    stats.referees = await syncReferees();
  } catch (err: any) {
    stats.errors.push(`Referees: ${err?.message ?? err}`);
  }

  // ── 10. Sync event stats for finished events ────────────────────
  try {
    stats.eventStats = await syncEventStats(finishedEventIds);
  } catch (err: any) {
    stats.errors.push(`Event stats: ${err?.message ?? err}`);
  }

  // ── 11. Sync Polymarket odds for upcoming events ────────────────
  try {
    stats.polymarket = await syncPolymarket(eventIds);
  } catch (err: any) {
    stats.errors.push(`Polymarket: ${err?.message ?? err}`);
  }

  // ── 12. Sync H2H for upcoming fixtures ──────────────────────────
  try {
    const h2hResult = await syncH2HForUpcomingFixtures(7);
    stats.h2h = h2hResult.h2hRowsWritten;
    if (h2hResult.errors.length > 0) {
      stats.errors.push(...h2hResult.errors.slice(0, 3));
    }
  } catch (err: any) {
    stats.errors.push(`H2H: ${err?.message ?? err}`);
  }

  return stats;
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const startTime = Date.now();
    const stats = await runFullSync();

    // ── 13. Verify finished match results ─────────────────────────
    let verification = { verified: 0, hitRate: 0, avgBrier: 0 };
    try {
      const vResult = await verifyAllPendingResults();
      verification = {
        verified: vResult.verified,
        hitRate: vResult.accuracy.hitRate,
        avgBrier: vResult.accuracy.avgBrier,
      };
    } catch (err: any) {
      stats.errors.push(`Verify: ${err?.message ?? err}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      stats,
      verification,
      duration: `${duration}s`,
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

// Also support GET for convenience (browser-triggerable)
export async function GET(request: NextRequest) {
  return POST(request);
}
