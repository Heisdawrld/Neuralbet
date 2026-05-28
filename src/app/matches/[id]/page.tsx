'use client';

import React, { useState, use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Target,
  BarChart3,
  Swords,
  Trophy,
  Users,
  Shield,
  Brain,
  ChevronRight,
  X,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Radio,
  Flame,
  TrendingUp,
  Crosshair,
  Activity,
  MapPin,
  Thermometer,
  Minus,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { TeamLogo } from '@/components/team-logo';
import { LeagueLogo } from '@/components/league-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import type { TipQuality, PunterTipV4Data } from '@/lib/types';

// ── API Response Type (reuses existing match detail structure) ──────

interface MatchDetailResponse {
  event: {
    id: number;
    leagueId: number;
    leagueName: string;
    leagueCountry: string | null;
    homeTeamId: number;
    homeTeam: string;
    awayTeamId: number;
    awayTeam: string;
    eventDate: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeScoreHt: number | null;
    awayScoreHt: number | null;
    currentMinute: number | null;
    period: string;
    roundNumber: number | null;
    isLocalDerby: boolean;
    isNeutralGround: boolean;
    weatherDescription: string | null;
    weatherTemperatureC: number | null;
    venue: { name: string; city: string; capacity: number | null } | null;
  };
  odds: {
    homeWin: number | null;
    draw: number | null;
    awayWin: number | null;
    over25: number | null;
    bttsYes: number | null;
  } | null;
  lineup: {
    lineupStatus: string;
    homeFormation: string | null;
    awayFormation: string | null;
    homePlayers: any[] | null;
    awayPlayers: any[] | null;
  } | null;
  stats: {
    homeTotalShots: number;
    awayTotalShots: number;
    homeShotsOnTarget: number;
    awayShotsOnTarget: number;
    homeBallPossession: number;
    awayBallPossession: number;
    homeXg: number;
    awayXg: number;
    homeCorners: number;
    awayCorners: number;
    homeFouls: number;
    awayFouls: number;
    homeYellowCards: number;
    awayYellowCards: number;
    homeRedCards: number;
    awayRedCards: number;
  } | null;
  h2h: Array<{
    homeTeamId: number;
    awayTeamId: number;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    eventDate: string;
  }>;
  standings: Array<{
    position: number;
    teamId: number;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    gd: number;
    pts: number;
    form: string | null;
  }>;
  homeTeamStanding: {
    position: number;
    teamId: number;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    pts: number;
    form: string | null;
  } | null;
  awayTeamStanding: {
    position: number;
    teamId: number;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    pts: number;
    form: string | null;
  } | null;
  enginePrediction: PunterTipV4Data | null;
}

// ── Status helpers ──────────────────────────────────────────────────

function isLiveStatus(status: string): boolean {
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE', 'IN_PLAY', 'HALFTIME', 'SECOND_HALF'];
  return liveStatuses.includes(status?.toUpperCase());
}

function isFinishedStatus(status: string): boolean {
  const finishedStatuses = ['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'FINISHED', 'COMPLETE'];
  return finishedStatuses.includes(status?.toUpperCase());
}

// ── Quality Config ──────────────────────────────────────────────────

const QUALITY_CONFIG: Record<TipQuality, { color: string; bg: string; border: string }> = {
  gold: { color: 'text-amber-300', bg: 'bg-amber-500/20', border: 'border-amber-500/40' },
  silver: { color: 'text-cyan-300', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
  bronze: { color: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/30' },
  skip: { color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
};

const RISK_BG: Record<string, string> = {
  'very-low': 'bg-emerald-500/10 border-emerald-500/20',
  'low': 'bg-emerald-500/10 border-emerald-500/20',
  'medium': 'bg-amber-500/10 border-amber-500/20',
  'high': 'bg-orange-500/10 border-orange-500/20',
  'very-high': 'bg-red-500/10 border-red-500/20',
};

const RISK_COLORS: Record<string, string> = {
  'very-low': 'text-emerald-400',
  'low': 'text-emerald-400',
  'medium': 'text-amber-400',
  'high': 'text-orange-400',
  'very-high': 'text-red-400',
};

// ── Tab type ────────────────────────────────────────────────────────

type TabId = 'prediction' | 'stats' | 'h2h' | 'standings' | 'lineups';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'prediction', label: 'Prediction', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'h2h', label: 'H2H', icon: <Swords className="w-3.5 h-3.5" /> },
  { id: 'standings', label: 'Standings', icon: <Trophy className="w-3.5 h-3.5" /> },
  { id: 'lineups', label: 'Lineups', icon: <Users className="w-3.5 h-3.5" /> },
];

// ── Implied prob helper ─────────────────────────────────────────────

function impliedProb(odds: number | null): number | null {
  if (!odds || odds <= 0) return null;
  return 1 / odds;
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── Form Letter ─────────────────────────────────────────────────────

function FormLetter({ letter }: { letter: string }) {
  const colors: Record<string, string> = {
    W: 'bg-emerald-500/30 text-emerald-300',
    D: 'bg-amber-500/30 text-amber-300',
    L: 'bg-red-500/30 text-red-300',
  };
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${
        colors[letter] || 'bg-slate-500/20 text-slate-400'
      }`}
    >
      {letter}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MATCH CENTER PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function MatchCenterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('prediction');

  const { data, isLoading } = useQuery<MatchDetailResponse>({
    queryKey: ['match-detail', id],
    queryFn: () => fetch(`/api/match/${id}`).then((r) => r.json()),
    staleTime: 30000,
    refetchInterval: 45000,
  });

  const live = isLiveStatus(data?.event?.status || '');
  const finished = isFinishedStatus(data?.event?.status || '');
  const hasScores = data?.event?.homeScore != null && data?.event?.awayScore != null;

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* ── BACK NAVIGATION BAR ────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-[#0a0e1a]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex-1" />
          {data?.event && (
            <div className="flex items-center gap-2">
              <LeagueLogo
                leagueId={data.event.leagueId}
                name={data.event.leagueName}
                size="sm"
              />
              <span className="text-[11px] text-slate-400 truncate max-w-[150px]">
                {data.event.leagueName}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <MatchCenterSkeleton />
        ) : !data ? (
          <div className="text-center py-20">
            <AlertTriangle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-lg text-slate-400">Match not found</p>
            <p className="text-sm text-slate-500 mt-1">
              Try syncing data or selecting a different match.
            </p>
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mt-4 text-emerald-400 border border-emerald-500/20"
            >
              Go Back
            </Button>
          </div>
        ) : (
          <>
            {/* ── HERO SECTION ────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-[24px] border border-white/[0.06] bg-[#0d1117] overflow-hidden mb-6"
            >
              {/* Status & League Header */}
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {live ? (
                    <Badge className="bg-red-500/15 text-red-300 border-red-500/25 text-[10px] px-2.5 py-1 flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
                      </span>
                      LIVE{data.event.currentMinute ? ` · ${data.event.currentMinute}'` : ''}
                    </Badge>
                  ) : finished ? (
                    <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/25 text-[10px] px-2.5 py-1">
                      FT
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px] px-2.5 py-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {format(new Date(data.event.eventDate), 'HH:mm')}
                    </Badge>
                  )}
                  <span className="text-[11px] text-white/25">
                    {format(new Date(data.event.eventDate), 'EEE, d MMM yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {data.event.isLocalDerby && (
                    <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[9px] px-1.5 py-0">
                      <Swords className="w-2.5 h-2.5 mr-0.5" />Derby
                    </Badge>
                  )}
                  {data.event.weatherDescription && (
                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] px-1.5 py-0">
                      <Thermometer className="w-2.5 h-2.5 mr-0.5" />
                      {data.event.weatherDescription}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Team Display */}
              <div className="px-5 py-6 flex items-center justify-between gap-4">
                {/* Home Team */}
                <div className="flex-1 flex flex-col items-center text-center min-w-0">
                  <TeamLogo
                    teamId={data.event.homeTeamId}
                    name={data.event.homeTeam}
                    size="xl"
                  />
                  <p className="text-base font-bold text-white mt-3 truncate max-w-full">
                    {data.event.homeTeam}
                  </p>
                  {data.homeTeamStanding && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {data.homeTeamStanding.position}
                      {getOrdinal(data.homeTeamStanding.position)} &middot;{' '}
                      {data.homeTeamStanding.pts} pts
                    </p>
                  )}
                </div>

                {/* Score / Time */}
                <div className="shrink-0 text-center mx-4">
                  {hasScores ? (
                    <div className="flex items-center gap-4">
                      <span
                        className={cn(
                          'text-4xl sm:text-5xl font-mono font-black',
                          live ? 'text-emerald-400' : 'text-white'
                        )}
                      >
                        {data.event.homeScore}
                      </span>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg text-white/10 font-light">-</span>
                        {data.event.homeScoreHt != null && data.event.awayScoreHt != null && (
                          <span className="text-[10px] text-white/25">
                            HT {data.event.homeScoreHt}-{data.event.awayScoreHt}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-4xl sm:text-5xl font-mono font-black',
                          live ? 'text-emerald-400' : 'text-white/80'
                        )}
                      >
                        {data.event.awayScore}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="text-3xl sm:text-4xl font-mono font-bold text-emerald-400">
                        {format(new Date(data.event.eventDate), 'HH:mm')}
                      </span>
                      <span className="text-[11px] text-white/25 mt-1">
                        {format(new Date(data.event.eventDate), 'EEE, d MMM')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Away Team */}
                <div className="flex-1 flex flex-col items-center text-center min-w-0">
                  <TeamLogo
                    teamId={data.event.awayTeamId}
                    name={data.event.awayTeam}
                    size="xl"
                  />
                  <p className="text-base font-bold text-white mt-3 truncate max-w-full">
                    {data.event.awayTeam}
                  </p>
                  {data.awayTeamStanding && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {data.awayTeamStanding.position}
                      {getOrdinal(data.awayTeamStanding.position)} &middot;{' '}
                      {data.awayTeamStanding.pts} pts
                    </p>
                  )}
                </div>
              </div>

              {/* Venue info */}
              {data.event.venue && (
                <div className="px-5 pb-4 flex items-center justify-center gap-1.5 text-[10px] text-white/20">
                  <MapPin className="w-3 h-3" />
                  {data.event.venue.name}, {data.event.venue.city}
                </div>
              )}
            </motion.div>

            {/* ── TAB BAR ──────────────────────────────────────────────── */}
            <div className="sticky top-[53px] z-40 bg-[#0a0e1a]/90 backdrop-blur-md -mx-4 px-4 border-b border-white/[0.06] mb-6">
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-0.5">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-3 text-xs font-medium rounded-t-lg transition-all whitespace-nowrap border-b-2',
                        activeTab === tab.id
                          ? 'text-emerald-400 border-emerald-400 bg-emerald-500/[0.05]'
                          : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/[0.02]'
                      )}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>

            {/* ── TAB CONTENT ──────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'prediction' && <PredictionTab data={data} />}
                {activeTab === 'stats' && <StatsTab data={data} />}
                {activeTab === 'h2h' && <H2HTab data={data} />}
                {activeTab === 'standings' && <StandingsTab data={data} />}
                {activeTab === 'lineups' && <LineupsTab data={data} />}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PREDICTION TAB
// ═══════════════════════════════════════════════════════════════════════

function PredictionTab({ data }: { data: MatchDetailResponse }) {
  const tip = data.enginePrediction;
  const hasTip = tip?.tip !== null && tip?.tip !== undefined;
  const quality: TipQuality = tip?.tip?.quality ?? 'skip';
  const config = QUALITY_CONFIG[quality];

  return (
    <div className="space-y-4">
      {tip && hasTip && tip.tip ? (
        <>
          {/* Best Pick Card */}
          <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-5">
            <div className="flex items-center justify-between mb-4">
              <Badge
                className={`${config.bg} ${config.color} ${config.border} border text-xs px-3 py-1 flex items-center gap-1.5`}
              >
                {quality === 'gold' && <Flame className="w-4 h-4" />}
                {quality === 'silver' && <Crosshair className="w-4 h-4" />}
                {quality === 'bronze' && <TrendingUp className="w-4 h-4" />}
                {quality.toUpperCase()} TIP
              </Badge>
              <div className="flex items-center gap-1.5">
                {tip.tip.isSafePlay && (
                  <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px] px-1.5 py-0 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Safe
                  </Badge>
                )}
                {tip.tip.isContrarian && (
                  <Badge className="bg-violet-500/10 text-violet-300 border-violet-500/20 text-[9px] px-1.5 py-0">
                    Contrarian
                  </Badge>
                )}
              </div>
            </div>

            {/* Selection + Market */}
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="text-2xl font-bold text-white">{tip.tip.selection}</p>
                <p className="text-sm text-muted-foreground mt-1">{tip.tip.market}</p>
                {tip.tip.odds && (
                  <p className="text-2xl font-mono font-bold text-emerald-400 mt-2">
                    @{tip.tip.odds.toFixed(2)}
                  </p>
                )}
              </div>
              {/* Probability Donut */}
              <ProbabilityDonut
                homeWin={tip.probabilities.homeWin}
                draw={tip.probabilities.draw}
                awayWin={tip.probabilities.awayWin}
                homeLabel={data.event.homeTeam.slice(0, 3)}
                awayLabel={data.event.awayTeam.slice(0, 3)}
              />
            </div>

            {/* Edge / Kelly / Risk grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Edge</p>
                <p className="text-lg font-bold text-emerald-400">
                  +{(tip.tip.edge * 100).toFixed(1)}%
                </p>
              </div>
              <div className="text-center bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kelly</p>
                <p className="text-lg font-bold text-cyan-400">
                  {(tip.tip.kellyStake * 100).toFixed(1)}%
                </p>
              </div>
              <div className="text-center bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk</p>
                <Badge
                  className={`${RISK_BG[tip.tip.riskLevel] || ''} ${
                    RISK_COLORS[tip.tip.riskLevel] || ''
                  } text-[10px] px-2 py-0.5`}
                >
                  <Shield className="w-2.5 h-2.5 mr-1" />
                  {tip.tip.riskLevel.replace('-', ' ')}
                </Badge>
              </div>
            </div>

            {/* Reasoning */}
            <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
              <p className="text-xs text-muted-foreground italic flex items-start gap-1.5">
                <Brain className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-violet-400" />
                &ldquo;{tip.tip.reasoning}&rdquo;
              </p>
            </div>

            <p className="text-[10px] text-slate-500 text-center mt-3">
              {tip.tip.marketsEvaluated} markets evaluated &middot; Model agreement:{' '}
              {Math.round(tip.modelAgreement * 100)}%
            </p>
          </div>

          {/* Expected Goals */}
          <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Expected Goals
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-slate-400">{data.event.homeTeam}</p>
                <p className="text-xl font-bold font-mono text-emerald-400">
                  {tip.probabilities.homeXg.toFixed(2)}
                </p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <p className="text-[10px] text-slate-500">Total xG</p>
                <p className="text-lg font-bold font-mono text-white">
                  {(tip.probabilities.homeXg + tip.probabilities.awayXg).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{data.event.awayTeam}</p>
                <p className="text-xl font-bold font-mono text-cyan-400">
                  {tip.probabilities.awayXg.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Market Probabilities Grid */}
          <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
              All Market Probabilities
            </h3>
            <div className="space-y-3">
              <ProbRow
                label={data.event.homeTeam}
                modelProb={tip.probabilities.homeWin}
                odds={data.odds?.homeWin}
              />
              <ProbRow label="Draw" modelProb={tip.probabilities.draw} odds={data.odds?.draw} />
              <ProbRow
                label={data.event.awayTeam}
                modelProb={tip.probabilities.awayWin}
                odds={data.odds?.awayWin}
              />
            </div>
            <Separator className="my-3 bg-white/[0.06]" />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">O2.5: </span>
                <span className="font-mono text-emerald-400">
                  {Math.round(tip.probabilities.over25 * 100)}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">BTTS: </span>
                <span className="font-mono text-cyan-400">
                  {Math.round(tip.probabilities.bttsYes * 100)}%
                </span>
              </div>
            </div>
          </div>
        </>
      ) : tip && !hasTip ? (
        <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-8 text-center">
          <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20 border text-xs px-3 py-1 flex items-center gap-1.5 mx-auto mb-3 w-fit">
            <X className="w-4 h-4" />
            SKIP
          </Badge>
          <p className="text-lg font-semibold text-slate-300 mb-2">No Tip for This Match</p>
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06] max-w-md mx-auto">
            <p className="text-xs text-slate-400 italic flex items-start gap-1.5">
              <Brain className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-violet-400" />
              {tip.skipReason || 'The punter walks away — no edge found'}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-8 text-center">
          <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Engine prediction not available</p>
          <p className="text-[11px] text-slate-500 mt-1">
            The engine needs standings data to generate predictions
          </p>
        </div>
      )}
    </div>
  );
}

