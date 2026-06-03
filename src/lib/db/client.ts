import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

export function db(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL || 'file:./cipher.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  if (url.startsWith('libsql://') && !authToken) {
    throw new Error('TURSO_AUTH_TOKEN is required for remote Turso databases');
  }
  client = createClient({ url, authToken });
  return client;
}
