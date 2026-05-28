'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Search,
  Calendar,
  Radio,
  Target,
  Clock,
  ChevronRight,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { format, addDays, startOfDay, isToday, isTomorrow, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { PremiumFixtureCard } from '@/components/premium-fixture-card';
import { LeagueLogo } from '@/components/league-logo';
import type { FixtureData } from '@/components/premium-fixture-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

// ── Status helpers ──────────────────────────────────────────────────

function isLiveStatus(status: string): boolean {
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE', 'IN_PLAY', 'HALFTIME', 'SECOND_HALF', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'];
  return liveStatuses.includes(status?.toUpperCase());
}

function isFinishedStatus(status: string): boolean {
  const finishedStatuses = ['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'FINISHED', 'COMPLETE'];
  return finishedStatuses.includes(status?.toUpperCase());
}

// ── Date pill type ──────────────────────────────────────────────────

interface DatePill {
  date: string;
  label: string;
  dayNum: string;
  month: string;
  isToday: boolean;
}

// ── League group type ───────────────────────────────────────────────

interface LeagueGroup {
  leagueId: number;
  leagueName: string;
  leagueLogoUrl: string;
  fixtures: FixtureData[];
  liveCount: number;
}

// ── Fetcher ─────────────────────────────────────────────────────────

async function fetchFixtures(date: string): Promise<{ fixtures: FixtureData[] }> {
  const res = await fetch(`/api/v5/fixtures?date=${date}`);
  if (!res.ok) throw new Error(`Failed to fetch fixtures: ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD V2 — Fixtures-centric view
// ═══════════════════════════════════════════════════════════════════════

export function DashboardV2() {
  const router = useRouter();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'live' | 'predicted'>('all');

  // ── Fetch fixtures ────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['v5-fixtures', selectedDate],
    queryFn: () => fetchFixtures(selectedDate),
    refetchInterval: 90000,
    staleTime: 30000,
  });

  const fixtures = data?.fixtures || [];

  // ── 7-day date strip ──────────────────────────────────────────────
  const datePills = useMemo<DatePill[]>(() => {
    const todayStart = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(todayStart, i);
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

  // ── Filtered & grouped fixtures ───────────────────────────────────
  const filteredFixtures = useMemo(() => {
    let result = fixtures;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.homeTeam.toLowerCase().includes(q) ||
          f.awayTeam.toLowerCase().includes(q) ||
          f.leagueName.toLowerCase().includes(q)
      );
    }

    // Tab filter
    if (activeFilter === 'live') {
      result = result.filter((f) => isLiveStatus(f.status));
    } else if (activeFilter === 'predicted') {
      result = result.filter((f) => f.prediction != null);
    }

    return result;
  }, [fixtures, searchQuery, activeFilter]);

  const leagueGroups = useMemo<LeagueGroup[]>(() => {
    const groups = new Map<number, LeagueGroup>();

    for (const fixture of filteredFixtures) {
      const lid = fixture.leagueId;
      if (!groups.has(lid)) {
        groups.set(lid, {
          leagueId: lid,
          leagueName: fixture.leagueName,
          leagueLogoUrl: fixture.leagueLogoUrl,
          fixtures: [],
          liveCount: 0,
        });
      }
      const group = groups.get(lid)!;
      group.fixtures.push(fixture);
      if (isLiveStatus(fixture.status)) {
        group.liveCount++;
      }
    }

    // Sort fixtures within each league by kickoff time
    for (const group of groups.values()) {
      group.fixtures.sort(
        (a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
      );
    }

    // Sort leagues: live matches first, then alphabetically
    return Array.from(groups.values()).sort((a, b) => {
      if (a.liveCount > 0 && b.liveCount === 0) return -1;
      if (b.liveCount > 0 && a.liveCount === 0) return 1;
      return a.leagueName.localeCompare(b.leagueName);
    });
  }, [filteredFixtures]);

  // ── Stats ─────────────────────────────────────────────────────────
  const liveCount = fixtures.filter((f) => isLiveStatus(f.status)).length;
  const predictedCount = fixtures.filter((f) => f.prediction != null).length;

  // ── Navigate to match ─────────────────────────────────────────────
  const handleMatchClick = useCallback(
    (fixtureId: number) => {
      router.push(`/matches/${fixtureId}`);
    },
    [router]
  );

  return (
    <div className="space-y-5">
      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-400" />
            Fixtures
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All matches &middot; AI predictions from Punter Brain v4
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-8 gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          {liveCount > 0 && (
            <Badge className="bg-red-500/10 text-red-300 border-red-500/20 text-[9px] flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
              </span>
              {liveCount} LIVE
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
                  className={cn(
                    'flex-shrink-0 flex flex-col items-center justify-center px-4 py-2.5 rounded-xl',
                    'border transition-all duration-200 min-w-[72px]',
                    isActive
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-slate-200',
                    pill.isToday && !isActive && 'border-emerald-500/15 text-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-wider',
                      isActive && 'text-emerald-400'
                    )}
                  >
                    {pill.label}
                  </span>
                  <span
                    className={cn(
                      'text-lg font-bold font-mono leading-tight mt-0.5',
                      isActive && 'text-white'
                    )}
                  >
                    {pill.dayNum}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {pill.month}
                  </span>
                  {pill.isToday && (
                    <span
                      className={cn(
                        'w-1 h-1 rounded-full mt-1',
                        isActive ? 'bg-emerald-400' : 'bg-emerald-500/40'
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* ── SEARCH BAR ──────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search team or league..."
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/30 focus:bg-white/[0.05] transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── FILTER TABS ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {[
          { id: 'all' as const, label: 'All', count: fixtures.length },
          { id: 'live' as const, label: 'Live', count: liveCount },
          { id: 'predicted' as const, label: 'Predicted', count: predictedCount },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              activeFilter === tab.id
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06] hover:text-slate-200'
            )}
          >
            {tab.id === 'live' && tab.count > 0 && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
              </span>
            )}
            {tab.id === 'predicted' && <Target className="w-3 h-3" />}
            {tab.label}
            <span
              className={cn(
                'text-[10px] font-mono',
                activeFilter === tab.id ? 'text-emerald-400/70' : 'text-slate-500'
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── FIXTURES LIST ────────────────────────────────────────────── */}
      {isLoading ? (
        <FixturesSkeletonV2 />
      ) : leagueGroups.length === 0 ? (
        <EmptyStateV2
          searchQuery={searchQuery}
          activeFilter={activeFilter}
          onSync={() => refetch()}
        />
      ) : (
        <div className="space-y-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${selectedDate}-${activeFilter}-${searchQuery}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              {leagueGroups.map((group) => (
                <LeagueGroupSection
                  key={group.leagueId}
                  group={group}
                  onMatchClick={handleMatchClick}
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
// LEAGUE GROUP SECTION
// ═══════════════════════════════════════════════════════════════════════

function LeagueGroupSection({
  group,
  onMatchClick,
}: {
  group: LeagueGroup;
  onMatchClick: (id: number) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* League Header */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <LeagueLogo
          leagueId={group.leagueId}
          name={group.leagueName}
          src={group.leagueLogoUrl || undefined}
          size="sm"
        />
        <h3 className="text-sm font-semibold text-slate-200 truncate flex-1">
          {group.leagueName}
        </h3>
        {group.liveCount > 0 && (
          <Badge className="bg-red-500/10 text-red-300 border-red-500/20 text-[9px] px-1.5 py-0 flex items-center gap-0.5">
            <Radio className="w-2.5 h-2.5" />
            {group.liveCount} live
          </Badge>
        )}
        <Badge className="bg-white/[0.04] text-slate-400 border-white/[0.06] text-[9px] px-1.5 py-0">
          {group.fixtures.length}
        </Badge>
      </div>

      {/* Fixture Cards */}
      <div className="space-y-2">
        {group.fixtures.map((fixture) => (
          <PremiumFixtureCard
            key={fixture.id}
            fixture={fixture}
            onClick={() => onMatchClick(fixture.id)}
            showPrediction={true}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SKELETON LOADER
// ═══════════════════════════════════════════════════════════════════════

function FixturesSkeletonV2() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Skeleton className="h-5 w-5 rounded glass-skeleton" />
            <Skeleton className="h-4 w-32 glass-skeleton" />
            <Skeleton className="h-4 w-8 glass-skeleton ml-auto" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="rounded-[24px] border border-white/[0.06] bg-[#0d1117] p-4"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-16 rounded-full glass-skeleton" />
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-5 w-5 rounded glass-skeleton" />
                    <Skeleton className="h-3 w-16 glass-skeleton" />
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full glass-skeleton" />
                    <Skeleton className="h-4 w-24 glass-skeleton" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full glass-skeleton" />
                    <Skeleton className="h-4 w-24 glass-skeleton" />
                  </div>
                </div>
                <div className="mt-4 rounded-[20px] bg-black/10 p-3">
                  <Skeleton className="h-10 w-full glass-skeleton" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════

function EmptyStateV2({
  searchQuery,
  activeFilter,
  onSync,
}: {
  searchQuery: string;
  activeFilter: string;
  onSync: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-white/[0.06] bg-[#0d1117] p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
          <Calendar className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          {searchQuery ? (
            <>
              <p className="text-lg font-medium text-muted-foreground">
                No matches found for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-xs text-slate-500 mt-1">Try a different search term</p>
            </>
          ) : activeFilter !== 'all' ? (
            <>
              <p className="text-lg font-medium text-muted-foreground">
                No {activeFilter} matches for this date
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Try switching to the &ldquo;All&rdquo; filter
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-muted-foreground">
                No fixtures found for this date
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Try selecting a different date or sync to get the latest data.
              </p>
            </>
          )}
        </div>
        {!searchQuery && activeFilter === 'all' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            className="mt-2 text-emerald-400 border border-emerald-500/20"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync Data
          </Button>
        )}
      </div>
    </div>
  );
}
