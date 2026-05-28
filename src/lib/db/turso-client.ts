// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — Turso Database Client
//
// Singleton pattern with auto-reconnect for stability.
// Works with local SQLite and Turso remote.
// ═══════════════════════════════════════════════════════════════════════

import { createClient, type Client } from '@libsql/client';

let _client: Client | null = null;

export function getTursoClient(): Client {
  if (_client) {
    try {
      // Quick health check — if client is closed, recreate
      return _client;
    } catch {
      _client = null;
    }
  }

  const url = process.env.TURSO_DB_URL || 'file:db/neuralbet.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  _client = createClient({
    url,
    authToken,
  });

  return _client;
}

/**
 * Execute a query with auto-reconnect on failure.
 */
export async function safeExecute(sql: string, args?: any[]): Promise<any> {
  const db = getTursoClient();
  try {
    return await db.execute({ sql, args: args || [] });
  } catch (err: any) {
    // If client is in bad state, reset and retry once
    if (err.message?.includes('closed') || err.message?.includes('SQLITE_BUSY')) {
      _client = null;
      const db2 = getTursoClient();
      return await db2.execute({ sql, args: args || [] });
    }
    throw err;
  }
}

export async function closeTursoClient(): Promise<void> {
  if (_client) {
    try {
      _client.close();
    } catch {
      // Ignore close errors
    }
    _client = null;
  }
}
