'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchLiveEvents, fetchEventOdds } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Radio, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import type { MatchData } from '@/lib/types';
import { useAppStore } from '@/lib/store';

export function LiveMatches() {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const { openMatchPanel } = useAppStore();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['live-matches'],
    queryFn: fetchLiveEvents,
    refetchInterval: 30000,
  });

  const liveMatches = data?.results || [];

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
          <span className="text-[11px] text-muted-foreground">
            Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
          </span>
          <button
            onClick={() => { refetch(); setLastRefresh(new Date()); }}
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
          <span className="w-2 h-2 rounded-full bg-emerald-400 live-pulse" />
          <span className="text-sm text-emerald-400 font-medium">{liveMatches.length} Live</span>
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
          <p className="text-muted-foreground">Failed to load live matches</p>
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
          <Radio className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">No Live Matches</p>
          <p className="text-muted-foreground">There are no matches in progress right now</p>
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

  const hasOdds = oddsData && (oddsData.homeWin || oddsData.draw || oddsData.awayWin);

  return (
    <Card className="glass-card glow-cyan p-4 cursor-pointer" onClick={onMatchClick}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 live-pulse" />
          <span className="text-[11px] text-cyan-400 font-mono uppercase tracking-wider">
            {getPeriodLabel(match.period || undefined)}
          </span>
          {match.currentMinute && (
            <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-mono text-[10px]">
              <Clock className="w-3 h-3 mr-1" />
              {match.currentMinute}&apos;
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {match.leagueName || `League #${match.leagueId}`}
        </span>
      </div>

      {/* Score */}
      <div className="flex items-center justify-center gap-6 my-4">
        <div className="flex-1 text-right">
          <span className="text-base font-medium">{match.homeTeam}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold font-mono text-emerald-400">
            {match.homeScore ?? 0}
          </span>
          <span className="text-xl text-muted-foreground">-</span>
          <span className="text-3xl font-bold font-mono text-emerald-400">
            {match.awayScore ?? 0}
          </span>
        </div>
        <div className="flex-1 text-left">
          <span className="text-base font-medium">{match.awayTeam}</span>
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
