'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchEvents, fetchLiveEvents, fetchOurPredictions } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { PunterMatchCard } from '@/components/punter-match-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Activity, TrendingUp, Zap, Radio, BarChart3, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import type { PredictionData, MatchData } from '@/lib/types';

export function Dashboard() {
  const { selectedDate, setSelectedDate } = useAppStore();

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

  const { data: predictionsData, isLoading: predictionsLoading } = useQuery({
    queryKey: ['our-predictions', 'upcoming'],
    queryFn: () => fetchOurPredictions({ limit: 30 }),
    refetchInterval: 60000,
  });

  const liveMatches = liveData?.results || [];
  const predictions = predictionsData?.results || [];
  const rawPredictions = predictionsData?.raw || [];

  // Build raw prediction map
  const rawPredictionMap = new Map<number, import('@/lib/types').OurPredictionData>();
  rawPredictions.forEach((p) => rawPredictionMap.set(p.eventId, p));

  const recommendedPredictions = predictions.filter(
    (p: PredictionData) => p.isRecommended
  );
  const events = eventsData?.results || [];

  const topPredictions = predictions
    .filter((p: PredictionData) => p.confidence >= 0.3)
    .sort((a: PredictionData, b: PredictionData) => b.confidence - a.confidence)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Punter Brain v2 — Thinks like a human, bets like a pro
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Matches Today"
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
          icon={<TrendingUp className="w-4 h-4" />}
          label="Predictions"
          value={predictions.length.toString()}
          color="text-amber-400"
          loading={predictionsLoading}
        />
        <StatCard
          icon={<Zap className="w-4 h-4" />}
          label="Best Bets"
          value={recommendedPredictions.length.toString()}
          color="text-violet-400"
          loading={predictionsLoading}
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
                <LiveMatchCard key={match.id} match={match} />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* Today's Predictions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h2 className="text-lg font-semibold">Top Predictions</h2>
        </div>
        {predictionsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl bg-white/5" />
            ))}
          </div>
        ) : topPredictions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {topPredictions.map((pred: PredictionData) => (
                <motion.div
                  key={pred.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <PunterMatchCard prediction={pred} ourPrediction={rawPredictionMap.get(pred.id)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <Card className="glass-card p-8 text-center">
            <p className="text-muted-foreground">No predictions available for today</p>
          </Card>
        )}
      </div>

      {/* Recommended Bets */}
      {recommendedPredictions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-400" />
            <h2 className="text-lg font-semibold">Recommended Bets</h2>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
              Punter Picks
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendedPredictions.slice(0, 4).map((pred: PredictionData) => (
              <PunterMatchCard key={pred.id} prediction={pred} ourPrediction={rawPredictionMap.get(pred.id)} compact />
            ))}
          </div>
        </div>
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

function LiveMatchCard({ match }: { match: MatchData }) {
  return (
    <Card className="glass-card glow-cyan min-w-[220px] p-3 cursor-pointer hover-glow transition-all">
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
