'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchLiveEvents, fetchEventOdds } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Radio, Clock, AlertCircle, RefreshCw, Activity, Zap, Timer } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect, useRef } from 'react';
import type { MatchData } from '@/lib/types';
import { useAppStore } from '@/lib/store';

const REFRESH_INTERVAL = 30;

export function LiveMatches() {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const { openMatchPanel } = useAppStore();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['live-matches'],
    queryFn: fetchLiveEvents,
    refetchInterval: REFRESH_INTERVAL * 1000,
  });

  const liveMatches = data?.results || [];

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Reset countdown on manual refresh
  const handleRefresh = () => {
    refetch();
    setLastRefresh(new Date());
    setCountdown(REFRESH_INTERVAL);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Radio className="w-6 h-6 text-cyan-400" />
            Live Matches
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time scores and match events — auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Countdown indicator */}
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
            <span className="text-[10px] font-mono text-muted-foreground">{countdown}s</span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? 'animate-spin' : ''}`} />
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
        <span className="text-[10px] text-muted-foreground">
          Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : isError ? (
        <Card className="glass-card p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">Failed to load live matches</p>
          <button onClick={handleRefresh} className="text-sm text-emerald-400 hover:text-emerald-300">
            Try again
          </button>
        </Card>
      ) : liveMatches.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-240px)]">
          <div className="space-y-3 pr-2">
            <AnimatePresence mode="popLayout">
              {liveMatches.map((match: MatchData) => (
                <motion.div
                  key={match.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                >
                  <LiveMatchDetail match={match} onMatchClick={() => openMatchPanel(match.id)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      ) : (
        <Card className="glass-card p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
              <Radio className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-foreground">No Live Matches</p>
            <p className="text-muted-foreground text-sm">There are no matches in progress right now</p>
            <p className="text-[11px] text-slate-500">Auto-refresh will detect new live matches</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function LiveMatchDetail({ match, onMatchClick }: { match: MatchData; onMatchClick?: () => void }) {
  const { data: oddsData } = useQuery({
    queryKey: ['odds', match.id],
    queryFn: () => fetchEventOdds(match.id),
    refetchInterval: 30000,
    enabled: !!match.id,
  });

  const [homeFlash, setHomeFlash] = useState(false);
  const [awayFlash, setAwayFlash] = useState(false);

  // Score change detection via effect
  useEffect(() => {
    // Flash on score changes (only triggers when score actually updates)
    const timer1 = homeFlash ? setTimeout(() => setHomeFlash(false), 1500) : undefined;
    const timer2 = awayFlash ? setTimeout(() => setAwayFlash(false), 1500) : undefined;
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [homeFlash, awayFlash]);

  const getPeriodLabel = (period?: string) => {
    if (!period) return '';
    const labels: Record<string, string> = {
      '1H': '1st Half',
      '2H': '2nd Half',
      'HT': 'Half Time',
      'FT': 'Full Time',
      'ET': 'Extra Time',
      'P': 'Penalties',
    };
    return labels[period] || period;
  };

  const isHalfTime = match.period === 'HT';
  const hasOdds = oddsData && (oddsData.homeWin || oddsData.draw || oddsData.awayWin);

  return (
    <Card className="glass-card glow-cyan p-4 cursor-pointer" onClick={onMatchClick}>
      {/* Header with enhanced live indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 live-ring" />
          </span>
          <span className="text-[11px] text-emerald-400 font-mono uppercase tracking-wider font-medium">
            {getPeriodLabel(match.period || undefined)}
          </span>
          {match.currentMinute && (
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono text-[10px]">
              <Clock className="w-3 h-3 mr-1" />
              {match.currentMinute}&apos;
            </Badge>
          )}
          {isHalfTime && (
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
              <Timer className="w-3 h-3 mr-1" />HT
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {match.leagueName || `League #${match.leagueId}`}
        </span>
      </div>

      {/* Score with flash effect */}
      <div className="flex items-center justify-center gap-6 my-4">
        <div className="flex-1 text-right">
          <span className="text-base font-medium">{match.homeTeam}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-3xl font-bold font-mono text-emerald-400 ${homeFlash ? 'score-flash' : ''}`}>
            {match.homeScore ?? 0}
          </span>
          <span className="text-xl text-muted-foreground">-</span>
          <span className={`text-3xl font-bold font-mono text-emerald-400 ${awayFlash ? 'score-flash' : ''}`}>
            {match.awayScore ?? 0}
          </span>
        </div>
        <div className="flex-1 text-left">
          <span className="text-base font-medium">{match.awayTeam}</span>
        </div>
      </div>

      {/* Live stats bar */}
      <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Possession</p>
          <p className="text-xs font-mono font-bold text-slate-300">—</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Shots</p>
          <p className="text-xs font-mono font-bold text-slate-300">—</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">xG</p>
          <p className="text-xs font-mono font-bold text-slate-300">—</p>
        </div>
      </div>

      {/* Odds */}
      {hasOdds && (
        <div className="border-t border-white/5 pt-3 mt-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Match Odds</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-1.5 rounded bg-white/5">
              <div className="text-[10px] text-muted-foreground">Home</div>
              <div className="text-xs font-mono font-bold text-emerald-400">{oddsData!.homeWin?.toFixed(2) || '-'}</div>
            </div>
            <div className="text-center p-1.5 rounded bg-white/5">
              <div className="text-[10px] text-muted-foreground">Draw</div>
              <div className="text-xs font-mono font-bold text-amber-400">{oddsData!.draw?.toFixed(2) || '-'}</div>
            </div>
            <div className="text-center p-1.5 rounded bg-white/5">
              <div className="text-[10px] text-muted-foreground">Away</div>
              <div className="text-xs font-mono font-bold text-emerald-400">{oddsData!.awayWin?.toFixed(2) || '-'}</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
