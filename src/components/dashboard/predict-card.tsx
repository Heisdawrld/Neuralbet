'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Brain, Loader2, Lock, TrendingUp } from 'lucide-react';
import type { CipherPrediction } from '@/lib/cipher/types';

const CONFIDENCE_COLORS = {
  STRONG: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-400/20' },
  LEAN: { bg: 'bg-blue-500/10', text: 'text-blue-300', border: 'border-blue-400/20' },
  WATCH: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-400/20' },
  SKIP: { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-400/20' },
};

const RISK_ICONS = { SAFE: '🛡️', BALANCED: '⚖️', AGGRESSIVE: '⚡', NO_BET: '🚫' };

type PredictionError = { error: string; detail?: string; upgrade?: { message: string } };

export function PredictCard({ fixtureId }: { fixtureId: number }) {
  const [pred, setPred] = useState<CipherPrediction | null>(null);
  const [error, setError] = useState<PredictionError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPred(null);

    fetch(`/api/predict?fixtureId=${fixtureId}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw (data ?? { error: `Prediction failed (${res.status})` });
        return data as CipherPrediction;
      })
      .then((data) => { if (!cancelled) setPred(data); })
      .catch((err) => {
        if (!cancelled) setError({ error: err?.error ?? 'Could not fetch prediction.', detail: err?.detail, upgrade: err?.upgrade });
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fixtureId]);

  if (loading) {
    return (
      <div className="glass rounded-3xl p-8 text-center text-slate-400">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-blue-300" />
        <p className="font-medium">Cipher is reading the match...</p>
      </div>
    );
  }

  if (!pred || error) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-slate-400">
        <AlertCircle className="mx-auto mb-3 h-6 w-6 text-amber-400" />
        <p className="font-medium">{error?.error ?? 'Could not fetch prediction.'}</p>
        {error?.detail && <p className="mt-2 text-xs text-slate-500">{error.detail}</p>}
        {error?.upgrade && <p className="mt-2 text-sm text-blue-300">{error.upgrade.message}</p>}
      </div>
    );
  }

  const conf = CONFIDENCE_COLORS[pred.confidence];

  return (
    <div className="glass rounded-3xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-300" />
            <h2 className="text-xl font-black text-white sm:text-2xl">Cipher Report</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">Fixture #{fixtureId} · {pred.tier.toUpperCase()} tier</p>
        </div>
        <div className={`rounded-2xl ${conf.bg} border ${conf.border} px-4 py-2`}><span className={`text-sm font-bold ${conf.text}`}>{pred.confidence}</span></div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Best Read" value={pred.selection} sub={pred.market} />
        <Metric label="Model Probability" value={`${(pred.probability * 100).toFixed(0)}%`} accent="text-blue-300" />
        <Metric label="Fair Odds" value={pred.fairOdds.toFixed(2)} />
        <Metric label="Bookmaker Odds" value={pred.bookmakerOdds?.toFixed(2) ?? '—'} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" /><span className="text-xs uppercase text-slate-500">Edge</span></div>
          <div className="mt-2 text-2xl font-black text-emerald-300">{pred.edge ? `+${(pred.edge * 100).toFixed(1)}%` : '—'}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="mb-2 text-xs uppercase text-slate-500">Risk Level</div>
          <div className="text-3xl">{RISK_ICONS[pred.risk]}</div>
          <div className="mt-1 text-sm font-bold text-slate-300">{pred.risk}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs uppercase text-slate-500">Stake (Kelly)</div>
          <div className="mt-2 text-xl font-black text-violet-300">{(pred.stakeFraction * 100).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-slate-400">of bankroll</div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="mb-3 text-sm font-bold text-slate-200">Analysis</div>
        <p className="text-sm leading-relaxed text-slate-300">{pred.report}</p>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200">Market Matrix</h3>
          {pred.lockedPicks > 0 && <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300"><Lock className="mr-1 inline h-3 w-3" /> {pred.lockedPicks} locked</span>}
        </div>
        <div className="space-y-2">
          {pred.picks.map((pick) => (
            <div key={`${pick.market}-${pick.selection}`} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-sm font-bold text-white">{pick.selection}</div><div className="text-xs text-slate-500">{pick.market}</div></div>
              <div className="text-right"><div className="text-sm font-black text-blue-300">{(pick.probability * 100).toFixed(1)}%</div><div className="text-xs text-slate-500">{pick.confidence} · edge {pick.edge ? `${(pick.edge * 100).toFixed(1)}%` : '—'}</div></div>
            </div>
          ))}
        </div>
      </div>

      {pred.confidence !== 'SKIP' && (
        <div className="flex gap-3">
          <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 font-bold text-white shadow-[0_0_36px_rgba(59,130,246,.35)] hover:bg-blue-400">
            {pred.confidence === 'STRONG' ? '💰' : '👀'} {pred.confidence === 'STRONG' ? 'Place Bet' : 'View Markets'} <ArrowRight className="h-4 w-4" />
          </button>
          <button className="rounded-2xl border border-slate-700 bg-slate-900/50 px-5 py-3 font-bold text-slate-200 hover:border-blue-400/40">Save for later</button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub, accent = 'text-slate-200' }: { label: string; value: string; sub?: string; accent?: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="text-xs uppercase text-slate-500">{label}</div><div className={`mt-2 text-xl font-black ${accent}`}>{value}</div>{sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}</div>;
}
