'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchEvents, fetchLiveEvents, fetchV4Tips } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  RefreshCw, Zap, Radio, Calendar, Trophy,
  TrendingUp, Activity, BarChart3, Clock, ChevronRight,
  Swords, Target, Minus, Flame,
} from 'lucide-react';
import {
  format, addDays, subDays, isToday, startOfDay, isYesterday, isTomorrow,
} from 'date-fns';
import { useState, useCallback, useMemo } from 'react';
import type { MatchData, PunterTipV4Data, TipQuality } from '@/lib/types';

// ── Country Flag Map (reused from leagues) ──────────────────────────

const COUNTRY_FLAGS: Record<string, string> = {
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Spain': '🇪🇸', 'Germany': '🇩🇪', 'Italy': '🇮🇹',
  'France': '🇫🇷', 'Netherlands': '🇳🇱', 'Portugal': '🇵🇹', 'Brazil': '🇧🇷',
  'Argentina': '🇦🇷', 'Turkey': '🇹🇷', 'Belgium': '🇧🇪', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'USA': '🇺🇸', 'Mexico': '🇲🇽', 'Japan': '🇯🇵', 'South Korea': '🇰🇷',
  'Australia': '🇦🇺', 'China': '🇨🇳', 'Russia': '🇷🇺', 'Ukraine': '🇺🇦',
  'Poland': '🇵🇱', 'Sweden': '🇸🇪', 'Norway': '🇳🇴', 'Denmark': '🇩🇰',
  'Switzerland': '🇨🇭', 'Austria': '🇦🇹', 'Czech Republic': '🇨🇿', 'Greece': '🇬🇷',
  'Romania': '🇷🇴', 'Croatia': '🇭🇷', 'Serbia': '🇷🇸', 'Colombia': '🇨🇴',
  'Chile': '🇨🇱', 'Ecuador': '🇪🇨', 'Peru': '🇵🇪', 'Uruguay': '🇺🇾',
  'Paraguay': '🇵🇾', 'Saudi Arabia': '🇸🇦', 'Egypt': '🇪🇬', 'Nigeria': '🇳🇬',
  'South Africa': '🇿🇦', 'International': '🌍', 'Europe': '🇪🇺', 'World': '🌍',
  'Africa': '🌍', 'South America': '🌎', 'Asia': '🌏', 'Venezuela': '🇻🇪',
  'Finland': '🇫🇮', 'Ireland': '🇮🇪', 'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Israel': '🇮🇱',
};

// ── Tip Quality Config ──────────────────────────────────────────────

