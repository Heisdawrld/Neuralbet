'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchV4Tips } from '@/lib/api';
import { TipCard } from '@/components/tip-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain, Filter, Crosshair, Flame, TrendingUp, Minus,
  ShieldCheck, Eye, Zap, Target, Sparkles, Activity,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import type { TipQuality } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

type QualityFilter = 'all' | 'gold' | 'silver' | 'bronze' | 'skip';

/* ── Quality filter pill config ──────────────────────────────────── */
const QUALITY_PILLS: Array<{
  id: QualityFilter;
  label: string;
  icon: React.ReactNode;
  active: string;
  count: (s: any) => number;
}> = [
  {
    id: 'all', label: 'All', icon: <Target className="w-3 h-3" />,
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    count: (s) => (s?.withTip || 0),
  },
  {
    id: 'gold', label: 'Gold', icon: <Flame className="w-3 h-3" />,
    active: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    count: (s) => (s?.gold || 0),
  },
  {
    id: 'silver', label: 'Silver', icon: <Crosshair className="w-3 h-3" />,
    active: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
    count: (s) => (s?.silver || 0),
  },
  {
    id: 'bronze', label: 'Bronze', icon: <TrendingUp className="w-3 h-3" />,
    active: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
    count: (s) => (s?.bronze || 0),
  },
  {
    id: 'skip', label: 'Skipped', icon: <Minus className="w-3 h-3" />,
    active: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    count: (s) => (s?.skipped || 0),
  },
];

export function Predictions() {
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [showSkipped, setShowSkipped] = useState(false);
  const { openMatchPanel } = useAppStore();

  const { data: tipsData, isLoading } = useQuery({
    queryKey: ['v4-tips', 'all'],
    queryFn: () => fetchV4Tips({ limit: 100 }),
    refetchInterval: 60000,
  });

  const tips = tipsData?.results || [];
  const stats = tipsData?.stats;

  const filteredTips = useMemo(() => {
    let filtered = [...tips];
    if (qualityFilter !== 'all') {
      if (qualityFilter === 'skip') {
        filtered = filtered.filter(t => t.tip === null);
      } else {
        filtered = filtered.filter(t => t.tip?.quality === qualityFilter);
      }
    }
    if (!showSkipped) {
      filtered = filtered.filter(t => t.tip !== null);
    }
    if (leagueFilter !== 'all') {
      filtered = filtered.filter(t => String(t.leagueId) === leagueFilter);
    }
    return filtered;
  }, [tips, qualityFilter, leagueFilter, showSkipped]);

  const uniqueLeagues = useMemo(() => {
    const leagueMap = new Map<number, string>();
    tips.forEach(t => {
      if (t.leagueId && t.leagueName) leagueMap.set(t.leagueId, t.leagueName);
    });
    return Array.from(leagueMap.entries()).map(([id, name]) => ({ id, name }));
  }, [tips]);

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Crosshair className="w-5 h-5 text-emerald-400" />
          </div>
          Predictions
        </h1>
        <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
          V5 Prediction Model — Study everything. Pick ONE. Or walk away.
          {tipsData?.engineVersion && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">
              <Activity className="w-2.5 h-2.5 mr-0.5" />
              v{tipsData.engineVersion}
            </Badge>
          )}
        </p>
      </div>

      {/* ── Quality Filter Pills ──────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {QUALITY_PILLS.map((pill) => {
          const isActive = qualityFilter === pill.id;
          const count = pill.count(stats);
          return (
            <button
              key={pill.id}
              onClick={() => setQualityFilter(pill.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all',
                isActive
                  ? pill.active
                  : 'bg-white/[0.02] text-slate-400 border-white/[0.06] hover:bg-white/[0.05] hover:text-slate-200'
              )}
            >
              {pill.icon}
              {pill.label}
              <span className="font-mono text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filters Row ───────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[150px] max-w-[220px]">
          <Select value={leagueFilter} onValueChange={setLeagueFilter}>
            <SelectTrigger className="h-9 text-xs bg-white/[0.03] border-white/[0.08]">
              <SelectValue placeholder="All Leagues" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leagues</SelectItem>
              {uniqueLeagues.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={showSkipped}
            onCheckedChange={setShowSkipped}
            className="data-[state=checked]:bg-slate-500"
          />
          <Label className="text-xs text-slate-400 flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Show Skipped
          </Label>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/50" />
          <span>{tipsData?.count ?? 0} matches analyzed</span>
        </div>
      </div>

      {/* ── Tips Grid ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl glass-skeleton" />
          ))}
        </div>
      ) : filteredTips.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {filteredTips.map((tip, idx) => (
              <motion.div
                key={tip.eventId}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, delay: idx * 0.02 }}
              >
                <TipCard tip={tip} onMatchClick={() => openMatchPanel(tip.eventId)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm p-10 text-center">
          <Crosshair className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No tips match your filters</p>
          <p className="text-[11px] text-slate-500 mt-1">
            The engine only tips when there&apos;s edge. Try adjusting filters.
          </p>
        </div>
      )}
    </div>
  );
}