// ── Probability Donut ───────────────────────────────────────────────

function ProbabilityDonut({
  homeWin,
  draw,
  awayWin,
  homeLabel,
  awayLabel,
}: {
  homeWin: number;
  draw: number;
  awayWin: number;
  homeLabel: string;
  awayLabel: string;
}) {
  const size = 120;
  const strokeWidth = 16;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;

  const homeArc = homeWin * circ;
  const drawArc = draw * circ;
  const awayArc = awayWin * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#10b981"
            strokeWidth={strokeWidth}
            strokeDasharray={`${homeArc} ${circ - homeArc}`}
            strokeDashoffset={0}
            strokeLinecap="butt"
            className="donut-animate"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={strokeWidth}
            strokeDasharray={`${drawArc} ${circ - drawArc}`}
            strokeDashoffset={-homeArc}
            strokeLinecap="butt"
            className="donut-animate"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#06b6d4"
            strokeWidth={strokeWidth}
            strokeDasharray={`${awayArc} ${circ - awayArc}`}
            strokeDashoffset={-(homeArc + drawArc)}
            strokeLinecap="butt"
            className="donut-animate"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-emerald-400">
            {Math.round(homeWin * 100)}%
          </span>
          <span className="text-[8px] text-muted-foreground">vs</span>
          <span className="text-xs font-bold text-cyan-400">
            {Math.round(awayWin * 100)}%
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {homeLabel}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Draw
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
          {awayLabel}
        </span>
      </div>
    </div>
  );
}

