'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchEvents, fetchLiveEvents, fetchV4Tips } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { TipCard } from '@/components/tip-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Activity, TrendingUp, Zap, Radio, BarChart3, Calendar, Crosshair, Flame, Target, ChevronRight, Sparkles, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import type { MatchData } from '@/lib/types';

export function Dashboard() {
  const { selectedDate, setSelectedDate, openMatchPanel } = useAppStore();

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

  const liveMatches = liveData?.results || [];
  const tips = tipsData?.results || [];
  const stats = tipsData?.stats;

  // Only show tips (not skipped)
  const goldTips = tips.filter(t => t.tip?.quality === 'gold');
  const silverTips = tips.filter(t => t.tip?.quality === 'silver');
  const bronzeTips = tips.filter(t => t.tip?.quality === 'bronze');
  const topTips = [...goldTips, ...silverTips].slice(0, 8);
  const events = eventsData?.results || [];

  // The featured gold tip (hero section)
  const featuredTip = goldTips[0];

  return (
    <div className="space-y-6">
      {/* Top Bar */}
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
            <div className="p-5 relative">
              {/* Featured badge */}
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs px-3 py-1 flex items-center gap-1.5">
                  <Flame className="w-4 h-4" />
                  TODAY&apos;S GOLD TIP
                </Badge>
                <Badge className="bg-white/[0.06] text-slate-300 border-white/[0.1] text-[10px] px-2 py-0.5">
                  {featuredTip.leagueName}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Teams */}
                  <div className="space-y-1 mb-3">
                    <p className="text-xl font-bold truncate">{featuredTip.homeTeam}</p>
                    <p className="text-xl font-bold truncate text-muted-foreground">vs {featuredTip.awayTeam}</p>
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
                  <div className="bg-white/[0.04] border border-amber-500/20 rounded-xl p-4 min-w-[140px]">
                    <p className="text-sm text-amber-400 font-medium mb-1">{featuredTip.tip.market}</p>
                    <p className="text-2xl font-bold text-white">{featuredTip.tip.selection}</p>
                    {featuredTip.tip.odds && (
                      <p className="text-3xl font-mono font-bold text-amber-400 mt-2">
                        @{featuredTip.tip.odds.toFixed(2)}
                      </p>
                    )}
                    <div className="flex items-center justify-center gap-2 mt-2 text-[10px]">
                      <span className="text-emerald-400">+{(featuredTip.tip.edge * 100).toFixed(1)}% edge</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-cyan-400">Kelly {(featuredTip.tip.kellyStake * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="mt-3 bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.06]">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Matches"
          value={events.length.toString()}
          color="text-cyan-400"
          borderColor="border-cyan-500/20"
          loading={eventsLoading}
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
        <StatCard
          icon={<Flame className="w-4 h-4" />}
          label="Gold Tips"
          value={(stats?.gold ?? 0).toString()}
          color="text-amber-400"
          borderColor="border-amber-500/20"
          loading={tipsLoading}
        />
        <StatCard
          icon={<Crosshair className="w-4 h-4" />}
          label="Silver Tips"
          value={(stats?.silver ?? 0).toString()}
          color="text-cyan-300"
          borderColor="border-cyan-500/20"
          loading={tipsLoading}
        />
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="Total Tips"
          value={(stats?.withTip ?? 0).toString()}
          color="text-violet-400"
          borderColor="border-violet-500/20"
          loading={tipsLoading}
        />
      </div>

      {/* ── Live Now Section ───────────────────────────────────── */}
      {liveMatches.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <h2 className="text-lg font-semibold">Live Now</h2>
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
              {liveMatches.length}
            </Badge>
          </div>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3 pb-4">
              {liveMatches.map((match: MatchData) => (
                <LiveMatchCard key={match.id} match={match} onClick={() => openMatchPanel(match.id)} />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* ── Gold Tips ──────────────────────────────────────────── */}
      {goldTips.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-amber-400" />
            <h2 className="text-lg font-semibold">Gold Tips</h2>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-300 border-amber-500/20 text-[10px]">
              {goldTips.length} Strong Bets
            </Badge>
          </div>
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
        </div>
      )}

      {/* ── Silver Tips ────────────────────────────────────────── */}
      {silverTips.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Crosshair className="w-4 h-4 text-cyan-300" />
            <h2 className="text-lg font-semibold">Silver Tips</h2>
            <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20 text-[10px]">
              {silverTips.length} Good Bets
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {silverTips.slice(0, 4).map((tip) => (
              <TipCard key={tip.eventId} tip={tip} onMatchClick={() => openMatchPanel(tip.eventId)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Bronze Tips ────────────────────────────────────────── */}
      {bronzeTips.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h2 className="text-lg font-semibold">Bronze Tips</h2>
            <Badge variant="secondary" className="bg-slate-500/10 text-slate-300 border-slate-500/20 text-[10px]">
              {bronzeTips.length} Small Bets
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bronzeTips.slice(0, 4).map((tip) => (
              <TipCard key={tip.eventId} tip={tip} onMatchClick={() => openMatchPanel(tip.eventId)} />
            ))}
          </div>
        </div>
      )}

      {/* ── No Tips ────────────────────────────────────────────── */}
      {!tipsLoading && topTips.length === 0 && (
        <Card className="glass-card-premium p-8 text-center">
          <Crosshair className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No strong tips found right now</p>
          <p className="text-[11px] text-slate-500 mt-1">
            The punter only tips when there&apos;s value. Check back later.
          </p>
        </Card>
      )}
    </div>
  );
}

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

function LiveMatchCard({ match, onClick }: { match: MatchData; onClick?: () => void }) {
  return (
    <Card className="glass-card-premium silver-glow min-w-[220px] p-3 cursor-pointer hover-lift transition-all" onClick={onClick}>
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
        </span>
        <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-wider">
          {match.currentMinute ? `${match.currentMinute}'` : match.period || 'LIVE'}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[100px]">
          {match.leagueName || `League #${match.leagueId}`}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium truncate">{match.homeTeam}</span>
          <span className="font-mono font-bold text-emerald-400">{match.homeScore ?? 0}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium truncate">{match.awayTeam}</span>
          <span className="font-mono font-bold text-emerald-400">{match.awayScore ?? 0}</span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">
        {format(new Date(match.eventDate), 'HH:mm')}
      </div>
    </Card>
  );
}
