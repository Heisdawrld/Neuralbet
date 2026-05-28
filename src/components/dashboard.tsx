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
import { Activity, TrendingUp, Zap, Radio, BarChart3, Calendar, Crosshair, Flame, Target } from 'lucide-react';
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
  const topTips = [...goldTips, ...silverTips].slice(0, 8);
  const events = eventsData?.results || [];

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Punter Brain v4 — Study everything. Pick ONE. Or walk away.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-36 h-8 text-xs bg-white/5 border-white/10"
            />
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Matches"
          value={events.length.toString()}
          color="text-cyan-400"
          loading={eventsLoading}
        />
        <StatCard
          icon={<Radio className="w-4 h-4" />}
          label="Live Now"
          value={liveMatches.length.toString()}
          color="text-emerald-400"
          loading={liveLoading}
        />
        <StatCard
          icon={<Flame className="w-4 h-4" />}
          label="Gold Tips"
          value={(stats?.gold ?? 0).toString()}
          color="text-amber-400"
          loading={tipsLoading}
        />
        <StatCard
          icon={<Crosshair className="w-4 h-4" />}
          label="Silver Tips"
          value={(stats?.silver ?? 0).toString()}
          color="text-cyan-300"
          loading={tipsLoading}
        />
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="Total Tips"
          value={(stats?.withTip ?? 0).toString()}
          color="text-violet-400"
          loading={tipsLoading}
        />
      </div>

      {/* Live Now Section */}
      {liveMatches.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 live-pulse" />
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

      {/* Gold Tips */}
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

      {/* Silver Tips */}
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

      {/* No Tips */}
      {!tipsLoading && topTips.length === 0 && (
        <Card className="glass-card p-8 text-center">
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
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card className="glass-card hover-glow p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16 bg-white/5" />
      ) : (
        <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
      )}
    </Card>
  );
}

function LiveMatchCard({ match, onClick }: { match: MatchData; onClick?: () => void }) {
  return (
    <Card className="glass-card glow-cyan min-w-[220px] p-3 cursor-pointer hover-glow transition-all" onClick={onClick}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 live-pulse" />
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
