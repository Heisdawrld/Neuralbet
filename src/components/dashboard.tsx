'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchEvents, fetchLiveEvents, fetchV4Tips } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { TipCard } from '@/components/tip-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Activity, TrendingUp, Zap, Radio, BarChart3, Calendar, Crosshair, Flame, Target, ChevronRight, Sparkles, ArrowRight, RefreshCw, Clock, Trophy, Eye } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useCallback } from 'react';
import type { MatchData } from '@/lib/types';

export function Dashboard() {
  const { selectedDate, setSelectedDate, openMatchPanel } = useAppStore();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['events', selectedDate],
    queryFn: () => fetchEvents(selectedDate, selectedDate),
    refetchInterval: 60000,
  });

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ['live'],
    queryFn: fetchLiveEvents,
    refetchInterval: 30000,
  });

  const { data: tipsData, isLoading: tipsLoading } = useQuery({
    queryKey: ['v4-tips', 'dashboard'],
    queryFn: () => fetchV4Tips({ limit: 30 }),
    refetchInterval: 60000,
  });

  const { data: syncStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => fetch('/api/sync').then(r => r.json()),
    refetchInterval: 60000,
  });

  const syncMutation = useMutation({
    mutationFn: () => fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'quick' }),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['v4-tips'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      setSyncing(false);
    },
    onError: () => setSyncing(false),
  });

  const handleSync = useCallback(() => {
    if (syncing) return;
    setSyncing(true);
    syncMutation.mutate();
  }, [syncing, syncMutation]);

  const liveMatches = liveData?.results || [];
  const tips = tipsData?.results || [];
  const stats = tipsData?.stats;

  const goldTips = tips.filter(t => t.tip?.quality === 'gold');
  const silverTips = tips.filter(t => t.tip?.quality === 'silver');
  const bronzeTips = tips.filter(t => t.tip?.quality === 'bronze');
  const skipTips = tips.filter(t => t.tip?.quality === 'skip' || !t.tip);
  const topTips = [...goldTips, ...silverTips].slice(0, 8);
  const events = eventsData?.results || [];

  const featuredTip = goldTips[0];

  // Calculate quick stats
  const avgEdge = topTips.length > 0
    ? topTips.reduce((sum, t) => sum + (t.tip?.edge ?? 0), 0) / topTips.length
    : 0;
  const winRateEst = stats ? ((stats.gold + stats.silver) / Math.max(1, stats.withTip) * 100) : 0;

  // Last sync time
  const lastSyncTime = syncStatus?.syncStatus?.[0]?.last_sync_at
    ? formatDistanceToNow(new Date(syncStatus.syncStatus[0].last_sync_at), { addSuffix: true })
    : null;

  return (
    <div className="space-y-6">
      {/* ── LIVE TICKER BAR ─────────────────────────────────────── */}
      {liveMatches.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-emerald-500/5 border border-emerald-500/10">
          <div className="flex items-center">
            <div className="flex-shrink-0 px-3 py-2 bg-emerald-500/10 border-r border-emerald-500/10 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">LIVE</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="ticker-scroll flex items-center gap-6 py-2 px-4 whitespace-nowrap">
                {[...liveMatches, ...liveMatches].map((match: MatchData, i: number) => (
                  <button
                    key={`${match.id}-${i}`}
                    onClick={() => openMatchPanel(match.id)}
                    className="flex items-center gap-3 hover:text-emerald-300 transition-colors text-left"
                  >
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {match.currentMinute ? `${match.currentMinute}'` : 'LIVE'}
                    </span>
                    <span className="text-xs text-slate-300 truncate max-w-[100px]">{match.homeTeam}</span>
                    <span className="text-xs font-bold font-mono text-white">
                      {match.homeScore ?? 0} - {match.awayScore ?? 0}
                    </span>
                    <span className="text-xs text-slate-300 truncate max-w-[100px]">{match.awayTeam}</span>
                    <span className="text-white/10">|</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Bar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-400" />
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Punter Brain v4 — Study everything. Pick ONE. Or walk away.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className={`h-8 gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 ${syncing ? 'sync-pulse' : ''}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Data'}
          </Button>
          {lastSyncTime && (
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastSyncTime}
            </span>
          )}
          <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-36 h-7 text-xs bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
            />
          </div>
          {tipsData?.engineVersion && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">
              <Zap className="w-2.5 h-2.5 mr-1" />
              v{tipsData.engineVersion}
            </Badge>
          )}
        </div>
      </div>

      {/* ── HERO: Featured Gold Tip ────────────────────────────── */}
      {featuredTip && featuredTip.tip && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card
            className="hero-card glow-pulse-amber cursor-pointer hover-lift transition-all duration-300"
            onClick={() => openMatchPanel(featuredTip.eventId)}
          >
            <div className="p-6 md:p-8 relative">
              {/* Featured badge */}
              <div className="flex items-center gap-2 mb-4">
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs px-3 py-1 flex items-center gap-1.5">
                  <Flame className="w-4 h-4" />
                  TODAY&apos;S GOLD TIP
                </Badge>
                <Badge className="bg-white/[0.06] text-slate-300 border-white/[0.1] text-[10px] px-2 py-0.5">
                  {featuredTip.leagueName}
                </Badge>
                {featuredTip.tip.isSafePlay && (
                  <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[10px] px-2 py-0.5 flex items-center gap-1">
                    <Eye className="w-3 h-3" />Safe Play
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                  {/* Teams — dramatically bigger */}
                  <div className="space-y-2 mb-4">
                    <p className="text-2xl md:text-3xl font-bold truncate">{featuredTip.homeTeam}</p>
                    <p className="text-lg text-muted-foreground">vs</p>
                    <p className="text-2xl md:text-3xl font-bold truncate text-muted-foreground">{featuredTip.awayTeam}</p>
                  </div>

                  {/* Time & league */}
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(featuredTip.eventDate), 'HH:mm')}
                    </span>
                    <span className="text-[11px]">
                      {Math.round(featuredTip.probabilities.homeWin * 100)}% — {Math.round(featuredTip.probabilities.draw * 100)}% — {Math.round(featuredTip.probabilities.awayWin * 100)}%
                    </span>
                  </div>
                </div>

                {/* The Tip — large and prominent */}
                <div className="flex-shrink-0 text-center">
                  <div className="bg-white/[0.04] border border-amber-500/20 rounded-xl p-5 min-w-[160px] md:min-w-[180px]">
                    <p className="text-sm text-amber-400 font-medium mb-1">{featuredTip.tip.market}</p>
                    <p className="text-2xl md:text-3xl font-bold text-white">{featuredTip.tip.selection}</p>
                    {featuredTip.tip.odds && (
                      <p className="text-3xl md:text-4xl font-mono font-bold text-amber-400 mt-2">
                        @{featuredTip.tip.odds.toFixed(2)}
                      </p>
                    )}
                    <div className="flex items-center justify-center gap-2 mt-2 text-[10px]">
                      <span className="text-emerald-400">+{(featuredTip.tip.edge * 100).toFixed(1)}% edge</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-cyan-400">Kelly {(featuredTip.tip.kellyStake * 100).toFixed(1)}%</span>
                    </div>
                    {/* Confidence mini meter */}
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${featuredTip.tip.confidence * 100}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400"
                        />
                      </div>
                      <span className="text-[9px] font-mono text-amber-400">{Math.round(featuredTip.tip.confidence * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="mt-4 bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                <p className="text-xs text-muted-foreground italic flex items-start gap-1.5">
                  <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400" />
                  &ldquo;{featuredTip.tip.reasoning}&rdquo;
                </p>
              </div>

              {/* Click to explore */}
              <div className="flex items-center gap-1 mt-3 text-[10px] text-amber-400/60">
                <span>Click to explore full analysis</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Quick Stats Row ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
        <StatCard
          icon={<Crosshair className="w-4 h-4" />}
          label="Tips Today"
          value={(stats?.withTip ?? 0).toString()}
          color="text-emerald-400"
          borderColor="border-emerald-500/20"
          loading={tipsLoading}
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Win Rate"
          value={`${winRateEst.toFixed(0)}%`}
          color="text-cyan-400"
          borderColor="border-cyan-500/20"
          loading={tipsLoading}
        />
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Avg Edge"
          value={`+${(avgEdge * 100).toFixed(1)}%`}
          color="text-amber-400"
          borderColor="border-amber-500/20"
          loading={tipsLoading}
        />
        <StatCard
          icon={<Flame className="w-4 h-4" />}
          label="Gold Tips"
          value={(stats?.gold ?? 0).toString()}
          color="text-amber-400"
          borderColor="border-amber-500/20"
          loading={tipsLoading}
        />
        <StatCard
          icon={<Radio className="w-4 h-4" />}
          label="Live Now"
          value={liveMatches.length.toString()}
          color="text-emerald-400"
          borderColor="border-emerald-500/20"
          loading={liveLoading}
          pulse={liveMatches.length > 0}
        />
      </div>

      {/* ── Gold Tips Section ──────────────────────────────────── */}
      {goldTips.length > 0 && (
        <Section header="Gold Tips" icon={<Flame className="w-5 h-5 text-amber-400" />} count={goldTips.length} badgeText="Strong Bets" badgeClass="bg-amber-500/10 text-amber-300 border-amber-500/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {goldTips.slice(0, 6).map((tip) => (
                <motion.div
                  key={tip.eventId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <TipCard tip={tip} onMatchClick={() => openMatchPanel(tip.eventId)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Section>
      )}

      {/* ── Silver Tips Section ────────────────────────────────── */}
      {silverTips.length > 0 && (
        <Section header="Silver Tips" icon={<Crosshair className="w-5 h-5 text-cyan-300" />} count={silverTips.length} badgeText="Good Bets" badgeClass="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {silverTips.slice(0, 4).map((tip) => (
              <TipCard key={tip.eventId} tip={tip} onMatchClick={() => openMatchPanel(tip.eventId)} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Bronze Tips Section ────────────────────────────────── */}
      {bronzeTips.length > 0 && (
        <Section header="Bronze Tips" icon={<TrendingUp className="w-5 h-5 text-slate-400" />} count={bronzeTips.length} badgeText="Small Bets" badgeClass="bg-slate-500/10 text-slate-300 border-slate-500/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bronzeTips.slice(0, 4).map((tip) => (
              <TipCard key={tip.eventId} tip={tip} onMatchClick={() => openMatchPanel(tip.eventId)} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Skip Section (collapsed) ──────────────────────────── */}
      {skipTips.length > 0 && (
        <SkipSection count={skipTips.length} tips={skipTips} onMatchClick={openMatchPanel} />
      )}

      {/* ── No Tips ────────────────────────────────────────────── */}
      {!tipsLoading && topTips.length === 0 && (
        <Card className="glass-card-premium p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
              <Crosshair className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-medium text-muted-foreground">No strong tips found right now</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                The punter only tips when there&apos;s value. Try syncing data or check back later.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="mt-2 text-emerald-400 border border-emerald-500/20"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Data
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Section Component ────────────────────────────────────────────

function Section({ header, icon, count, badgeText, badgeClass, children }: {
  header: string;
  icon: React.ReactNode;
  count: number;
  badgeText: string;
  badgeClass: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-lg font-semibold">{header}</h2>
        <Badge variant="secondary" className={`${badgeClass} text-[10px]`}>
          {count} {badgeText}
        </Badge>
      </div>
      {children}
    </div>
  );
}

// ── Skip Section (collapsed by default) ──────────────────────────

function SkipSection({ count, tips, onMatchClick }: {
  count: number;
  tips: typeof import('@/lib/types').PunterTipV4Data extends never ? never : any[];
  onMatchClick: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-3 w-full text-left group"
      >
        <Target className="w-5 h-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-400">Skipped</h2>
        <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[10px]">
          {count} matches
        </Badge>
        <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ml-auto ${expanded ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tips.slice(0, 8).map((tip: any) => (
                <TipCard key={tip.eventId} tip={tip} onMatchClick={() => onMatchClick(tip.eventId)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  borderColor,
  loading,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  borderColor: string;
  loading?: boolean;
  pulse?: boolean;
}) {
  return (
    <Card className={`glass-card-premium p-4 border ${borderColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
        {pulse && (
          <span className="relative flex h-1.5 w-1.5 ml-auto">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16 glass-skeleton" />
      ) : (
        <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
      )}
    </Card>
  );
}
