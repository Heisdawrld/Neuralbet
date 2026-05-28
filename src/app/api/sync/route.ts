import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db/schema';
import { runFullSync, runQuickSync, syncEvents, syncStandings, syncOdds, syncLineups, syncManagers, syncReferees, syncEventStats, syncPolymarket, syncLeagues, syncOddsMovement, syncInPlayEvents, syncIncidents } from '@/lib/db/sync-engine';

export const dynamic = 'force-dynamic';

// Initialize DB on first call
let dbInitialized = false;

async function ensureDb(): Promise<void> {
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }
}

/**
 * POST /api/sync
 * Body: { type: 'full' | 'quick' | 'events' | 'standings' | 'odds' | 'lineups' | 'managers' | 'referees' | 'stats' | 'polymarket' | 'leagues' | 'odds_movement' | 'inplay' | 'incidents' }
 * 
 * Triggers data sync from BSD API → Turso database.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDb();

    const body = await request.json().catch(() => ({}));
    const syncType = body.type || 'quick';

    let result: any;

    switch (syncType) {
      case 'full':
        result = await runFullSync();
        break;
      case 'quick':
        result = await runQuickSync();
        break;
      case 'events':
        result = { events: await syncEvents() };
        break;
      case 'standings':
        result = { standings: await syncStandings(body.leagueIds) };
        break;
      case 'odds':
        result = { odds: await syncOdds(body.eventIds) };
        break;
      case 'lineups':
        result = { lineups: await syncLineups(body.eventIds) };
        break;
      case 'managers':
        result = { managers: await syncManagers() };
        break;
      case 'referees':
        result = { referees: await syncReferees() };
        break;
      case 'stats':
        result = { stats: await syncEventStats(body.eventIds) };
        break;
      case 'polymarket':
        result = { polymarket: await syncPolymarket(body.eventIds) };
        break;
      case 'leagues':
        result = { leagues: await syncLeagues() };
        break;
      case 'odds_movement':
        result = { oddsMovement: await syncOddsMovement(body.eventIds) };
        break;
      case 'inplay':
        result = { inPlay: await syncInPlayEvents() };
        break;
      case 'incidents':
        result = { incidents: await syncIncidents(body.eventIds) };
        break;
      default:
        result = await runQuickSync();
    }

    return NextResponse.json({
      success: true,
      syncType,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Sync API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync
 * Returns sync status — when each data source was last synced.
 */
export async function GET() {
  try {
    await ensureDb();
    const { getTursoClient } = await import('@/lib/db/turso-client');
    const db = getTursoClient();

    const result = await db.execute(
      `SELECT sync_type, last_sync_at, records_synced, status, error_message
       FROM sync_tracker ORDER BY last_sync_at DESC`
    );

    return NextResponse.json({
      syncStatus: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Sync status error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
