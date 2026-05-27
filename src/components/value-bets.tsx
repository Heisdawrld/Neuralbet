'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchValueBets } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProbabilityBar } from '@/components/probability-bar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Crosshair, TrendingUp, Star, AlertTriangle, DollarSign, Percent } from 'lucide-react';
import type { ValueBetData } from '@/lib/types';

export function ValueBets() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['value-bets'],
    queryFn: fetchValueBets,
    refetchInterval: 120000,
  });

  const valueBets = data?.results || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Crosshair className="w-6 h-6 text-emerald-400" />
          Value Bets
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Where our model disagrees with the market — edge detection at its finest
        </p>
      </div>

      {/* Info Banner */}
      <Card className="glass-card p-4 border-emerald-500/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-foreground font-medium">How Value Bets Work</p>
            <p className="text-muted-foreground mt-1">
              We compare our ML model&apos;s probability against the implied probability from bookmaker odds.
              When the model detects an edge (difference &gt; 5%), it&apos;s flagged as a value bet.
              The Kelly stake shows optimal bet sizing.
            </p>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <Crosshair className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-muted-foreground uppercase">Value Bets</span>
          </div>
          <span className="text-xl font-bold font-mono text-emerald-400">{valueBets.length}</span>
        </Card>
        <Card className="glass-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] text-muted-foreground uppercase">Avg Edge</span>
          </div>
          <span className="text-xl font-bold font-mono text-cyan-400">
            {valueBets.length > 0
              ? (valueBets.reduce((s: number, v: ValueBetData) => s + v.edge, 0) / valueBets.length * 100).toFixed(1)
              : '0.0'}%
          </span>
        </Card>
        <Card className="glass-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-muted-foreground uppercase">Top Rating</span>
          </div>
          <span className="text-xl font-bold font-mono text-amber-400">
            {valueBets.length > 0 ? Math.max(...valueBets.map((v: ValueBetData) => v.valueRating)) : 0}/5
          </span>
        </Card>
        <Card className="glass-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-3 h-3 text-violet-400" />
            <span className="text-[10px] text-muted-foreground uppercase">Max Kelly</span>
          </div>
          <span className="text-xl font-bold font-mono text-violet-400">
            {valueBets.length > 0 ? (Math.max(...valueBets.map((v: ValueBetData) => v.kellyStake)) * 100).toFixed(1) : '0.0'}%
          </span>
        </Card>
      </div>

      {/* Value Bets List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : isError ? (
        <Card className="glass-card p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-muted-foreground">Failed to load value bets. Please try again later.</p>
        </Card>
      ) : valueBets.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-420px)]">
          <div className="space-y-3 pr-2">
            <AnimatePresence mode="popLayout">
              {valueBets.map((vb: ValueBetData, idx: number) => (
                <motion.div
                  key={`${vb.match.id}-${vb.selection}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                >
                  <ValueBetCard valueBet={vb} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      ) : (
        <Card className="glass-card p-8 text-center">
          <Crosshair className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No value bets found right now. Check back later!</p>
        </Card>
      )}
    </div>
  );
}

function ValueBetCard({ valueBet }: { valueBet: ValueBetData }) {
  const edgePct = (valueBet.edge * 100).toFixed(1);
  const modelPct = (valueBet.modelProbability * 100).toFixed(1);
  const impliedPct = (valueBet.impliedProbability * 100).toFixed(1);
  const kellyPct = (valueBet.kellyStake * 100).toFixed(2);
  const odds = valueBet.odds.toFixed(2);

  const stars = Array.from({ length: 5 }).map((_, i) => (
    <Star
      key={i}
      className={`w-3.5 h-3.5 ${i < valueBet.valueRating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`}
    />
  ));

  return (
    <Card className="glass-card hover-glow p-4 transition-all duration-300">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              {valueBet.match.leagueName || 'Unknown'}
            </span>
            <span className="text-muted-foreground/40">•</span>
            <span className="text-[11px] text-muted-foreground font-mono">
              {new Date(valueBet.match.eventDate).toLocaleDateString()}
            </span>
          </div>

          {/* Match */}
          <div className="mb-3">
            <span className="text-sm font-medium">
              {valueBet.match.homeTeam} vs {valueBet.match.awayTeam}
            </span>
          </div>

          {/* Selection & Edge */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold">
              {valueBet.selection}
            </Badge>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-mono font-bold">
              <Percent className="w-3 h-3 mr-1" />
              {edgePct}% Edge
            </Badge>
            <Badge variant="secondary" className="bg-white/5 text-slate-300 font-mono">
              Odds: {odds}
            </Badge>
          </div>

          {/* Probability Comparison */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className="text-[10px] text-muted-foreground mb-1">Model</div>
              <div className="text-sm font-mono font-bold text-emerald-400">{modelPct}%</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className="text-[10px] text-muted-foreground mb-1">Market</div>
              <div className="text-sm font-mono font-bold text-slate-400">{impliedPct}%</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5">
              <div className="text-[10px] text-muted-foreground mb-1">Kelly</div>
              <div className="text-sm font-mono font-bold text-violet-400">{kellyPct}%</div>
            </div>
          </div>

          {/* Probability Bar */}
          {valueBet.prediction && (
            <ProbabilityBar
              home={valueBet.prediction.homeWinProb}
              draw={valueBet.prediction.drawProb}
              away={valueBet.prediction.awayWinProb}
              homeLabel={valueBet.match.homeTeam.slice(0, 3).toUpperCase()}
              awayLabel={valueBet.match.awayTeam.slice(0, 3).toUpperCase()}
            />
          )}
        </div>

        {/* Value Rating */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1">
          <div className="flex flex-col items-center gap-0.5">{stars}</div>
          <span className="text-[10px] text-muted-foreground mt-1">Value</span>
        </div>
      </div>
    </Card>
  );
}
