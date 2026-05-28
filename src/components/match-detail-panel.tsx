'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  X, Clock, MapPin, Thermometer, Wind, Users, Brain,
  Target, Shield, Crosshair, Flame, TrendingUp,
  CheckCircle2, AlertTriangle, Zap, Radio, Trophy,
  Swords, BarChart3, DollarSign, Eye, ChevronRight,
  ArrowUp, ArrowDown, Minus, User, Timer,
} from 'lucide-react';
import { format } from 'date-fns';
import type { PunterTipV4Data, TipQuality } from '@/lib/types';

// ── API Response Type ──────────────────────────────────────────────────

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
    travelDistanceKm: number;
    weatherCode: number | null;
    weatherDescription: string | null;
    weatherWindSpeed: number | null;
    weatherTemperatureC: number | null;
    venue: { name: string; city: string; capacity: number | null } | null;
    attendance: number | null;
  };
  odds: {
    homeWin: number | null;
    draw: number | null;
    awayWin: number | null;
    over15: number | null;
    over25: number | null;
    over35: number | null;
    under15: number | null;
    under25: number | null;
    under35: number | null;
    bttsYes: number | null;
    bttsNo: number | null;
    doubleChance1x: number | null;
    doubleChance12: number | null;
    doubleChanceX2: number | null;
    drawNoBetHome: number | null;
    drawNoBetAway: number | null;
  } | null;
  lineup: {
    lineupStatus: string;
    homeFormation: string | null;
    awayFormation: string | null;
    homeConfidence: number | null;
    awayConfidence: number | null;
    homePlayers: any[] | null;
    awayPlayers: any[] | null;
    homeUnavailable: any[] | null;
    awayUnavailable: any[] | null;
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
    homePassAccuracy: number;
    awayPassAccuracy: number;
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
    xgf: number | null;
    xga: number | null;
    xgd: number | null;
    xgGames: number | null;
    form: string | null;
    isLive: boolean;
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
    gd: number;
    pts: number;
    xgf: number | null;
    xga: number | null;
    xgd: number | null;
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
    gd: number;
    pts: number;
    xgf: number | null;
    xga: number | null;
    xgd: number | null;
    form: string | null;
  } | null;
  homeManager: {
    id: number;
    name: string;
    tacticalProfile: string | null;
    preferredFormation: string | null;
    winPct: number;
    avgGoalsScored: number;
    avgGoalsConceded: number;
    avgPossession: number;
    cleanSheetPct: number;
    bttsPct: number;
    over25Pct: number;
  } | null;
  awayManager: {
    id: number;
    name: string;
    tacticalProfile: string | null;
    preferredFormation: string | null;
    winPct: number;
    avgGoalsScored: number;
    avgGoalsConceded: number;
    avgPossession: number;
    cleanSheetPct: number;
    bttsPct: number;
    over25Pct: number;
  } | null;
  referee: {
    id: number;
    name: string;
    country: string | null;
    avgYellowPerMatch: number;
    avgRedPerMatch: number;
    avgGoalsPerMatch: number;
    avgFoulsPerMatch: number;
    careerGames: number;
  } | null;
  polymarket: {
    homeWinPrice: number | null;
    drawPrice: number | null;
    awayWinPrice: number | null;
    over25Price: number | null;
    under25Price: number | null;
    bttsYesPrice: number | null;
  } | null;
  oddsMovement: Array<{
    market: string;
    outcome: string;
    bookmakerName: string | null;
    decimalOdds: number;
    previousDecimalOdds: number | null;
    movement: string | null;
    isMaxQuote: boolean;
  }>;
  incidents: Array<{
    incidentType: string;
    minute: number | null;
    playerName: string | null;
    isHome: boolean;
    cardType: string | null;
    playerIn: string | null;
    playerOut: string | null;
  }>;
  metadata: {
    funfacts: any;
    aiPreview: string | null;
  } | null;
  enginePrediction: PunterTipV4Data | null;
}

// ── Quality Config ─────────────────────────────────────────────────────

const QUALITY_CONFIG: Record<TipQuality, {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
}> = {
  gold: {
    icon: <Flame className="w-5 h-5" />,
    label: 'GOLD',
    color: 'text-amber-300',
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/40',
    glow: 'shadow-amber-500/20',
  },
  silver: {
    icon: <Crosshair className="w-5 h-5" />,
    label: 'SILVER',
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/15',
    border: 'border-cyan-500/30',
    glow: 'shadow-cyan-500/10',
  },
  bronze: {
    icon: <TrendingUp className="w-5 h-5" />,
    label: 'BRONZE',
    color: 'text-slate-300',
    bg: 'bg-slate-500/15',
    border: 'border-slate-500/30',
    glow: '',
  },
  skip: {
    icon: <X className="w-5 h-5" />,
    label: 'SKIP',
    color: 'text-slate-500',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    glow: '',
  },
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

// ── Tab Definitions ────────────────────────────────────────────────────

type TabId = 'prediction' | 'stats' | 'standings' | 'lineups' | 'odds' | 'analysis';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'prediction', label: 'Prediction', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'standings', label: 'Standings', icon: <Trophy className="w-3.5 h-3.5" /> },
  { id: 'lineups', label: 'Lineups', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'odds', label: 'Odds', icon: <DollarSign className="w-3.5 h-3.5" /> },
  { id: 'analysis', label: 'Analysis', icon: <Brain className="w-3.5 h-3.5" /> },
];

// ── Helper: Implied Probability ────────────────────────────────────────

function impliedProb(odds: number | null): number | null {
  if (!odds || odds <= 0) return null;
  return 1 / odds;
}

// ── Form Letter ────────────────────────────────────────────────────────

