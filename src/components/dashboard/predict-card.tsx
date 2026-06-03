import { AlertCircle, ArrowRight, Brain, TrendingUp } from 'lucide-react';
import type { CipherPrediction } from '@/lib/cipher/types';

const CONFIDENCE_COLORS = {
  STRONG: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-400/20' },
  LEAN: { bg: 'bg-blue-500/10', text: 'text-blue-300', border: 'border-blue-400/20' },
  WATCH: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-400/20' },
  SKIP: { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-400/20' },
};

const RISK_ICONS = {
  SAFE: '🛡️',
  BALANCED: '⚖️',
  AGGRESSIVE: '⚡',
  NO_BET: '🚫',
};

async function fetchPrediction(fixtureId: number): Promise<CipherPrediction | null> {
  try {
    const res = await fetch(`/api/predict?fixtureId=${fixtureId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function PredictCard({ fixtureId }: { fixtureId: number }) {
  const pred = await fetchPrediction(fixtureId);

  if (!pred) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-slate-400">
        <AlertCircle className="mx-auto h-6 w-6 mb-3 text-amber-400" />
        <p className="font-medium">Could not fetch prediction.</p>
      </div>
    );
  }

  const conf = CONFIDENCE_COLORS[pred.confidence];

  return (
    <div className="glass rounded-3xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-300" />
            <h2 className="text-2xl font-black text-white">Cipher Report</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">Fixture #{fixtureId}</p>
        </div>
        <div className={`rounded-2xl ${conf.bg} border ${conf.border} px-4 py-2`}>
          <span className={`text-sm font-bold ${conf.text}`}>{pred.confidence}</span>
        </div>
      </div>

      {/* Main prediction */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-500 uppercase">Selection</div>
          <div className="mt-2 text-xl font-black text-white">{pred.selection}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-500 uppercase">Model Probability</div>
          <div className="mt-2 text-xl font-black text-blue-300">{(pred.probability * 100).toFixed(0)}%</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-500 uppercase">Fair Odds</div>
          <div className="mt-2 text-xl font-black text-slate-200">{pred.fairOdds.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-500 uppercase">Bookmaker Odds</div>
          <div className="mt-2 text-xl font-black text-slate-200">{pred.bookmakerOdds?.toFixed(2) ?? '—'}</div>
        </div>
      </div>

      {/* Edge & Risk */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-slate-500 uppercase">Edge</span>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-300">
            {pred.edge ? `+${(pred.edge * 100).toFixed(1)}%` : '—'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-500 uppercase mb-2">Risk Level</div>
          <div className="text-3xl">{RISK_ICONS[pred.risk]}</div>
          <div className="mt-1 text-sm font-bold text-slate-300">{pred.risk}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs text-slate-500 uppercase">Stake (Kelly)</div>
          <div className="mt-2 text-xl font-black text-violet-300">{(pred.stakeFraction * 100).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-slate-400">of bankroll</div>
        </div>
      </div>

      {/* Analyst report */}
      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="text-sm font-bold text-slate-200 mb-3">Analysis</div>
        <p className="text-sm leading-relaxed text-slate-300">{pred.report}</p>
      </div>

      {/* CTA */}
      {pred.confidence !== 'SKIP' && (
        <div className="flex gap-3">
          <button className="flex-1 rounded-2xl bg-blue-500 px-5 py-3 font-bold text-white shadow-[0_0_36px_rgba(59,130,246,.35)] hover:bg-blue-400 flex items-center justify-center gap-2">
            {pred.confidence === 'STRONG' ? '💰' : '👀'} {pred.confidence === 'STRONG' ? 'Place Bet' : 'View Markets'}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button className="rounded-2xl border border-slate-700 bg-slate-900/50 px-5 py-3 font-bold text-slate-200 hover:border-blue-400/40">
            Save for later
          </button>
        </div>
      )}
    </div>
  );
}