const TIP_QUALITY_CONFIG: Record<TipQuality, { color: string; bg: string; border: string; emoji: string }> = {
  gold: { color: 'text-amber-300', bg: 'bg-amber-500/20', border: 'border-amber-500/40', emoji: '🥇' },
  silver: { color: 'text-cyan-300', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30', emoji: '🥈' },
  bronze: { color: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/30', emoji: '🥉' },
  skip: { color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20', emoji: '' },
};

// ── Match Status Helpers ────────────────────────────────────────────

function isLiveStatus(status: string): boolean {
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE', 'IN_PLAY', 'HALFTIME', 'SECOND_HALF', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'];
  return liveStatuses.includes(status?.toUpperCase());
}

function isFinishedStatus(status: string): boolean {
  const finishedStatuses = ['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'FINISHED', 'COMPLETE'];
  return finishedStatuses.includes(status?.toUpperCase());
}

function isNotStarted(status: string): boolean {
  return !isLiveStatus(status) && !isFinishedStatus(status);
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export function Dashboard() {
  const { selectedDate, setSelectedDate, openMatchPanel } = useAppStore();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  // ── Data Fetching ────────────────────────────────────────────────
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['events', selectedDate],
    queryFn: () => fetchEvents(selectedDate, selectedDate, 200),
    refetchInterval: 60000,
  });

  const { data: liveData } = useQuery({
    queryKey: ['live'],
    queryFn: fetchLiveEvents,
    refetchInterval: 30000,
  });

  const { data: tipsData, isLoading: tipsLoading } = useQuery({
    queryKey: ['v4-tips', selectedDate],
    queryFn: () => fetchV4Tips({ dateFrom: selectedDate, dateTo: selectedDate, limit: 100 }),
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

  // ── Derived Data ─────────────────────────────────────────────────
  const liveMatches = liveData?.results || [];
  const events = eventsData?.results || [];
  const tips = tipsData?.results || [];
  const stats = tipsData?.stats;
  const engineVersion = tipsData?.engineVersion;

  // Map tips by eventId for O(1) lookup
  const tipsMap = useMemo(() => {
    const map = new Map<number, PunterTipV4Data>();
    for (const tip of tips) {
      map.set(tip.eventId, tip);
    }
    return map;
  }, [tips]);

  // Merge events with tips data
  const enrichedEvents = useMemo(() => {
    return events.map(event => ({
      ...event,
      tip: tipsMap.get(event.id)?.tip ?? null,
      probabilities: tipsMap.get(event.id)?.probabilities ?? null,
      analysis: tipsMap.get(event.id)?.analysis ?? null,
      modelAgreement: tipsMap.get(event.id)?.modelAgreement ?? 0,
      // Use tip's leagueName if event has none
      leagueName: event.leagueName || tipsMap.get(event.id)?.leagueName || 'Unknown League',
    }));
  }, [events, tipsMap]);

  // Group matches by league
  const groupedByLeague = useMemo(() => {
    const groups = new Map<number, {
      leagueId: number;
      leagueName: string;
      matches: typeof enrichedEvents;
    }>();

    for (const match of enrichedEvents) {
      const lid = match.leagueId;
      if (!groups.has(lid)) {
        groups.set(lid, {
          leagueId: lid,
          leagueName: match.leagueName,
          matches: [],
        });
      }
      groups.get(lid)!.matches.push(match);
    }

    // Sort matches within each league by eventDate/time
    for (const group of groups.values()) {
      group.matches.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    }

    // Sort leagues alphabetically by name
    return Array.from(groups.values()).sort((a, b) => a.leagueName.localeCompare(b.leagueName));
  }, [enrichedEvents]);

  // Stats calculations
  const tipsWithTip = tips.filter(t => t.tip && t.tip.quality !== 'skip');
  const liveCount = liveMatches.length;
  const avgXg = tips.length > 0
    ? tips.reduce((sum, t) => sum + t.probabilities.homeXg + t.probabilities.awayXg, 0) / tips.length
    : 0;

  // Last sync time
  const lastSyncTime = syncStatus?.syncStatus?.[0]?.last_sync_at
    ? format(new Date(syncStatus.syncStatus[0].last_sync_at), 'HH:mm')
    : null;

  // ── 7-Day Date Pills ─────────────────────────────────────────────
  const datePills = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(subDays(today, 1), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      let label: string;
      if (isYesterday(date)) label = 'Yesterday';
      else if (isToday(date)) label = 'Today';
      else if (isTomorrow(date)) label = 'Tomorrow';
      else label = format(date, 'EEE');
      return {
        date: dateStr,
        label,
        dayNum: format(date, 'd'),
        month: format(date, 'MMM'),
        isToday: isToday(date),
      };
    });
  }, []);

  // ── Infer country from league name for flag emoji ────────────────
  const getLeagueFlag = (leagueName: string): string => {
    // Try to match country keywords in league name
    const nameLower = leagueName.toLowerCase();
    for (const [country, flag] of Object.entries(COUNTRY_FLAGS)) {
      if (nameLower.includes(country.toLowerCase())) return flag;
    }
    // Common league name patterns
    if (nameLower.includes('premier league') || nameLower.includes('championship') || nameLower.includes('league one') || nameLower.includes('league two') || nameLower.includes('efa')) return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
    if (nameLower.includes('la liga') || nameLower.includes('segunda')) return '🇪🇸';
    if (nameLower.includes('bundesliga') || nameLower.includes('2. bundesliga')) return '🇩🇪';
    if (nameLower.includes('serie a') || nameLower.includes('serie b')) return '🇮🇹';
    if (nameLower.includes('ligue 1') || nameLower.includes('ligue 2')) return '🇫🇷';
    if (nameLower.includes('eredivisie')) return '🇳🇱';
    if (nameLower.includes('liga portugal') || nameLower.includes('primeira liga')) return '🇵🇹';
    if (nameLower.includes('champions league') || nameLower.includes('europa league') || nameLower.includes('conference league')) return '🇪🇺';
    return '⚽';
  };

  return (
    <div className="space-y-5">
      {/* ── LIVE TICKER BAR ──────────────────────────────────────────── */}
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

      {/* ── TOP HEADER ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Swords className="w-6 h-6 text-emerald-400" />
            Fixtures
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All matches · Tips &amp; xG from Punter Brain v4
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className={`h-8 gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 ${syncing ? 'sync-pulse' : ''}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </Button>
          {lastSyncTime && (
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastSyncTime}
            </span>
          )}
          {engineVersion && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">
              <Zap className="w-2.5 h-2.5 mr-1" />
              v{engineVersion}
            </Badge>
          )}
        </div>
      </div>

      {/* ── 7-DAY DATE SELECTOR ──────────────────────────────────────── */}
      <div className="relative">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-2 pb-1">
            {datePills.map((pill) => {
              const isActive = pill.date === selectedDate;
              return (
                <button
                  key={pill.date}
                  onClick={() => setSelectedDate(pill.date)}
                  className={`
                    flex-shrink-0 flex flex-col items-center justify-center px-4 py-2.5 rounded-xl
                    border transition-all duration-200 min-w-[72px]
                    ${isActive
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-slate-200'
                    }
                    ${pill.isToday && !isActive ? 'border-emerald-500/15 text-slate-300' : ''}
                  `}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${isActive ? 'text-emerald-400' : ''}`}>
                    {pill.label}
                  </span>
                  <span className={`text-lg font-bold font-mono leading-tight mt-0.5 ${isActive ? 'text-white' : ''}`}>
                    {pill.dayNum}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {pill.month}
                  </span>
                  {pill.isToday && (
                    <span className={`w-1 h-1 rounded-full mt-1 ${isActive ? 'bg-emerald-400' : 'bg-emerald-500/40'}`} />
                  )}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* ── STATS ROW ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Calendar className="w-4 h-4" />}
          label="Matches"
          value={events.length.toString()}
          color="text-emerald-400"
          borderColor="border-emerald-500/20"
          loading={eventsLoading}
        />
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="Tips"
          value={tipsWithTip.length.toString()}
          color="text-amber-400"
          borderColor="border-amber-500/20"
          loading={tipsLoading}
        />
        <StatCard
          icon={<Radio className="w-4 h-4" />}
          label="Live Now"
          value={liveCount.toString()}
          color="text-emerald-400"
          borderColor="border-emerald-500/20"
          pulse={liveCount > 0}
        />
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Avg xG"
          value={tips.length > 0 ? avgXg.toFixed(2) : '—'}
          color="text-cyan-400"
          borderColor="border-cyan-500/20"
          loading={tipsLoading}
        />
      </div>

      {/* ── FIXTURES LIST ────────────────────────────────────────────── */}
      {eventsLoading ? (
        <FixturesSkeleton />
      ) : groupedByLeague.length === 0 ? (
        <EmptyState onSync={handleSync} syncing={syncing} />
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedDate}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {groupedByLeague.map((league) => (
                <LeagueSection
                  key={league.leagueId}
                  leagueId={league.leagueId}
                  leagueName={league.leagueName}
                  matches={league.matches}
                  tipsMap={tipsMap}
                  onMatchClick={openMatchPanel}
                  getLeagueFlag={getLeagueFlag}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LEAGUE SECTION
// ═══════════════════════════════════════════════════════════════════════

function LeagueSection({
  leagueId,
  leagueName,
  matches,
  tipsMap,
  onMatchClick,
  getLeagueFlag,
}: {
  leagueId: number;
  leagueName: string;
  matches: Array<MatchData & { tip: any; probabilities: any; analysis: any; modelAgreement: number; leagueName: string }>;
  tipsMap: Map<number, PunterTipV4Data>;
  onMatchClick: (id: number) => void;
  getLeagueFlag: (name: string) => string;
}) {
  const flag = getLeagueFlag(leagueName);

  // Count tips in this league
  const tipsCount = matches.filter(m => m.tip && m.tip.quality !== 'skip').length;
  const goldCount = matches.filter(m => m.tip?.quality === 'gold').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* League Header */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-base">{flag}</span>
        <h3 className="text-sm font-semibold text-slate-200 truncate flex-1">{leagueName}</h3>
        <Badge className="bg-white/[0.04] text-slate-400 border-white/[0.06] text-[9px] px-1.5 py-0">
          {matches.length}
        </Badge>
        {tipsCount > 0 && (
          <Badge className={`${goldCount > 0 ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'} text-[9px] px-1.5 py-0 flex items-center gap-0.5`}>
            <Flame className="w-2.5 h-2.5" />
            {tipsCount} tip{tipsCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Match Rows */}
      <Card className="glass-card-premium overflow-hidden">
        <div className="divide-y divide-white/[0.04]">
          {matches.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              tipData={tipsMap.get(match.id) ?? null}
              onClick={() => onMatchClick(match.id)}
            />
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MATCH ROW — Compact, premium row like FotMob/SofaScore
// ═══════════════════════════════════════════════════════════════════════

function MatchRow({
  match,
  tipData,
  onClick,
}: {
  match: MatchData & { tip: any; probabilities: any; analysis: any; modelAgreement: number };
  tipData: PunterTipV4Data | null;
  onClick: () => void;
}) {
  const live = isLiveStatus(match.status);
  const finished = isFinishedStatus(match.status);
  const notStarted = isNotStarted(match.status);

  const tip = tipData?.tip ?? null;
  const probabilities = tipData?.probabilities ?? null;
  const analysis = tipData?.analysis ?? null;
  const quality: TipQuality = tip?.quality ?? 'skip';
  const tipConfig = TIP_QUALITY_CONFIG[quality];

  // Determine predicted winner for bold styling
  const homeWinProb = probabilities?.homeWin ?? 0;
  const awayWinProb = probabilities?.awayWin ?? 0;
  const drawProb = probabilities?.draw ?? 0;
  const homePredicted = homeWinProb > awayWinProb && homeWinProb > drawProb;
  const awayPredicted = awayWinProb > homeWinProb && awayWinProb > drawProb;

  // Form data
  const homeForm = analysis?.last5?.home?.form ?? '';
  const awayForm = analysis?.last5?.away?.form ?? '';

  const kickoffTime = format(new Date(match.eventDate), 'HH:mm');

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 sm:px-4 py-2.5 hover:bg-white/[0.03] transition-colors group"
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {/* ── Time / Status Column ──────────────────────────────── */}
        <div className="w-12 sm:w-14 flex-shrink-0 text-center">
          {live ? (
            <div className="flex flex-col items-center">
              <span className="relative flex items-center justify-center">
                <span className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
                <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[11px] font-mono font-bold text-emerald-400 leading-tight">
                {match.currentMinute ? `${match.currentMinute}'` : 'LIVE'}
              </span>
            </div>
          ) : finished ? (
            <span className="text-[11px] font-mono font-medium text-slate-500">FT</span>
          ) : (
            <span className="text-[11px] font-mono font-medium text-slate-300">{kickoffTime}</span>
          )}
        </div>

        {/* ── Home Team ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm truncate ${homePredicted ? 'font-semibold text-white' : 'text-slate-300'}`}>
              {match.homeTeam}
            </span>
            {homePredicted && probabilities && (
              <span className="text-[9px] font-mono text-emerald-400/60 flex-shrink-0">
                {Math.round(homeWinProb * 100)}%
              </span>
            )}
          </div>
          {homeForm && (
            <div className="flex gap-0.5 mt-0.5">
              {homeForm.slice(0, 5).split('').map((ch, i) => (
                <FormDot key={i} result={ch} />
              ))}
            </div>
          )}
        </div>

        {/* ── Score / Prediction Area ───────────────────────────── */}
        <div className="w-20 sm:w-28 flex-shrink-0 flex flex-col items-center justify-center">
          {live || finished ? (
            /* Score display */
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold font-mono min-w-[18px] text-center ${live ? 'text-emerald-300' : 'text-white'}`}>
                {match.homeScore ?? 0}
              </span>
              <span className="text-[10px] text-slate-500">-</span>
              <span className={`text-sm font-bold font-mono min-w-[18px] text-center ${live ? 'text-emerald-300' : 'text-white'}`}>
                {match.awayScore ?? 0}
              </span>
            </div>
          ) : probabilities ? (
            /* Probability bars */
            <div className="w-full space-y-0.5">
              <ProbBar label="H" value={homeWinProb} color="emerald" />
              <ProbBar label="D" value={drawProb} color="slate" />
              <ProbBar label="A" value={awayWinProb} color="cyan" />
            </div>
          ) : (
            <span className="text-[11px] text-slate-500">vs</span>
          )}

          {/* xG sub-line */}
          {probabilities && notStarted && (
            <span className="text-[9px] text-slate-500 font-mono mt-0.5">
              xG {probabilities.homeXg.toFixed(1)} - {probabilities.awayXg.toFixed(1)}
            </span>
          )}
          {(live || finished) && probabilities && (
            <span className="text-[9px] text-slate-500 font-mono">
              xG {probabilities.homeXg.toFixed(1)} - {probabilities.awayXg.toFixed(1)}
            </span>
          )}
        </div>

        {/* ── Away Team ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center gap-1.5 justify-end">
            {awayPredicted && probabilities && (
              <span className="text-[9px] font-mono text-emerald-400/60 flex-shrink-0">
                {Math.round(awayWinProb * 100)}%
              </span>
            )}
            <span className={`text-sm truncate ${awayPredicted ? 'font-semibold text-white' : 'text-slate-300'}`}>
              {match.awayTeam}
            </span>
          </div>
          {awayForm && (
            <div className="flex gap-0.5 mt-0.5 justify-end">
              {awayForm.slice(0, 5).split('').map((ch, i) => (
                <FormDot key={i} result={ch} />
              ))}
            </div>
          )}
        </div>

        {/* ── Tip Badge ─────────────────────────────────────────── */}
        <div className="w-8 sm:w-10 flex-shrink-0 flex items-center justify-center">
          {tip && quality !== 'skip' ? (
            <div className={`
              w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center
              ${tipConfig.bg} border ${tipConfig.border}
              ${quality === 'gold' ? 'shadow-[0_0_8px_rgba(245,158,11,0.2)]' : ''}
              ${quality === 'silver' ? 'shadow-[0_0_8px_rgba(6,182,212,0.15)]' : ''}
            `}>
              <span className="text-[10px] sm:text-[11px] font-bold font-mono leading-none">
                {tip.selection === match.homeTeam || tip.selection === 'Home' || tip.selection === '1'
                  ? '1'
                  : tip.selection === match.awayTeam || tip.selection === 'Away' || tip.selection === '2'
                    ? '2'
                    : tip.selection === 'Draw' || tip.selection === 'X'
                      ? 'X'
                      : tip.selection.length > 4
                        ? tip.selection.slice(0, 3)
                        : tip.selection
                }
              </span>
            </div>
          ) : (
            <span className="text-slate-600 text-xs">—</span>
          )}
        </div>

        {/* ── Chevron ───────────────────────────────────────────── */}
        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PROBABILITY BAR — Tiny horizontal bar for H/D/A
// ═══════════════════════════════════════════════════════════════════════

function ProbBar({ label, value, color }: { label: string; value: number; color: 'emerald' | 'slate' | 'cyan' }) {
  const pct = Math.round(value * 100);
  const barColor = color === 'emerald'
    ? 'bg-emerald-500/50'
    : color === 'cyan'
      ? 'bg-cyan-500/40'
      : 'bg-slate-400/30';
  const textColor = color === 'emerald'
    ? 'text-emerald-400'
    : color === 'cyan'
      ? 'text-cyan-400'
      : 'text-slate-400';

  return (
    <div className="flex items-center gap-1">
      <span className={`text-[8px] font-mono w-3 ${textColor}`}>{label}</span>
      <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>
      <span className={`text-[8px] font-mono w-6 text-right ${textColor}`}>{pct}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// FORM DOT — Colored dot for W/D/L
// ═══════════════════════════════════════════════════════════════════════

function FormDot({ result }: { result: string }) {
  const color = result === 'W'
    ? 'bg-emerald-400'
    : result === 'D'
      ? 'bg-amber-400'
      : 'bg-red-400';

  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

// ═══════════════════════════════════════════════════════════════════════
// STAT CARD — Compact stat display
// ═══════════════════════════════════════════════════════════════════════

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
    <Card className={`glass-card-premium p-3 border ${borderColor}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        {pulse && (
          <span className="relative flex h-1.5 w-1.5 ml-auto">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-14 glass-skeleton" />
      ) : (
        <span className={`text-xl font-bold font-mono ${color}`}>{value}</span>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// FIXTURES SKELETON — Loading state
// ═══════════════════════════════════════════════════════════════════════

function FixturesSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Skeleton className="h-4 w-4 rounded glass-skeleton" />
            <Skeleton className="h-4 w-32 glass-skeleton" />
            <Skeleton className="h-4 w-8 glass-skeleton ml-auto" />
          </div>
          <Card className="glass-card-premium overflow-hidden">
            <div className="divide-y divide-white/[0.04]">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="px-4 py-3 flex items-center gap-3">
                  <Skeleton className="h-4 w-10 glass-skeleton" />
                  <Skeleton className="h-4 w-24 glass-skeleton" />
                  <Skeleton className="h-4 w-20 glass-skeleton mx-auto" />
                  <Skeleton className="h-4 w-24 glass-skeleton ml-auto" />
                  <Skeleton className="h-6 w-6 rounded-full glass-skeleton" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════

function EmptyState({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  return (
    <Card className="glass-card-premium p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
          <Calendar className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-medium text-muted-foreground">No fixtures found for this date</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try selecting a different date or sync to get the latest data.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSync}
          disabled={syncing}
          className="mt-2 text-emerald-400 border border-emerald-500/20"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Sync Data
        </Button>
      </div>
    </Card>
  );
}
