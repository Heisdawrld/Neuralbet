import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { stripe, PLANS } from '@/lib/stripe/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = (await req.json()) as { action: string };

  if (action === 'create-checkout') {
    const priceId = PLANS.premium.priceId;
    if (!priceId) return NextResponse.json({ error: 'Stripe price not configured' }, { status: 500 });

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
      metadata: { clerkUserId: userId },
    });
    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
