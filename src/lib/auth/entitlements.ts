import { db } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';

export type Entitlement = {
  userId: string;
  plan: 'free' | 'premium';
  predictionsToday: number;
  limit: number;
  remaining: number;
};

export async function getEntitlement(userId: string): Promise<Entitlement> {
  await ensureSchema();
  const cx = db();
  const sub = await cx.execute({ sql: `SELECT plan, status FROM user_subscriptions WHERE clerk_user_id = ?`, args: [userId] });
  const row = sub.rows[0];
  const activePremium = row?.plan === 'premium' && ['active', 'trialing'].includes(String(row?.status ?? 'active'));
  const plan = activePremium ? 'premium' : 'free';
  const usage = await cx.execute({
    sql: `SELECT COUNT(*) AS c FROM user_prediction_log WHERE clerk_user_id = ? AND date = date('now')`,
    args: [userId],
  });
  const predictionsToday = Number(usage.rows[0]?.c ?? 0);
  const limit = plan === 'premium' ? Number.MAX_SAFE_INTEGER : 1;
  return { userId, plan, predictionsToday, limit, remaining: Math.max(0, limit - predictionsToday) };
}

export async function logPredictionUse(userId: string, fixtureId: number) {
  await ensureSchema();
  await db().execute({
    sql: `INSERT INTO user_prediction_log (clerk_user_id, fixture_id, date, created_at) VALUES (?, ?, date('now'), datetime('now'))`,
    args: [userId, fixtureId],
  });
}
