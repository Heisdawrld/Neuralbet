import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { db } from '@/lib/db/client';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const cx = db();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.clerkUserId;
    const subscriptionId = session.subscription as string;
    if (userId) {
      await cx.execute({
        sql: `INSERT INTO user_subscriptions (clerk_user_id, stripe_subscription_id, plan, status, updated_at)
              VALUES (?, ?, 'premium', 'active', datetime('now'))
              ON CONFLICT(clerk_user_id) DO UPDATE SET
                stripe_subscription_id=excluded.stripe_subscription_id,
                plan='premium', status='active', updated_at=excluded.updated_at`,
        args: [userId, subscriptionId],
      });
    }
  }

  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const status = sub.status;
    const isActive = status === 'active' || status === 'trialing';
    await cx.execute({
      sql: `UPDATE user_subscriptions SET plan=?, status=?, updated_at=datetime('now') WHERE stripe_subscription_id=?`,
      args: [isActive ? 'premium' : 'free', status, sub.id],
    });
  }

  return NextResponse.json({ received: true });
}
