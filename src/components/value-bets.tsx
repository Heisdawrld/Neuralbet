'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchOurValueBets } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Crosshair, TrendingUp, Star, AlertTriangle,
  Percent, Shield, Flame, Brain, Target, Activity,
} from 'lucide-react';
import type { OurValueBetData } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function ValueBets() {
  const { openMatchPanel } = useAppStore();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['our-value-bets'],
    queryFn: fetchOurValueBets,
    refetchInterval: 120000,
  });

  const valueBets = data?.results || [];

  const avgEdge = valueBets.length > 0
    ? (valueBets.reduce((s: number, v: OurValueBetData) => s + v.edge, 0) / valueBets.length * 100).toFixed(1)
    : '0.0';
  const topRating = valueBets.length > 0
    ? Math.max(...valueBets.map((v: OurValueBetData) => v.valueRating))
    : 0;
  const avgKelly = valueBets.length > 0
    ? (valueBets.reduce((s: number, v: OurValueBetData) => s + (v.adjustedKelly || v.kellyStake), 0) / valueBets.length * 100).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Brain className="w-5 h-5 text-emerald-400" />
          </div>
          Value Bets
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Engine probability vs. market odds — risk-adjusted edge detection
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatMini icon={<Crosshair className="w-4 h-4" />} label="Bets Found" value={String(valueBets.length)} color="emerald" />
        <StatMini icon={<TrendingUp className="w-4 h-4" />} label="Avg Edge" value={`${avgEdge}%`} color="cyan" />
        <StatMini icon={<Star className="w-4 h-4" />} label="Top Rating" value={`${topRating}/5`} color="amber" />
        <StatMini icon={<Shield className="w-4 h-4" />} label="Avg Kelly" value={`${avgKelly}%`} color="violet" />
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4">
        <div className="flex items-start gap-3">
          <Activity className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-[12px] text-slate-400 leading-relaxed">
            <span className="text-slate-200 font-medium">How it works: </span>
            The engine compares its calibrated probability against bookmaker implied odds.
            Bets are only <span className="text-emerald-400 font-medium">Actionable</span> when
            the edge exceeds the risk-adjusted threshold and passes all quality checks.
            Kelly stake accounts for bankroll risk.
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl glass-skeleton" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-10 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-slate-400">Failed to load value bets</p>
        </div>
      ) : valueBets.length > 0 ? (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {valueBets.map((vb: OurValueBetData, idx: number) => (
              <motion.div
                key={`${vb.match.id}-${vb.selection}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, delay: idx * 0.03 }}
              >
                <ValueBetCard valueBet={vb} onMatchClick={() => openMatchPanel(vb.match.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-10 text-center">
          <Crosshair className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No value bets right now</p>
          <p className="text-[11px] text-slate-500 mt-1">The market is efficient — check back later</p>
        </div>
      )}
    </div>
  );
}

// ── Stat Mini Card ──────────────────────────────────────────────────

function StatMini({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  const styles: Record<string, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' },
    cyan: { bg: 'bg-cyan-500/10 border-cyan-500/20', text: 'text-cyan-400' },
    amber: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' },
    violet: { bg: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-400' },
  };
  const s = styles[color] || styles.emerald;
  return (
    <div className="glass-card p-3 flex items-center gap-3">
      <div className={cn('p-2 rounded-lg border', s.bg)}>{icon}</div>
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
        <p className={cn('text-xl font-bold font-mono', s.text)}>{value}</p>
      </div>
    </div>
  );
}

// ── Value Bet Card ──────────────────────────────────────────────────

function ValueBetCard({ valueBet, onMatchClick }: { valueBet: OurValueBetData; onMatchClick?: () => void }) {
  const edgePct = (valueBet.edge * 100).toFixed(1);
  const modelPct = (valueBet.modelProbability * 100).toFixed(0);
  const impliedPct = (valueBet.impliedProbability * 100).toFixed(0);
  const adjKellyPct = ((valueBet.adjustedKelly || valueBet.kellyStake) * 100).toFixed(2);

  const risk = valueBet.prediction?.risk;
  const stars = valueBet.valueRating;

  return (
    <div
      className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm p-4 hover:border-emerald-500/20 hover:translate-y-[-1px] transition-all cursor-pointer"
      onClick={onMatchClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-slate-500 truncate">{valueBet.match.leagueName || 'League'}</span>
          {valueBet.isActionable !== false && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] px-1.5 py-0">
              <Flame className="w-2.5 h-2.5 mr-0.5" /> Actionable
            </Badge>
          )}
        </div>
        {/* Stars */}
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={cn('w-3 h-3', i < stars ? 'text-amber-400 fill-amber-400' : 'text-slate-700')} />
          ))}
        </div>
      </div>

      {/* Match + Selection */}
      <p className="text-sm font-medium text-slate-200 mb-2">
        {valueBet.match.homeTeam} vs {valueBet.match.awayTeam}
      </p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 font-semibold">
          {valueBet.selection}
        </Badge>
        <Badge className="bg-white/[0.04] text-slate-300 font-mono text-[11px]">
          @{valueBet.odds.toFixed(2)}
        </Badge>
        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 font-mono font-bold">
          <Percent className="w-3 h-3 mr-0.5" />
          {edgePct}% edge
        </Badge>
      </div>

      {/* Probability Comparison — Visual Bar */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 w-12 shrink-0">Model</span>
          <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${modelPct}%` }}
              transition={{ duration: 0.6 }}
              className="h-full rounded-full bg-emerald-500"
            />
          </div>
          <span className="text-[10px] font-mono text-emerald-400 w-8 text-right">{modelPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 w-12 shrink-0">Market</span>
          <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${impliedPct}%` }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="h-full rounded-full bg-slate-500"
            />
          </div>
          <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{impliedPct}%</span>
        </div>
      </div>

      {/* Footer: Kelly + Risk */}
      <div className="flex items-center gap-3 text-[10px]">
        <span className="text-slate-500">Kelly: <span className="font-mono text-violet-400">{adjKellyPct}%</span></span>
        {risk && (
          <span className={cn(
            'text-[9px] font-medium',
            risk.riskLevel === 'low' || risk.riskLevel === 'very-low' ? 'text-emerald-400' :
            risk.riskLevel === 'medium' ? 'text-amber-400' : 'text-red-400'
          )}>
            Risk: {risk.riskLevel}
          </span>
        )}
      </div>
    </div>
  );
}