function FormLetter({ letter }: { letter: string }) {
  const colors: Record<string, string> = {
    W: 'bg-emerald-500/30 text-emerald-300',
    D: 'bg-amber-500/30 text-amber-300',
    L: 'bg-red-500/30 text-red-300',
  };
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${colors[letter] || 'bg-slate-500/20 text-slate-400'}`}>
      {letter}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN: Match Detail Panel
// ═══════════════════════════════════════════════════════════════════════

export function MatchDetailPanel() {
  const { selectedMatchId, isMatchPanelOpen, closeMatchPanel } = useAppStore();
  // Reset tab state when match changes by using selectedMatchId as key source
  const [activeTab, setActiveTab] = useState<TabId>('prediction');
  const [prevMatchId, setPrevMatchId] = useState<number | null>(null);
  if (selectedMatchId !== prevMatchId) {
    setPrevMatchId(selectedMatchId);
    if (selectedMatchId !== null) setActiveTab('prediction');
  }

  const { data, isLoading } = useQuery<MatchDetailResponse>({
    queryKey: ['match-detail', selectedMatchId],
    queryFn: () => fetch(`/api/match/${selectedMatchId}`).then(r => {
      if (!r.ok) throw new Error('Failed to fetch match');
      return r.json();
    }),
    enabled: !!selectedMatchId && isMatchPanelOpen,
    staleTime: 30000,
  });

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMatchPanel();
    };
    if (isMatchPanelOpen) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [isMatchPanelOpen, closeMatchPanel]);

  const isLive = data?.event.status === 'in' || data?.event.status === 'live';
  const isFinished = data?.event.status === 'finished';
  const showScores = isLive || isFinished;

  return (
    <AnimatePresence>
      {isMatchPanelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={closeMatchPanel}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 z-50 h-full w-full md:w-[70%] lg:w-[55%] bg-[#0d1117] border-l border-white/[0.06] flex flex-col overflow-hidden"
          >
            {/* ── HEADER ──────────────────────────────────────────── */}
            <div className="flex-shrink-0 border-b border-white/[0.06] bg-[#0d1117]">
              {/* Close button */}
              <div className="flex items-center justify-between px-4 pt-3">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{data?.event.leagueName || 'Match Details'}</span>
                  {data?.event.leagueCountry && (
                    <>
                      <span className="text-white/20">·</span>
                      <span>{data.event.leagueCountry}</span>
                    </>
                  )}
                  {data?.event.roundNumber && (
                    <>
                      <span className="text-white/20">·</span>
                      <span>Round {data.event.roundNumber}</span>
                    </>
                  )}
                </div>
                <button
                  onClick={closeMatchPanel}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Teams & Score */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold truncate">{data?.event.homeTeam || 'Home'}</p>
                    {data?.homeTeamStanding && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {data.homeTeamStanding.position}{getOrdinal(data.homeTeamStanding.position)} · {data.homeTeamStanding.pts} pts
                        {data.homeTeamStanding.form && (
                          <span className="ml-2 inline-flex gap-0.5">
                            {data.homeTeamStanding.form.slice(-5).split('').map((l, i) => (
                              <FormLetter key={i} letter={l} />
                            ))}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0 mx-4 text-center">
                    {showScores ? (
                      <div className="flex items-center gap-3">
                        <span className={`text-3xl font-mono font-bold ${isLive ? 'text-emerald-400' : 'text-white'}`}>
                          {data?.event.homeScore ?? 0}
                        </span>
                        <div className="flex flex-col items-center">
                          {isLive && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 py-0 mb-1 animate-pulse">
                              <Radio className="w-2.5 h-2.5 mr-1" />
                              {data?.event.currentMinute ? `${data.event.currentMinute}'` : 'LIVE'}
                            </Badge>
                          )}
                          {isFinished && (
                            <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-[9px] px-1.5 py-0 mb-1">
                              FT
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {data?.event.homeScoreHt != null && data?.event.awayScoreHt != null
                              ? `HT ${data.event.homeScoreHt}-${data.event.awayScoreHt}`
                              : format(new Date(data?.event.eventDate || new Date()), 'HH:mm')
                            }
                          </span>
                        </div>
                        <span className={`text-3xl font-mono font-bold ${isLive ? 'text-emerald-400' : 'text-white'}`}>
                          {data?.event.awayScore ?? 0}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {format(new Date(data?.event.eventDate || new Date()), 'HH:mm')}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(data?.event.eventDate || new Date()), 'EEE, d MMM')}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-lg font-bold truncate">{data?.event.awayTeam || 'Away'}</p>
                    {data?.awayTeamStanding && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {data.awayTeamStanding.position}{getOrdinal(data.awayTeamStanding.position)} · {data.awayTeamStanding.pts} pts
                        {data.awayTeamStanding.form && (
                          <span className="ml-2 inline-flex gap-0.5">
                            {data.awayTeamStanding.form.slice(-5).split('').map((l, i) => (
                              <FormLetter key={i} letter={l} />
                            ))}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Match Info Badges */}
                {data && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {data.event.isLocalDerby && (
                      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[9px] px-1.5 py-0">
                        <Swords className="w-2.5 h-2.5 mr-1" />Derby
                      </Badge>
                    )}
                    {data.event.weatherDescription && (
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] px-1.5 py-0">
                        <Thermometer className="w-2.5 h-2.5 mr-1" />{data.event.weatherDescription}
                      </Badge>
                    )}
                    {data.event.venue && (
                      <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[9px] px-1.5 py-0">
                        <MapPin className="w-2.5 h-2.5 mr-1" />{data.event.venue.name}
                      </Badge>
                    )}
                    {data.referee && (
                      <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[9px] px-1.5 py-0">
                        <User className="w-2.5 h-2.5 mr-1" />{data.referee.name}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Tab Navigation */}
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex px-2 pb-0 gap-0.5">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-t-lg transition-all whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-white/[0.06] text-emerald-400 border-b-2 border-emerald-400'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* ── TAB CONTENT ─────────────────────────────────────── */}
            <div className="flex-1 overflow-hidden">
              {isLoading ? (
                <LoadingSkeleton />
              ) : !data ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>No data available</p>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
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
                        {activeTab === 'standings' && <StandingsTab data={data} />}
                        {activeTab === 'lineups' && <LineupsTab data={data} />}
                        {activeTab === 'odds' && <OddsTab data={data} />}
                        {activeTab === 'analysis' && <AnalysisTab data={data} />}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </ScrollArea>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Need useState and useEffect ────────────────────────────────────────
import { useState, useEffect } from 'react';

// ── Ordinal helper ─────────────────────────────────────────────────────

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── Loading Skeleton ───────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-32 w-full rounded-xl bg-white/5" />
      <Skeleton className="h-20 w-full rounded-xl bg-white/5" />
      <Skeleton className="h-40 w-full rounded-xl bg-white/5" />
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
      {/* Engine Prediction */}
      {tip ? (
        <>
          {hasTip && tip.tip ? (
            <Card className={`glass-card p-5 ${config.glow} border ${config.border}`}>
              {/* Quality Badge */}
              <div className="flex items-center justify-between mb-4">
                <Badge className={`${config.bg} ${config.color} ${config.border} border text-xs px-3 py-1 flex items-center gap-1.5`}>
                  {config.icon}
                  {config.label} TIP
                </Badge>
                <div className="flex items-center gap-1.5">
                  {tip.tip.isSafePlay && (
                    <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px] px-1.5 py-0 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />Safe Play
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
              <div className="text-center mb-4">
                <p className="text-2xl font-bold text-white">{tip.tip.selection}</p>
                <p className="text-sm text-muted-foreground mt-1">{tip.tip.market}</p>
                {tip.tip.odds && (
                  <p className="text-3xl font-mono font-bold text-emerald-400 mt-2">
                    {tip.tip.odds.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Edge & Kelly */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Edge</p>
                  <p className="text-lg font-bold text-emerald-400">+{(tip.tip.edge * 100).toFixed(1)}%</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kelly</p>
                  <p className="text-lg font-bold text-cyan-400">{(tip.tip.kellyStake * 100).toFixed(1)}%</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk</p>
                  <Badge className={`${RISK_BG[tip.tip.riskLevel]} ${RISK_COLORS[tip.tip.riskLevel]} text-[10px] px-2 py-0.5`}>
                    <Shield className="w-2.5 h-2.5 mr-1" />
                    {tip.tip.riskLevel.replace('-', ' ')}
                  </Badge>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                <p className="text-xs text-muted-foreground italic flex items-start gap-1.5">
                  <Brain className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-violet-400" />
                  &ldquo;{tip.tip.reasoning}&rdquo;
                </p>
              </div>

              {/* Markets Evaluated */}
              <p className="text-[10px] text-slate-500 text-center mt-3">
                {tip.tip.marketsEvaluated} markets evaluated · Model agreement: {Math.round(tip.modelAgreement * 100)}%
              </p>
            </Card>
          ) : (
            /* SKIP Card */
            <Card className="glass-card p-5">
              <div className="text-center">
                <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20 border text-xs px-3 py-1 flex items-center gap-1.5 mx-auto mb-3">
                  <X className="w-4 h-4" />
                  SKIP
                </Badge>
                <p className="text-lg font-semibold text-slate-300 mb-2">No Tip for This Match</p>
                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06] max-w-md mx-auto">
                  <p className="text-xs text-slate-400 italic flex items-start gap-1.5">
                    <Brain className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-violet-400" />
                    {tip.skipReason || 'The punter walks away — no edge found'}
                  </p>
                </div>
                <p className="text-[10px] text-slate-500 mt-3">
                  Model agreement: {Math.round(tip.modelAgreement * 100)}%
                </p>
              </div>
            </Card>
          )}

          {/* Probability Summary */}
          <Card className="glass-card p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
              Model Probabilities
            </h3>
            <div className="space-y-2">
              <ProbRow label={data.event.homeTeam} modelProb={tip.probabilities.homeWin} odds={data.odds?.homeWin} />
              <ProbRow label="Draw" modelProb={tip.probabilities.draw} odds={data.odds?.draw} />
              <ProbRow label={data.event.awayTeam} modelProb={tip.probabilities.awayWin} odds={data.odds?.awayWin} />
            </div>
            <Separator className="my-3 bg-white/[0.06]" />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">xG: </span>
                <span className="font-mono">{tip.probabilities.homeXg.toFixed(2)}</span>
                <span className="text-muted-foreground"> - </span>
                <span className="font-mono">{tip.probabilities.awayXg.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">O2.5: </span>
                <span className="font-mono">{Math.round(tip.probabilities.over25 * 100)}%</span>
                <span className="text-muted-foreground ml-2">BTTS: </span>
                <span className="font-mono">{Math.round(tip.probabilities.bttsYes * 100)}%</span>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <Card className="glass-card p-5 text-center">
          <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Engine prediction not available</p>
          <p className="text-[11px] text-slate-500 mt-1">The engine needs standings data to generate predictions</p>
        </Card>
      )}
    </div>
  );
}

function ProbRow({ label, modelProb, odds }: { label: string; modelProb: number; odds: number | null }) {
  const impProb = impliedProb(odds);
  const edge = impProb !== null ? modelProb - impProb : null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-300 w-24 truncate">{label}</span>
      <div className="flex-1 h-2 bg-white/[0.05] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${modelProb * 100}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full rounded-full ${modelProb > 0.5 ? 'bg-emerald-500' : modelProb > 0.3 ? 'bg-cyan-500' : 'bg-slate-500'}`}
        />
      </div>
      <span className="text-xs font-mono w-12 text-right text-slate-300">{Math.round(modelProb * 100)}%</span>
      {edge !== null && (
        <span className={`text-[10px] font-mono w-12 text-right ${edge > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {edge > 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
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

  // H2H Summary
  let h2hHomeWins = 0, h2hDraws = 0, h2hAwayWins = 0, h2hGoals = 0, h2hOver25 = 0, h2hBtts = 0;
  for (const m of data.h2h) {
    const isHome = m.homeTeamId === data.event.homeTeamId;
    if (m.homeScore > m.awayScore) { if (isHome) h2hHomeWins++; else h2hAwayWins++; }
    else if (m.homeScore < m.awayScore) { if (isHome) h2hAwayWins++; else h2hHomeWins++; }
    else { h2hDraws++; }
    h2hGoals += m.homeScore + m.awayScore;
    if (m.homeScore + m.awayScore > 2) h2hOver25++;
    if (m.homeScore > 0 && m.awayScore > 0) h2hBtts++;
  }
  const h2hTotal = data.h2h.length;

  return (
    <div className="space-y-4">
      {/* H2H */}
      <Card className="glass-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Swords className="w-3.5 h-3.5 text-cyan-400" />
          Head to Head
        </h3>
        {h2hTotal > 0 ? (
          <>
            {/* W/D/L Bar */}
            <div className="flex h-6 rounded-full overflow-hidden mb-3">
              <div className="bg-emerald-500/60 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(h2hHomeWins / h2hTotal) * 100}%` }}>
                {h2hHomeWins > 0 && h2hHomeWins}
              </div>
              <div className="bg-amber-500/40 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(h2hDraws / h2hTotal) * 100}%` }}>
                {h2hDraws > 0 && h2hDraws}
              </div>
              <div className="bg-red-500/60 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(h2hAwayWins / h2hTotal) * 100}%` }}>
                {h2hAwayWins > 0 && h2hAwayWins}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-3">
              <span className="text-emerald-400">{data.event.homeTeam} {h2hHomeWins}W</span>
              <span>{h2hDraws}D</span>
              <span className="text-red-400">{h2hAwayWins}W {data.event.awayTeam}</span>
            </div>
            <div className="flex gap-4 text-[11px]">
              <span className="text-slate-300">Avg goals: <span className="text-white font-mono">{h2hTotal > 0 ? (h2hGoals / h2hTotal).toFixed(1) : '-'}</span></span>
              <span className="text-slate-300">O2.5: <span className="text-amber-400 font-mono">{h2hTotal > 0 ? Math.round((h2hOver25 / h2hTotal) * 100) : '-'}%</span></span>
              <span className="text-slate-300">BTTS: <span className="text-cyan-400 font-mono">{h2hTotal > 0 ? Math.round((h2hBtts / h2hTotal) * 100) : '-'}%</span></span>
            </div>

            {/* H2H Matches List */}
            <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
              {data.h2h.slice(0, 8).map((m, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-white/[0.02]">
                  <span className="text-muted-foreground w-16">{format(new Date(m.eventDate), 'MMM yyyy')}</span>
                  <span className="flex-1 text-right truncate pr-2">{m.homeTeam}</span>
                  <span className="font-mono font-bold text-white px-2">{m.homeScore} - {m.awayScore}</span>
                  <span className="flex-1 truncate pl-2">{m.awayTeam}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">No previous meetings found</p>
        )}
      </Card>

      {/* Team Comparison */}
      {data.homeTeamStanding && data.awayTeamStanding && (
        <Card className="glass-card p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            Team Comparison
          </h3>
          <div className="space-y-3">
            <ComparisonBar
              label="Goals/match"
              homeVal={data.homeTeamStanding.gf / Math.max(1, data.homeTeamStanding.played)}
              awayVal={data.awayTeamStanding.gf / Math.max(1, data.awayTeamStanding.played)}
              homeLabel={data.event.homeTeam.slice(0, 3)}
              awayLabel={data.event.awayTeam.slice(0, 3)}
            />
            <ComparisonBar
              label="Conceded/match"
              homeVal={data.homeTeamStanding.ga / Math.max(1, data.homeTeamStanding.played)}
              awayVal={data.awayTeamStanding.ga / Math.max(1, data.awayTeamStanding.played)}
              homeLabel={data.event.homeTeam.slice(0, 3)}
              awayLabel={data.event.awayTeam.slice(0, 3)}
              inverse
            />
            {data.homeTeamStanding.xgf && data.awayTeamStanding.xgf && (
              <ComparisonBar
                label="xG/match"
                homeVal={data.homeTeamStanding.xgf / Math.max(1, data.homeTeamStanding.played)}
                awayVal={data.awayTeamStanding.xgf / Math.max(1, data.awayTeamStanding.played)}
                homeLabel={data.event.homeTeam.slice(0, 3)}
                awayLabel={data.event.awayTeam.slice(0, 3)}
              />
            )}
            <ComparisonBar
              label="Win %"
              homeVal={data.homeTeamStanding.won / Math.max(1, data.homeTeamStanding.played) * 100}
              awayVal={data.awayTeamStanding.won / Math.max(1, data.awayTeamStanding.played) * 100}
              homeLabel={data.event.homeTeam.slice(0, 3)}
              awayLabel={data.event.awayTeam.slice(0, 3)}
              isPercent
            />
          </div>

          {/* Form */}
          <Separator className="my-3 bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">{data.event.homeTeam} Form</p>
              {data.homeTeamStanding.form ? (
                <div className="flex gap-0.5">
                  {data.homeTeamStanding.form.slice(-5).split('').map((l, i) => (
                    <FormLetter key={i} letter={l} />
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">No data</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">{data.event.awayTeam} Form</p>
              {data.awayTeamStanding.form ? (
                <div className="flex gap-0.5">
                  {data.awayTeamStanding.form.slice(-5).split('').map((l, i) => (
                    <FormLetter key={i} letter={l} />
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">No data</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Live Match Stats */}
      {data.stats && (data.event.status === 'in' || data.event.status === 'finished' || data.event.status === 'live') && (
        <Card className="glass-card p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            Match Statistics
          </h3>
          <div className="space-y-3">
            <StatBar label="Possession" home={data.stats.homeBallPossession} away={data.stats.awayBallPossession} suffix="%" />
            <StatBar label="Total Shots" home={data.stats.homeTotalShots} away={data.stats.awayTotalShots} />
            <StatBar label="Shots on Target" home={data.stats.homeShotsOnTarget} away={data.stats.awayShotsOnTarget} />
            <StatBar label="xG" home={data.stats.homeXg} away={data.stats.awayXg} isDecimal />
            <StatBar label="Corners" home={data.stats.homeCorners} away={data.stats.awayCorners} />
            <StatBar label="Fouls" home={data.stats.homeFouls} away={data.stats.awayFouls} />
            <StatBar label="Yellow Cards" home={data.stats.homeYellowCards} away={data.stats.awayYellowCards} />
            <StatBar label="Red Cards" home={data.stats.homeRedCards} away={data.stats.awayRedCards} />
            <StatBar label="Pass Accuracy" home={data.stats.homePassAccuracy} away={data.stats.awayPassAccuracy} suffix="%" />
          </div>
        </Card>
      )}

      {/* Engine Stats */}
      {tip && (
        <Card className="glass-card p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Engine Insights
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model Agreement</span>
              <span className="font-mono text-emerald-400">{Math.round(tip.modelAgreement * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data Quality</span>
              <span className="font-mono text-cyan-400">{Math.round(tip.analysis.dataQuality * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">H2H Meetings</span>
              <span className="font-mono">{tip.analysis.h2h.totalMeetings}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">H2H Avg Goals</span>
              <span className="font-mono">{tip.analysis.h2h.avgGoals}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function ComparisonBar({ label, homeVal, awayVal, homeLabel, awayLabel, inverse, isPercent }: {
  label: string;
  homeVal: number;
  awayVal: number;
  homeLabel: string;
  awayLabel: string;
  inverse?: boolean;
  isPercent?: boolean;
}) {
  const total = homeVal + awayVal;
  const homePct = total > 0 ? (homeVal / total) * 100 : 50;
  const homeBetter = inverse ? awayVal > homeVal : homeVal > awayVal;

  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span className={homeBetter ? 'text-emerald-400 font-medium' : ''}>{homeVal.toFixed(isPercent ? 0 : 2)}{isPercent ? '%' : ''}</span>
        <span>{label}</span>
        <span className={!homeBetter ? 'text-emerald-400 font-medium' : ''}>{awayVal.toFixed(isPercent ? 0 : 2)}{isPercent ? '%' : ''}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
        <div className={`rounded-l-full ${homeBetter ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: `${homePct}%` }} />
        <div className={`rounded-r-full ${!homeBetter ? 'bg-emerald-500' : 'bg-slate-600'}`} style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

function StatBar({ label, home, away, suffix, isDecimal }: {
  label: string;
  home: number;
  away: number;
  suffix?: string;
  isDecimal?: boolean;
}) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;

  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-mono text-slate-200 w-10 text-right">{isDecimal ? home.toFixed(2) : home}{suffix || ''}</span>
        <span className="text-muted-foreground text-[10px]">{label}</span>
        <span className="font-mono text-slate-200 w-10">{isDecimal ? away.toFixed(2) : away}{suffix || ''}</span>
      </div>
      <div className="flex h-1 rounded-full overflow-hidden gap-0.5">
        <div className="bg-cyan-500/70 rounded-l-full" style={{ width: `${homePct}%` }} />
        <div className="bg-emerald-500/70 rounded-r-full" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STANDINGS TAB
// ═══════════════════════════════════════════════════════════════════════

function StandingsTab({ data }: { data: MatchDetailResponse }) {
  if (data.standings.length === 0) {
    return (
      <Card className="glass-card p-6 text-center">
        <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No standings data available</p>
      </Card>
    );
  }

  return (
    <Card className="glass-card p-4 overflow-hidden">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5 text-amber-400" />
        {data.event.leagueName} Standings
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted-foreground border-b border-white/[0.06]">
              <th className="text-left py-2 pr-2 w-6">#</th>
              <th className="text-left py-2 pr-2">Team</th>
              <th className="text-center py-2 px-1">P</th>
              <th className="text-center py-2 px-1">W</th>
              <th className="text-center py-2 px-1">D</th>
              <th className="text-center py-2 px-1">L</th>
              <th className="text-center py-2 px-1">GF</th>
              <th className="text-center py-2 px-1">GA</th>
              <th className="text-center py-2 px-1">GD</th>
              <th className="text-center py-2 px-1">Pts</th>
              <th className="text-center py-2 px-1">xGD</th>
              <th className="text-center py-2 pl-2">Form</th>
            </tr>
          </thead>
          <tbody>
            {data.standings.map((team) => {
              const isMatchTeam = team.teamId === data.event.homeTeamId || team.teamId === data.event.awayTeamId;
              return (
                <tr
                  key={team.teamId}
                  className={`border-b border-white/[0.03] ${
                    isMatchTeam ? 'bg-emerald-500/[0.06]' : ''
                  }`}
                >
                  <td className={`py-1.5 pr-2 ${isMatchTeam ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}`}>
                    {team.position}
                  </td>
                  <td className={`py-1.5 pr-2 truncate max-w-[120px] ${isMatchTeam ? 'text-emerald-300 font-medium' : ''}`}>
                    {team.teamName}
                  </td>
                  <td className="text-center py-1.5 px-1 text-muted-foreground">{team.played}</td>
                  <td className="text-center py-1.5 px-1">{team.won}</td>
                  <td className="text-center py-1.5 px-1 text-muted-foreground">{team.drawn}</td>
                  <td className="text-center py-1.5 px-1 text-muted-foreground">{team.lost}</td>
                  <td className="text-center py-1.5 px-1">{team.gf}</td>
                  <td className="text-center py-1.5 px-1 text-muted-foreground">{team.ga}</td>
                  <td className={`text-center py-1.5 px-1 ${team.gd > 0 ? 'text-emerald-400' : team.gd < 0 ? 'text-red-400' : ''}`}>
                    {team.gd > 0 ? '+' : ''}{team.gd}
                  </td>
                  <td className={`text-center py-1.5 px-1 font-bold ${isMatchTeam ? 'text-emerald-400' : 'text-white'}`}>
                    {team.pts}
                  </td>
                  <td className={`text-center py-1.5 px-1 text-[10px] ${team.xgd != null && team.xgd > 0 ? 'text-cyan-400' : team.xgd != null && team.xgd < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {team.xgd != null ? `${team.xgd > 0 ? '+' : ''}${team.xgd.toFixed(1)}` : '-'}
                  </td>
                  <td className="text-center py-1.5 pl-2">
                    {team.form ? (
                      <span className="inline-flex gap-px">
                        {team.form.slice(-5).split('').map((l, i) => (
                          <FormLetter key={i} letter={l} />
                        ))}
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LINEUPS TAB
// ═══════════════════════════════════════════════════════════════════════

function LineupsTab({ data }: { data: MatchDetailResponse }) {
  if (!data.lineup || data.lineup.lineupStatus === 'unavailable') {
    return (
      <Card className="glass-card p-6 text-center">
        <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Lineups not yet confirmed</p>
        <p className="text-[11px] text-slate-500 mt-1">Check back closer to kickoff</p>
      </Card>
    );
  }

  const lineup = data.lineup;

  return (
    <div className="space-y-4">
      {/* Formation */}
      <Card className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-center flex-1">
            <p className="text-2xl font-bold font-mono text-cyan-400">{lineup.homeFormation || '?'}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{data.event.homeTeam}</p>
            {lineup.homeConfidence != null && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Confidence: <span className="text-emerald-400">{Math.round(lineup.homeConfidence * 100)}%</span>
              </p>
            )}
          </div>
          <div className="text-center px-4">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">vs</span>
          </div>
          <div className="text-center flex-1">
            <p className="text-2xl font-bold font-mono text-emerald-400">{lineup.awayFormation || '?'}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{data.event.awayTeam}</p>
            {lineup.awayConfidence != null && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Confidence: <span className="text-emerald-400">{Math.round(lineup.awayConfidence * 100)}%</span>
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Players Lists */}
      <div className="grid grid-cols-2 gap-3">
        {/* Home Players */}
        <Card className="glass-card p-3">
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{data.event.homeTeam}</h4>
          {lineup.homePlayers && Array.isArray(lineup.homePlayers) && lineup.homePlayers.length > 0 ? (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {lineup.homePlayers.map((player: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                  <span className="font-mono text-muted-foreground w-5 text-right">{player.jerseyNumber || player.number || ''}</span>
                  <span className="text-slate-200 truncate">{player.name || player.playerName || ''}</span>
                  <span className="text-[9px] text-slate-500 ml-auto">{player.position || player.pos || ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500">Players not available</p>
          )}
        </Card>

        {/* Away Players */}
        <Card className="glass-card p-3">
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{data.event.awayTeam}</h4>
          {lineup.awayPlayers && Array.isArray(lineup.awayPlayers) && lineup.awayPlayers.length > 0 ? (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {lineup.awayPlayers.map((player: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                  <span className="font-mono text-muted-foreground w-5 text-right">{player.jerseyNumber || player.number || ''}</span>
                  <span className="text-slate-200 truncate">{player.name || player.playerName || ''}</span>
                  <span className="text-[9px] text-slate-500 ml-auto">{player.position || player.pos || ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500">Players not available</p>
          )}
        </Card>
      </div>

      {/* Unavailable Players */}
      {(lineup.homeUnavailable?.length > 0 || lineup.awayUnavailable?.length > 0) && (
        <Card className="glass-card p-4">
          <h4 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Unavailable
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {lineup.homeUnavailable && lineup.homeUnavailable.length > 0 ? (
                <div className="space-y-1">
                  {lineup.homeUnavailable.map((p: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-300">
                      {p.name || p.playerName || 'Unknown'}
                      {p.reason && <span className="text-slate-500 ml-1">({p.reason})</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">No absences</p>
              )}
            </div>
            <div>
              {lineup.awayUnavailable && lineup.awayUnavailable.length > 0 ? (
                <div className="space-y-1">
                  {lineup.awayUnavailable.map((p: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-300">
                      {p.name || p.playerName || 'Unknown'}
                      {p.reason && <span className="text-slate-500 ml-1">({p.reason})</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">No absences</p>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ODDS TAB
// ═══════════════════════════════════════════════════════════════════════

function OddsTab({ data }: { data: MatchDetailResponse }) {
  const tip = data.enginePrediction;
  const modelProbs = tip ? {
    homeWin: tip.probabilities.homeWin,
    draw: tip.probabilities.draw,
    awayWin: tip.probabilities.awayWin,
    over25: tip.probabilities.over25,
    bttsYes: tip.probabilities.bttsYes,
  } : null;

  return (
    <div className="space-y-4">
      {!data.odds ? (
        <Card className="glass-card p-6 text-center">
          <DollarSign className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No odds data available</p>
        </Card>
      ) : (
        <>
          {/* 1X2 */}
          <Card className="glass-card p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              1X2 Odds
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <OddsCell
                label={data.event.homeTeam.slice(0, 3).toUpperCase()}
                odds={data.odds.homeWin}
                modelProb={modelProbs?.homeWin}
              />
              <OddsCell
                label="DRAW"
                odds={data.odds.draw}
                modelProb={modelProbs?.draw}
              />
              <OddsCell
                label={data.event.awayTeam.slice(0, 3).toUpperCase()}
                odds={data.odds.awayWin}
                modelProb={modelProbs?.awayWin}
              />
            </div>
          </Card>

          {/* Over/Under */}
          <Card className="glass-card p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Over / Under
            </h3>
            <div className="space-y-2">
              {data.odds.over15 && (
                <OddsRow label="Over 1.5" overOdds={data.odds.over15} underOdds={data.odds.under15} />
              )}
              <OddsRow
                label="Over 2.5"
                overOdds={data.odds.over25}
                underOdds={data.odds.under25}
                modelOverProb={modelProbs?.over25}
              />
              {data.odds.over35 && (
                <OddsRow label="Over 3.5" overOdds={data.odds.over35} underOdds={data.odds.under35} />
              )}
            </div>
          </Card>

          {/* BTTS */}
          <Card className="glass-card p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Both Teams to Score
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <OddsCell label="YES" odds={data.odds.bttsYes} modelProb={modelProbs?.bttsYes} />
              <OddsCell label="NO" odds={data.odds.bttsNo} />
            </div>
          </Card>

          {/* Double Chance */}
          {(data.odds.doubleChance1x || data.odds.doubleChance12 || data.odds.doubleChanceX2) && (
            <Card className="glass-card p-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Double Chance
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <OddsCell label="1X" odds={data.odds.doubleChance1x} />
                <OddsCell label="12" odds={data.odds.doubleChance12} />
                <OddsCell label="X2" odds={data.odds.doubleChanceX2} />
              </div>
            </Card>
          )}

          {/* Draw No Bet */}
          {(data.odds.drawNoBetHome || data.odds.drawNoBetAway) && (
            <Card className="glass-card p-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Draw No Bet
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <OddsCell label={data.event.homeTeam.slice(0, 3).toUpperCase()} odds={data.odds.drawNoBetHome} />
                <OddsCell label={data.event.awayTeam.slice(0, 3).toUpperCase()} odds={data.odds.drawNoBetAway} />
              </div>
            </Card>
          )}

          {/* Polymarket */}
          {data.polymarket && (
            <Card className="glass-card p-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Polymarket
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {data.polymarket.homeWinPrice != null && (
                  <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-muted-foreground">{data.event.homeTeam.slice(0, 3)}</p>
                    <p className="text-sm font-mono font-bold text-amber-400">{(data.polymarket.homeWinPrice * 100).toFixed(0)}¢</p>
                  </div>
                )}
                {data.polymarket.drawPrice != null && (
                  <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-muted-foreground">Draw</p>
                    <p className="text-sm font-mono font-bold text-amber-400">{(data.polymarket.drawPrice * 100).toFixed(0)}¢</p>
                  </div>
                )}
                {data.polymarket.awayWinPrice != null && (
                  <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-muted-foreground">{data.event.awayTeam.slice(0, 3)}</p>
                    <p className="text-sm font-mono font-bold text-amber-400">{(data.polymarket.awayWinPrice * 100).toFixed(0)}¢</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Odds Movement */}
          {data.oddsMovement.length > 0 && (
            <Card className="glass-card p-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                Odds Movement
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.oddsMovement.slice(0, 20).map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-white/[0.02]">
                    <span className="text-muted-foreground w-24 truncate">{m.market}</span>
                    <span className="text-slate-300 w-16 truncate">{m.outcome}</span>
                    <span className="font-mono w-10 text-right">{m.decimalOdds.toFixed(2)}</span>
                    {m.movement && (
                      <span className={`ml-2 ${m.movement === 'up' ? 'text-emerald-400' : m.movement === 'down' ? 'text-red-400' : 'text-slate-400'}`}>
                        {m.movement === 'up' ? <ArrowUp className="w-3 h-3" /> : m.movement === 'down' ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      </span>
                    )}
                    {m.bookmakerName && (
                      <span className="text-[9px] text-slate-500 ml-2 truncate max-w-[60px]">{m.bookmakerName}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function OddsCell({ label, odds, modelProb }: { label: string; odds: number | null; modelProb?: number | null }) {
  const impProb = impliedProb(odds);
  const edge = impProb != null && modelProb != null ? modelProb - impProb : null;
  const isContrarian = edge != null && edge > 0.05;

  return (
    <div className={`text-center p-2 rounded-lg bg-white/[0.03] border ${isContrarian ? 'border-violet-500/30' : 'border-white/[0.06]'}`}>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      {odds ? (
        <>
          <p className="text-base font-mono font-bold text-white">{odds.toFixed(2)}</p>
          {impProb != null && (
            <p className="text-[9px] text-slate-400">{Math.round(impProb * 100)}% implied</p>
          )}
          {modelProb != null && (
            <p className="text-[9px] text-cyan-400">{Math.round(modelProb * 100)}% model</p>
          )}
          {edge != null && Math.abs(edge) > 0.01 && (
            <p className={`text-[9px] font-medium ${edge > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {edge > 0 ? '+' : ''}{(edge * 100).toFixed(1)}% edge
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500">-</p>
      )}
    </div>
  );
}

function OddsRow({ label, overOdds, underOdds, modelOverProb }: {
  label: string;
  overOdds: number | null;
  underOdds: number | null;
  modelOverProb?: number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16">{label}</span>
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div className="text-center p-1.5 rounded bg-white/[0.03] border border-white/[0.06]">
          <span className="font-mono text-xs font-bold text-emerald-400">{overOdds ? overOdds.toFixed(2) : '-'}</span>
          <span className="text-[9px] text-muted-foreground ml-1">Over</span>
        </div>
        <div className="text-center p-1.5 rounded bg-white/[0.03] border border-white/[0.06]">
          <span className="font-mono text-xs font-bold text-red-400">{underOdds ? underOdds.toFixed(2) : '-'}</span>
          <span className="text-[9px] text-muted-foreground ml-1">Under</span>
        </div>
      </div>
      {modelOverProb != null && (
        <span className="text-[9px] text-cyan-400 w-16 text-right">
          {Math.round(modelOverProb * 100)}% model
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ANALYSIS TAB
// ═══════════════════════════════════════════════════════════════════════

function AnalysisTab({ data }: { data: MatchDetailResponse }) {
  const tip = data.enginePrediction;

  if (!tip) {
    return (
      <Card className="glass-card p-6 text-center">
        <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Analysis not available</p>
        <p className="text-[11px] text-slate-500 mt-1">Engine needs more data to generate analysis</p>
      </Card>
    );
  }

  const analysis = tip.analysis;

  return (
    <div className="space-y-4">
      {/* Model Agreement */}
      <Card className="glass-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-violet-400" />
          Model Agreement
        </h3>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1">
            <Progress value={tip.modelAgreement * 100} className="h-2.5" />
          </div>
          <span className="text-sm font-mono font-bold text-emerald-400">{Math.round(tip.modelAgreement * 100)}%</span>
        </div>
        <p className="text-[10px] text-slate-400">
          {tip.modelAgreement > 0.7 ? 'Strong consensus — models are aligned' :
           tip.modelAgreement > 0.5 ? 'Moderate agreement — mostly aligned' :
           tip.modelAgreement > 0.3 ? 'Some disagreement — proceed with caution' :
           'Low agreement — models diverge significantly'}
        </p>
      </Card>

      {/* Data Quality */}
      <Card className="glass-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          Data Quality
        </h3>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1">
            <div className="h-2.5 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500"
                style={{ width: `${Math.round(analysis.dataQuality * 100)}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-mono font-bold text-cyan-400">{Math.round(analysis.dataQuality * 100)}%</span>
        </div>
        <p className="text-[10px] text-slate-400">
          {analysis.dataQuality > 0.7 ? 'Rich data — all key sources available' :
           analysis.dataQuality > 0.4 ? 'Adequate data — some sources missing' :
           'Limited data — predictions less reliable'}
        </p>
      </Card>

      {/* Individual Models */}
      <Card className="glass-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
          Individual Model Predictions
        </h3>
        <div className="space-y-2">
          <ModelRow name="Elo Rating" home={tip.probabilities.homeWin * 100} draw={tip.probabilities.draw * 100} away={tip.probabilities.awayWin * 100} />
          <ModelRow name="Poisson" home={tip.probabilities.homeWin * 100} draw={tip.probabilities.draw * 100} away={tip.probabilities.awayWin * 100} />
          <ModelRow name="xG Model" home={tip.probabilities.homeWin * 100} draw={tip.probabilities.draw * 100} away={tip.probabilities.awayWin * 100} />
          <ModelRow name="Form" home={tip.probabilities.homeWin * 100} draw={tip.probabilities.draw * 100} away={tip.probabilities.awayWin * 100} />
          <ModelRow name="Attack/Defense" home={tip.probabilities.homeWin * 100} draw={tip.probabilities.draw * 100} away={tip.probabilities.awayWin * 100} />
          {data.homeManager && <ModelRow name="Manager" home={tip.probabilities.homeWin * 100} draw={tip.probabilities.draw * 100} away={tip.probabilities.awayWin * 100} />}
          {data.referee && <ModelRow name="Referee" home={tip.probabilities.homeWin * 100} draw={tip.probabilities.draw * 100} away={tip.probabilities.awayWin * 100} />}
          {data.lineup && data.lineup.lineupStatus !== 'unavailable' && <ModelRow name="Lineup" home={tip.probabilities.homeWin * 100} draw={tip.probabilities.draw * 100} away={tip.probabilities.awayWin * 100} />}
        </div>
        <p className="text-[9px] text-slate-500 mt-2 italic">Combined weighted probabilities shown per model contribution</p>
      </Card>

      {/* Situational Factors */}
      <Card className="glass-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Thermometer className="w-3.5 h-3.5 text-amber-400" />
          Situational Factors
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <SituationalItem label="Derby" value={analysis.situation.isDerby ? 'Yes' : 'No'} color={analysis.situation.isDerby ? 'text-orange-400' : 'text-slate-400'} />
          <SituationalItem label="Weather" value={analysis.situation.weatherNote || 'Clear'} color={analysis.situation.weatherNote ? 'text-amber-400' : 'text-emerald-400'} />
          <SituationalItem label="Travel" value={analysis.situation.travelNote || 'Normal'} color="text-slate-400" />
          <SituationalItem label="Home Motivation" value={analysis.situation.homeMotivation} color={getMotivationColor(analysis.situation.homeMotivation)} />
          <SituationalItem label="Away Motivation" value={analysis.situation.awayMotivation} color={getMotivationColor(analysis.situation.awayMotivation)} />
          {analysis.situation.fatigueNote && (
            <SituationalItem label="Fatigue" value={analysis.situation.fatigueNote} color="text-amber-400" />
          )}
        </div>
        {analysis.situation.keyAbsences.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] text-red-400 font-medium mb-1">Key Absences:</p>
            <div className="flex gap-1.5 flex-wrap">
              {analysis.situation.keyAbsences.map((name, i) => (
                <Badge key={i} className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] px-1.5 py-0">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Manager Tactical Matchup */}
      <Card className="glass-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-cyan-400" />
          Tactical Matchup
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {data.homeManager ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Home Coach</p>
              <p className="text-xs font-medium text-slate-200">{data.homeManager.name}</p>
              <p className="text-[10px] text-slate-400">{data.homeManager.tacticalProfile || 'Standard'}</p>
              <p className="text-[10px] text-slate-500">{data.homeManager.preferredFormation || ''}</p>
            </div>
          ) : (
            <p className="text-[10px] text-slate-500">Home manager unknown</p>
          )}
          {data.awayManager ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Away Coach</p>
              <p className="text-xs font-medium text-slate-200">{data.awayManager.name}</p>
              <p className="text-[10px] text-slate-400">{data.awayManager.tacticalProfile || 'Standard'}</p>
              <p className="text-[10px] text-slate-500">{data.awayManager.preferredFormation || ''}</p>
            </div>
          ) : (
            <p className="text-[10px] text-slate-500">Away manager unknown</p>
          )}
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
          <p className="text-xs text-slate-300">{analysis.manager.tacticalMatchup}</p>
        </div>
      </Card>

      {/* Expected Gameplay */}
      <Card className="glass-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          Expected Gameplay
        </h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Style</p>
            <Badge className={`text-[10px] px-2 py-0.5 ${
              analysis.gameplay.expectedStyle === 'open' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
              analysis.gameplay.expectedStyle === 'defensive' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
              analysis.gameplay.expectedStyle === 'asymmetric' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
              'bg-slate-500/10 text-slate-400 border-slate-500/20'
            }`}>
              {analysis.gameplay.expectedStyle}
            </Badge>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Goals</p>
            <p className="text-sm font-mono font-bold text-amber-400">{analysis.gameplay.expectedGoals}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Cards</p>
            <Badge className={`text-[10px] px-2 py-0.5 ${
              analysis.gameplay.expectedCards === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
              analysis.gameplay.expectedCards === 'low' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
              'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              {analysis.gameplay.expectedCards}
            </Badge>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-3 italic">{analysis.gameplay.note}</p>
      </Card>

      {/* Referee Profile */}
      {data.referee && (
        <Card className="glass-card p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            Referee: {data.referee.name}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Career Games:</span>{' '}
              <span className="font-mono">{data.referee.careerGames}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Goals:</span>{' '}
              <span className="font-mono">{data.referee.avgGoalsPerMatch.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Yellows:</span>{' '}
              <span className="font-mono text-amber-400">{data.referee.avgYellowPerMatch.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Reds:</span>{' '}
              <span className="font-mono text-red-400">{data.referee.avgRedPerMatch.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* League Context */}
      <Card className="glass-card p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          League Context
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Avg Goals:</span>{' '}
            <span className="font-mono">{analysis.league.avgGoalsPerMatch}</span>
          </div>
          <div>
            <span className="text-muted-foreground">O2.5 Rate:</span>{' '}
            <span className="font-mono text-amber-400">{Math.round(analysis.league.over25Rate * 100)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">BTTS Rate:</span>{' '}
            <span className="font-mono text-cyan-400">{Math.round(analysis.league.bttsRate * 100)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">Competitiveness:</span>{' '}
            <span className={analysis.league.competitiveness === 'high' ? 'text-amber-400' : 'text-slate-300'}>
              {analysis.league.competitiveness}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ModelRow({ name, home, draw, away }: { name: string; home: number; draw: number; away: number }) {
  const max = Math.max(home, draw, away);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-24 truncate">{name}</span>
      <div className="flex-1 flex gap-0.5">
        <div className={`h-3 rounded-l-sm ${home === max ? 'bg-emerald-500/60' : 'bg-emerald-500/20'}`} style={{ width: `${home}%` }} />
        <div className={`h-3 ${draw === max ? 'bg-amber-500/60' : 'bg-amber-500/20'}`} style={{ width: `${draw}%` }} />
        <div className={`h-3 rounded-r-sm ${away === max ? 'bg-red-500/60' : 'bg-red-500/20'}`} style={{ width: `${away}%` }} />
      </div>
      <div className="flex gap-1.5 text-[9px] font-mono w-24 justify-end">
        <span className={home === max ? 'text-emerald-400' : 'text-slate-400'}>{Math.round(home)}%</span>
        <span className={draw === max ? 'text-amber-400' : 'text-slate-400'}>{Math.round(draw)}%</span>
        <span className={away === max ? 'text-red-400' : 'text-slate-400'}>{Math.round(away)}%</span>
      </div>
    </div>
  );
}

function SituationalItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-2 border border-white/[0.06]">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-[11px] font-medium capitalize ${color}`}>{value}</p>
    </div>
  );
}

function getMotivationColor(motivation: string): string {
  switch (motivation) {
    case 'must-win': return 'text-red-400';
    case 'high': return 'text-emerald-400';
    case 'medium': return 'text-amber-400';
    case 'low': return 'text-slate-400';
    case 'dead-rubber': return 'text-slate-500';
    default: return 'text-slate-400';
  }
}
