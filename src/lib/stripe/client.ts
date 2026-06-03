import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  _stripe = new Stripe(key, { apiVersion: '2025-10-29.clover' });
  return _stripe;
}

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    priceId: null,
    features: [
      "Today's fixtures",
      '1 prediction per day',
      'Basic win/draw/loss probability',
      'Community access',
    ],
    limits: { predictionsPerDay: 1, marketsPerPrediction: 1 },
  },
  premium: {
    name: 'Premium',
    price: 19,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY || null,
    features: [
      'Unlimited predictions — all leagues',
      'Full analyst intelligence report',
      'Edge vs bookmaker odds',
      'Kelly stake calculator',
      '30+ market types',
      'Performance tracker & ROI',
      'Early predictions (24h before kickoff)',
      'Priority model updates',
      'No ads',
    ],
    limits: { predictionsPerDay: Infinity, marketsPerPrediction: 30 },
  },
} as const;

export type Plan = keyof typeof PLANS;