// ── Probability Row ─────────────────────────────────────────────────

function ProbRow({
  label,
  modelProb,
  odds,
}: {
  label: string;
  modelProb: number;
  odds: number | null;
}) {
  const impProb = impliedProb(odds);
  const edge = impProb !== null ? modelProb - impProb : null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-300 w-24 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-white/[0.05] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${modelProb * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${
            modelProb > 0.5
              ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
              : modelProb > 0.3
                ? 'bg-gradient-to-r from-cyan-600 to-cyan-400'
                : 'bg-slate-500'
          }`}
        />
      </div>
      <span className="text-xs font-mono w-12 text-right text-slate-300">
        {Math.round(modelProb * 100)}%
      </span>
      {edge !== null && (
        <span
          className={`text-[10px] font-mono w-12 text-right ${
            edge > 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {edge > 0 ? '+' : ''}
          {(edge * 100).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STATS TAB
// ═══════════════════════════════════════════════════════════════════════

function StatsTab({ data }: { data: MatchDetailResponse }) {
  const tip = data.enginePrediction;

  return (
    <div className="space-y-4">
      {/* Team Form */}
      {data.homeTeamStanding && data.awayTeamStanding && (
        <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            Team Form &amp; Stats
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">
                {data.event.homeTeam} (Last 5)
              </p>
              {data.homeTeamStanding.form ? (
                <div className="flex gap-0.5">
                  {data.homeTeamStanding.form
                    .slice(-5)
                    .split('')
                    .map((l, i) => (
                      <FormLetter key={i} letter={l} />
                    ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">No data</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">
                {data.event.awayTeam} (Last 5)
              </p>
              {data.awayTeamStanding.form ? (
                <div className="flex gap-0.5">
                  {data.awayTeamStanding.form
                    .slice(-5)
                    .split('')
                    .map((l, i) => (
                      <FormLetter key={i} letter={l} />
                    ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">No data</p>
              )}
            </div>
          </div>

          {/* Comparison bars */}
          <div className="space-y-3">
            <ComparisonBar
              label="Goals/match"
              homeVal={
                data.homeTeamStanding.gf / Math.max(1, data.homeTeamStanding.played)
              }
              awayVal={
                data.awayTeamStanding.ga / Math.max(1, data.awayTeamStanding.played)
              }
              homeLabel={data.event.homeTeam.slice(0, 3)}
              awayLabel={data.event.awayTeam.slice(0, 3)}
            />
            <ComparisonBar
              label="Win %"
              homeVal={
                (data.homeTeamStanding.won / Math.max(1, data.homeTeamStanding.played)) * 100
              }
              awayVal={
                (data.awayTeamStanding.won / Math.max(1, data.awayTeamStanding.played)) * 100
              }
              homeLabel={data.event.homeTeam.slice(0, 3)}
              awayLabel={data.event.awayTeam.slice(0, 3)}
              isPercent
            />
          </div>
        </div>
      )}

      {/* Live Match Stats */}
      {data.stats &&
        (isLiveStatus(data.event.status) || isFinishedStatus(data.event.status)) && (
          <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Match Statistics
            </h3>
            <div className="space-y-3">
              <StatBar
                label="Possession"
                home={data.stats.homeBallPossession}
                away={data.stats.awayBallPossession}
                suffix="%"
              />
              <StatBar
                label="Total Shots"
                home={data.stats.homeTotalShots}
                away={data.stats.awayTotalShots}
              />
              <StatBar
                label="Shots on Target"
                home={data.stats.homeShotsOnTarget}
                away={data.stats.awayShotsOnTarget}
              />
              <StatBar label="xG" home={data.stats.homeXg} away={data.stats.awayXg} isDecimal />
              <StatBar label="Corners" home={data.stats.homeCorners} away={data.stats.awayCorners} />
              <StatBar label="Fouls" home={data.stats.homeFouls} away={data.stats.awayFouls} />
              <StatBar
                label="Yellow Cards"
                home={data.stats.homeYellowCards}
                away={data.stats.awayYellowCards}
              />
              <StatBar
                label="Red Cards"
                home={data.stats.homeRedCards}
                away={data.stats.awayRedCards}
              />
            </div>
          </div>
        )}

      {/* Engine Insights */}
      {tip && (
        <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Engine Insights
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model Agreement</span>
              <span className="font-mono text-emerald-400">
                {Math.round(tip.modelAgreement * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data Quality</span>
              <span className="font-mono text-cyan-400">
                {Math.round(tip.analysis.dataQuality * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">H2H Meetings</span>
              <span className="font-mono">{tip.analysis.h2h.totalMeetings}</span>
            </div>
            {tip.analysis.h2h.note && (
              <div className="bg-white/[0.03] rounded-lg p-2 border border-white/[0.06] mt-2">
                <p className="text-[11px] text-slate-400 italic">{tip.analysis.h2h.note}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comparison Bar ──────────────────────────────────────────────────

function ComparisonBar({
  label,
  homeVal,
  awayVal,
  homeLabel,
  awayLabel,
  inverse,
  isPercent,
}: {
  label: string;
  homeVal: number;
  awayVal: number;
  homeLabel: string;
  awayLabel: string;
  inverse?: boolean;
  isPercent?: boolean;
}) {
  const total = homeVal + awayVal || 1;
  const homePct = (homeVal / total) * 100;
  const awayPct = (awayVal / total) * 100;
  const homeHigher = inverse ? awayVal > homeVal : homeVal > awayVal;
  const awayHigher = inverse ? homeVal > awayVal : awayVal > homeVal;

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className={cn('font-mono', homeHigher ? 'text-emerald-400' : 'text-slate-400')}>
          {isPercent ? homeVal.toFixed(0) : homeVal.toFixed(1)}
        </span>
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-mono', awayHigher ? 'text-cyan-400' : 'text-slate-400')}>
          {isPercent ? awayVal.toFixed(0) : awayVal.toFixed(1)}
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/[0.04]">
        <div
          className={cn(
            'h-full rounded-l-full transition-all',
            homeHigher ? 'bg-emerald-500/50' : 'bg-slate-500/30'
          )}
          style={{ width: `${homePct}%` }}
        />
        <div
          className={cn(
            'h-full rounded-r-full transition-all',
            awayHigher ? 'bg-cyan-500/50' : 'bg-slate-500/30'
          )}
          style={{ width: `${awayPct}%` }}
        />
      </div>
    </div>
  );
}

// ── Stat Bar (for live stats) ───────────────────────────────────────

function StatBar({
  label,
  home,
  away,
  suffix,
  isDecimal,
}: {
  label: string;
  home: number;
  away: number;
  suffix?: string;
  isDecimal?: boolean;
}) {
  const total = home + away || 1;
  const homePct = (home / total) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="font-mono text-slate-300">
          {isDecimal ? home.toFixed(1) : home}
          {suffix}
        </span>
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-slate-300">
          {isDecimal ? away.toFixed(1) : away}
          {suffix}
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/[0.04] gap-0.5">
        <div
          className="h-full rounded-l-full bg-emerald-500/40"
          style={{ width: `${homePct}%` }}
        />
        <div
          className="h-full rounded-r-full bg-cyan-500/40"
          style={{ width: `${100 - homePct}%` }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// H2H TAB
// ═══════════════════════════════════════════════════════════════════════

function H2HTab({ data }: { data: MatchDetailResponse }) {
  const h2h = data.h2h;

  if (h2h.length === 0) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-8 text-center">
        <Swords className="w-8 h-8 text-slate-500 mx-auto mb-3" />
        <p className="text-sm text-slate-400">No head-to-head data available</p>
      </div>
    );
  }

  // Calculate win distribution
  const homeWins = h2h.filter(
    (m) =>
      (m.homeTeamId === data.event.homeTeamId && m.homeScore > m.awayScore) ||
      (m.awayTeamId === data.event.homeTeamId && m.awayScore > m.homeScore)
  ).length;
  const draws = h2h.filter((m) => m.homeScore === m.awayScore).length;
  const awayWins = h2h.length - homeWins - draws;

  return (
    <div className="space-y-4">
      {/* Win Distribution Bar */}
      <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Swords className="w-3.5 h-3.5 text-orange-400" />
          Win Distribution (Last {h2h.length} meetings)
        </h3>
        <div className="flex h-3 rounded-full overflow-hidden bg-white/[0.04] mb-2">
          {homeWins > 0 && (
            <div
              className="h-full bg-emerald-500/50 flex items-center justify-center"
              style={{ width: `${(homeWins / h2h.length) * 100}%` }}
            >
              <span className="text-[8px] font-bold text-emerald-300">{homeWins}</span>
            </div>
          )}
          {draws > 0 && (
            <div
              className="h-full bg-amber-500/40 flex items-center justify-center"
              style={{ width: `${(draws / h2h.length) * 100}%` }}
            >
              <span className="text-[8px] font-bold text-amber-300">{draws}</span>
            </div>
          )}
          {awayWins > 0 && (
            <div
              className="h-full bg-cyan-500/50 flex items-center justify-center"
              style={{ width: `${(awayWins / h2h.length) * 100}%` }}
            >
              <span className="text-[8px] font-bold text-cyan-300">{awayWins}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-4 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {data.event.homeTeam} ({homeWins})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Draws ({draws})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500" />
            {data.event.awayTeam} ({awayWins})
          </span>
        </div>
      </div>

      {/* Meeting List */}
      <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] overflow-hidden">
        <div className="divide-y divide-white/[0.04]">
          {h2h.map((match, i) => {
            const isHome = match.homeTeamId === data.event.homeTeamId;
            const homeWon = match.homeScore > match.awayScore;
            const awayWon = match.awayScore > match.homeScore;
            const isDraw = match.homeScore === match.awayScore;

            return (
              <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[10px] text-slate-500 font-mono w-20 shrink-0">
                  {format(new Date(match.eventDate), 'dd MMM yyyy')}
                </span>
                <span
                  className={cn(
                    'text-sm truncate flex-1 text-right',
                    isHome && homeWon
                      ? 'text-emerald-300 font-semibold'
                      : isHome && awayWon
                        ? 'text-red-300/50'
                        : 'text-slate-300'
                  )}
                >
                  {match.homeTeam}
                </span>
                <span
                  className={cn(
                    'text-sm font-bold font-mono px-3 py-1 rounded-lg',
                    isDraw
                      ? 'bg-amber-500/10 text-amber-300'
                      : (isHome && homeWon) || (!isHome && awayWon)
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-red-500/10 text-red-300'
                  )}
                >
                  {match.homeScore} - {match.awayScore}
                </span>
                <span
                  className={cn(
                    'text-sm truncate flex-1',
                    !isHome && awayWon
                      ? 'text-cyan-300 font-semibold'
                      : !isHome && homeWon
                        ? 'text-red-300/50'
                        : 'text-slate-300'
                  )}
                >
                  {match.awayTeam}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STANDINGS TAB
// ═══════════════════════════════════════════════════════════════════════

function StandingsTab({ data }: { data: MatchDetailResponse }) {
  const standings = data.standings;
  const homeTeamId = data.event.homeTeamId;
  const awayTeamId = data.event.awayTeamId;

  if (standings.length === 0) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-8 text-center">
        <Trophy className="w-8 h-8 text-slate-500 mx-auto mb-3" />
        <p className="text-sm text-slate-400">No standings data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <LeagueLogo leagueId={data.event.leagueId} name={data.event.leagueName} size="sm" />
        <span className="text-xs text-slate-300 font-medium">{data.event.leagueName}</span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[2rem_1fr_2rem_2rem_2rem_2rem_2.5rem] gap-1 px-4 py-2 text-[9px] text-slate-500 uppercase tracking-wider border-b border-white/[0.04]">
        <span>#</span>
        <span>Team</span>
        <span className="text-center">P</span>
        <span className="text-center">W</span>
        <span className="text-center">D</span>
        <span className="text-center">L</span>
        <span className="text-center">Pts</span>
      </div>

      {/* Table body */}
      <div className="divide-y divide-white/[0.03] max-h-96 overflow-y-auto">
        {standings.map((team, i) => {
          const isMatchTeam = team.teamId === homeTeamId || team.teamId === awayTeamId;
          return (
            <div
              key={team.teamId}
              className={cn(
                'grid grid-cols-[2rem_1fr_2rem_2rem_2rem_2rem_2.5rem] gap-1 px-4 py-2 text-xs transition-colors',
                isMatchTeam
                  ? 'bg-emerald-500/[0.05] border-l-2 border-l-emerald-500/50'
                  : 'hover:bg-white/[0.02]'
              )}
            >
              <span className={cn('font-mono text-slate-400', isMatchTeam && 'text-emerald-400')}>
                {team.position}
              </span>
              <span
                className={cn(
                  'truncate',
                  isMatchTeam ? 'text-white font-semibold' : 'text-slate-300'
                )}
              >
                {team.teamName}
              </span>
              <span className="text-center text-slate-400 font-mono">{team.played}</span>
              <span className="text-center text-slate-400 font-mono">{team.won}</span>
              <span className="text-center text-slate-400 font-mono">{team.drawn}</span>
              <span className="text-center text-slate-400 font-mono">{team.lost}</span>
              <span
                className={cn(
                  'text-center font-bold font-mono',
                  isMatchTeam ? 'text-emerald-400' : 'text-white'
                )}
              >
                {team.pts}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LINEUPS TAB
// ═══════════════════════════════════════════════════════════════════════

function LineupsTab({ data }: { data: MatchDetailResponse }) {
  const lineup = data.lineup;

  if (!lineup || lineup.lineupStatus === 'unknown') {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-8 text-center">
        <Users className="w-8 h-8 text-slate-500 mx-auto mb-3" />
        <p className="text-sm text-slate-400">Lineups not available yet</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Lineups are usually confirmed 1-2 hours before kickoff
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Formation Display */}
      <div className="grid grid-cols-2 gap-4">
        <PitchFormation
          formation={lineup.homeFormation}
          players={lineup.homePlayers}
          teamName={data.event.homeTeam}
          isHome
        />
        <PitchFormation
          formation={lineup.awayFormation}
          players={lineup.awayPlayers}
          teamName={data.event.awayTeam}
          isHome={false}
        />
      </div>

      {/* Player Lists */}
      <div className="grid grid-cols-2 gap-4">
        <PlayerList players={lineup.homePlayers} teamName={data.event.homeTeam} />
        <PlayerList players={lineup.awayPlayers} teamName={data.event.awayTeam} />
      </div>
    </div>
  );
}

// ── Pitch Formation Display ─────────────────────────────────────────

function PitchFormation({
  formation,
  players,
  teamName,
  isHome,
}: {
  formation: string | null;
  players: any[] | null;
  teamName: string;
  isHome: boolean;
}) {
  const lines = formation ? formation.split('-').map(Number) : [4, 4, 2];
  const gk = 1;

  return (
    <div className="pitch p-3 rounded-xl">
      <p className="text-[10px] text-emerald-400 font-medium mb-2 text-center">
        {teamName} ({formation || '4-4-2'})
      </p>
      <div
        className="flex flex-col items-center gap-2 py-2"
        style={{ minHeight: '140px' }}
      >
        {/* Goalkeeper */}
        <div className="flex justify-center">
          <PlayerDot
            name={players?.[0]?.playerName || 'GK'}
            isHome={isHome}
          />
        </div>
        {/* Outfield lines */}
        {lines.map((count, lineIdx) => (
          <div key={lineIdx} className="flex justify-center gap-1">
            {Array.from({ length: count }).map((_, pIdx) => {
              const playerIdx =
                gk + lines.slice(0, lineIdx).reduce((a, b) => a + b, 0) + pIdx;
              const playerName =
                players?.[playerIdx]?.playerName || `P${playerIdx + 1}`;
              return (
                <PlayerDot
                  key={pIdx}
                  name={playerName.split(' ').pop() || playerName}
                  isHome={isHome}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerDot({ name, isHome }: { name: string; isHome: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold',
          isHome
            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
            : 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
        )}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
      <span className="text-[7px] text-muted-foreground mt-0.5 max-w-[40px] truncate text-center">
        {name}
      </span>
    </div>
  );
}

// ── Player List ─────────────────────────────────────────────────────

function PlayerList({
  players,
  teamName,
}: {
  players: any[] | null;
  teamName: string;
}) {
  if (!players || players.length === 0) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] p-4">
        <p className="text-xs text-muted-foreground text-center">No player data</p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-white/[0.06] bg-[#0d1117] overflow-hidden">
      <div className="px-4 py-2 border-b border-white/[0.06]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {teamName}
        </p>
      </div>
      <div className="divide-y divide-white/[0.03] max-h-64 overflow-y-auto">
        {players.map((player: any, i: number) => (
          <div
            key={i}
            className="px-4 py-2 flex items-center gap-2 text-xs hover:bg-white/[0.02]"
          >
            <span className="text-slate-500 font-mono w-5 text-right">
              {player.shirtNumber || i + 1}
            </span>
            <span className="text-slate-300 truncate">{player.playerName || `Player ${i + 1}`}</span>
            {player.position && (
              <span className="ml-auto text-[9px] text-slate-500">{player.position}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MATCH CENTER SKELETON
// ═══════════════════════════════════════════════════════════════════════

function MatchCenterSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton */}
      <div className="rounded-[24px] border border-white/[0.06] bg-[#0d1117] p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-16 rounded-full glass-skeleton" />
          <Skeleton className="h-5 w-20 glass-skeleton" />
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-12 w-12 rounded-full glass-skeleton" />
            <Skeleton className="h-4 w-24 glass-skeleton" />
          </div>
          <Skeleton className="h-12 w-24 glass-skeleton" />
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-12 w-12 rounded-full glass-skeleton" />
            <Skeleton className="h-4 w-24 glass-skeleton" />
          </div>
        </div>
      </div>

      {/* Tab skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 glass-skeleton" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-[20px] glass-skeleton" />
        <Skeleton className="h-32 w-full rounded-[20px] glass-skeleton" />
      </div>
    </div>
  );
}
