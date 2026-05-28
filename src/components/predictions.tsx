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
  ShieldCheck, Eye, Zap, Target, Sparkles,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import type { TipQuality } from '@/lib/types';
import { useAppStore } from '@/lib/store';

type QualityFilter = 'all' | 'gold' | 'silver' | 'bronze' | 'skip';

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
      if (t.leagueId && t.leagueName) {
        leagueMap.set(t.leagueId, t.leagueName);
      }
    });
    return Array.from(leagueMap.entries()).map(([id, name]) => ({ id, name }));
  }, [tips]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Crosshair className="w-6 h-6 text-emerald-400" />
          Predictions
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
          Punter Brain v4 — Study everything. Pick ONE. Or walk away.
          {tipsData?.engineVersion && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">
              <Zap className="w-2.5 h-2.5 mr-1" />
              v{tipsData.engineVersion}
            </Badge>
          )}
        </p>
      </div>

      {/* Stats Row — Premium badges */}
      {stats && (
        <div className="flex gap-3 flex-wrap">
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/15 cursor-default">
            <Flame className="w-3 h-3 mr-1" />
            {stats.gold} Gold
          </Badge>
          <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/15 cursor-default">
            <Crosshair className="w-3 h-3 mr-1" />
            {stats.silver} Silver
          </Badge>
          <Badge variant="secondary" className="bg-slate-500/10 text-slate-300 border-slate-500/20 hover:bg-slate-500/15 cursor-default">
            <TrendingUp className="w-3 h-3 mr-1" />
            {stats.bronze} Bronze
          </Badge>
          <Badge variant="secondary" className="bg-slate-500/10 text-slate-500 border-slate-500/20 hover:bg-slate-500/15 cursor-default">
            <Minus className="w-3 h-3 mr-1" />
            {stats.skipped} Skipped
          </Badge>
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15 cursor-default">
            <Target className="w-3 h-3 mr-1" />
            {stats.withTip} Tips
          </Badge>
        </div>
      )}

      {/* Filters — Premium glass card */}
      <Card className="glass-card-premium p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quality</Label>
            <Select value={qualityFilter} onValueChange={(v) => setQualityFilter(v as QualityFilter)}>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tips</SelectItem>
                <SelectItem value="gold">Gold — Strong Bets</SelectItem>
                <SelectItem value="silver">Silver — Good Bets</SelectItem>
                <SelectItem value="bronze">Bronze — Small Bets</SelectItem>
                <SelectItem value="skip">Skipped — No Value</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">League</Label>
            <Select value={leagueFilter} onValueChange={setLeagueFilter}>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10">
                <SelectValue placeholder="All Leagues" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Leagues</SelectItem>
                {uniqueLeagues.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 pt-5">
            <Switch
              checked={showSkipped}
              onCheckedChange={setShowSkipped}
              className="data-[state=checked]:bg-slate-500"
            />
            <Label className="text-xs flex items-center gap-1">
              <Eye className="w-3 h-3" />
              Show Skipped
            </Label>
          </div>
          {/* "One Tip" philosophy */}
          <div className="flex items-center justify-center pt-2">
            <div className="text-center bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
              <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">Philosophy</p>
              <p className="text-[9px] text-slate-400">Pick ONE. Or walk away.</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Data Quality Indicator */}
      {tipsData && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Engine: Punter Brain v4</span>
          <span className="text-white/10">·</span>
          <span>{tips.count} matches analyzed</span>
          <span className="text-white/10">·</span>
          <span>Data refreshes every 60s</span>
        </div>
      )}

      {/* Tips Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-skeleton h-48" />
          ))}
        </div>
      ) : filteredTips.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-480px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
            <AnimatePresence mode="popLayout">
              {filteredTips.map((tip) => (
                <motion.div
                  key={tip.eventId}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                >
                  <TipCard tip={tip} onMatchClick={() => openMatchPanel(tip.eventId)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      ) : (
        <Card className="glass-card-premium p-8 text-center">
          <Crosshair className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No tips match your filters</p>
          <p className="text-[11px] text-slate-500 mt-1">
            The punter only tips when there&apos;s value. Try adjusting filters.
          </p>
        </Card>
      )}
    </div>
  );
}
