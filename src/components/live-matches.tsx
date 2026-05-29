'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchLiveEvents, fetchEventOdds } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Radio, Clock, RefreshCw, AlertCircle, Timer,
  TrendingUp, Activity,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { MatchData } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const REFRESH_INTERVAL = 30;

export function LiveMatches() {
  const { openMatchPanel } = useAppStore();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['live-events'],
    queryFn: fetchLiveEvents,
    refetchInterval: REFRESH_INTERVAL * 1000,
  });

  const liveMatches = data?.results || [];

  useEffect(() => {
    if (data) setLastRefresh(new Date());
  }, [data]);

  useEffect(() => {
    setCountdown(REFRESH_INTERVAL);
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? REFRESH_INTERVAL : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = () => {
    refetch();
    setLastRefresh(new Date());
    setCountdown(REFRESH_INTERVAL);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <Radio className="w-5 h-5 text-cyan-400" />
            </div>
            Live Matches
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time scores — auto-refreshes every {REFRESH_INTERVAL}s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Countdown */}
          <div className="flex items-center gap-1.5">
            <svg width="20" height="20" className="rotate-[-90deg]">
              <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
              <circle
                cx="10" cy="10" r="8" fill="none" stroke="#10b981" strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 8}`}
                strokeDashoffset={`${2 * Math.PI * 8 * (1 - countdown / REFRESH_INTERVAL)}`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <span className="text-[10px] font-mono text-slate-500">{countdown}s</span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
            disabled={isFetching}
          >
            <RefreshCw className={cn('w-4 h-4 text-slate-400', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
          </span>
          <span className="text-sm text-emerald-400 font-medium">{liveMatches.length} Live</span>
        </span>
        <span className="text-[10px] text-slate-500">
          Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl glass-skeleton" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-10 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-slate-400 mb-2">Failed to load live matches</p>
          <button onClick={handleRefresh} className="text-sm text-emerald-400 hover:text-emerald-300">
            Try again
          </button>
        </div>
      ) : liveMatches.length > 0 ? (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {liveMatches.map((match: MatchData) => (
              <motion.div
                key={match.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <LiveMatchCard match={match} onMatchClick={() => openMatchPanel(match.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
              <Radio className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-lg font-medium text-slate-400">No Live Matches</p>
            <p className="text-sm text-slate-500">Auto-refresh will detect new live matches</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Live Match Card ─────────────────────────────────────────────────

function LiveMatchCard({ match, onMatchClick }: { match: MatchData; onMatchClick?: () => void }) {
  const { data: oddsData } = useQuery({
    queryKey: ['odds', match.id],
    queryFn: () => fetchEventOdds(match.id),
    refetchInterval: 30000,
    enabled: !!match.id,
  });

  const getPeriodLabel = (period?: string) => {
    if (!period) return '';
    const labels: Record<string, string> = {
      '1H': '1st Half', '2H': '2nd Half', 'HT': 'Half Time',
      'FT': 'Full Time', 'ET': 'Extra Time', 'P': 'Penalties',
    };
    return labels[period] || period;
  };

  const isHalfTime = match.period === 'HT';
  const hasOdds = oddsData && (oddsData.homeWin || oddsData.draw || oddsData.awayWin);

  return (
    <div
      className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.03] to-[#0d1117] p-4 hover:border-cyan-500/25 transition-all cursor-pointer"
      onClick={onMatchClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
          </span>
          <span className="text-[11px] text-emerald-400 font-mono uppercase tracking-wider font-medium">
            {getPeriodLabel(match.period || undefined)}
          </span>
          {match.currentMinute && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono text-[10px]">
              <Clock className="w-3 h-3 mr-0.5" />
              {match.currentMinute}&apos;
            </Badge>
          )}
          {isHalfTime && (
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
              <Timer className="w-3 h-3 mr-0.5" /> HT
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-slate-500">
          {match.leagueName || `League #${match.leagueId}`}
        </span>
      </div>

      {/* Score */}
      <div className="flex items-center justify-center gap-6 my-4">
        <div className="flex-1 text-right">
          <span className="text-base font-medium">{match.homeTeam}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-black font-mono text-emerald-400 tabular-nums">
            {match.homeScore ?? 0}
          </span>
          <span className="text-xl text-slate-600">-</span>
          <span className="text-3xl font-black font-mono text-emerald-400 tabular-nums">
            {match.awayScore ?? 0}
          </span>
        </div>
        <div className="flex-1 text-left">
          <span className="text-base font-medium">{match.awayTeam}</span>
        </div>
      </div>

      {/* Odds */}
      {hasOdds && (
        <div className="border-t border-white/[0.05] pt-3 mt-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Home', value: oddsData!.homeWin, color: 'text-emerald-400' },
              { label: 'Draw', value: oddsData!.draw, color: 'text-amber-400' },
              { label: 'Away', value: oddsData!.awayWin, color: 'text-emerald-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-1.5 rounded-lg bg-white/[0.03]">
                <div className="text-[10px] text-slate-500">{label}</div>
                <div className={cn('text-xs font-mono font-bold', color)}>
                  {value?.toFixed(2) || '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
