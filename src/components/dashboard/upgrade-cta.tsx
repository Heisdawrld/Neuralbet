'use client';

import { useState } from 'react';
import { Zap } from 'lucide-react';

export function UpgradeCTA() {
  const [loading, setLoading] = useState(false);
  const hasStripe = Boolean(process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY);

  const handleUpgrade = async () => {
    if (!hasStripe) return;
    setLoading(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-checkout' }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-bold text-blue-200">Cipher Premium</div>
          <div className="mt-1 text-sm text-slate-400">$19/month — unlimited predictions, full intelligence, edge detection</div>
          {!hasStripe && <div className="mt-2 text-xs text-amber-300">Stripe price ID not configured yet.</div>}
        </div>
        <button
          onClick={handleUpgrade}
          disabled={loading || !hasStripe}
          className="shrink-0 flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(59,130,246,.3)] hover:bg-blue-400 disabled:opacity-50"
        >
          <Zap className="h-4 w-4" />
          {loading ? 'Loading...' : 'Upgrade'}
        </button>
      </div>
    </div>
  );
}
