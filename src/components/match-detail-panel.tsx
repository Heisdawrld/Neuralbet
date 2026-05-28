'use client';

import { useState, useEffect } from 'react';
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
  ChevronDown, Activity,
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
  gold: { icon: <Flame className="w-5 h-5" />, label: 'GOLD', color: 'text-amber-300', bg: 'bg-amber-500/20', border: 'border-amber-500/40', glow: 'gold-glow' },
  silver: { icon: <Crosshair className="w-5 h-5" />, label: 'SILVER', color: 'text-cyan-300', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30', glow: 'silver-glow' },
  bronze: { icon: <TrendingUp className="w-5 h-5" />, label: 'BRONZE', color: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/30', glow: 'bronze-glow' },
  skip: { icon: <X className="w-5 h-5" />, label: 'SKIP', color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20', glow: '' },
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

type TabId = 'prediction' | 'stats' | 'h2h' | 'standings' | 'lineups' | 'odds' | 'analysis';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'prediction', label: 'Prediction', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'h2h', label: 'H2H', icon: <Swords className="w-3.5 h-3.5" /> },
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

// ── Probability Donut Chart ────────────────────────────────────────────

function ProbabilityDonut({ homeWin, draw, awayWin, homeLabel, awayLabel }: {
  homeWin: number; draw: number; awayWin: number; homeLabel: string; awayLabel: string;
}) {
  const size = 120;
  const strokeWidth = 16;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;

  const homeArc = homeWin * circ;
  const drawArc = draw * circ;
  const awayArc = awayWin * circ;

  const homeOffset = 0;
  const drawOffset = homeArc;
  const awayOffset = homeArc + drawArc;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Home win arc */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#10b981" strokeWidth={strokeWidth} strokeDasharray={`${homeArc} ${circ - homeArc}`} strokeDashoffset={-homeOffset} strokeLinecap="butt" className="donut-animate" />
          {/* Draw arc */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeDasharray={`${drawArc} ${circ - drawArc}`} strokeDashoffset={-drawOffset} strokeLinecap="butt" className="donut-animate" />
          {/* Away win arc */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#06b6d4" strokeWidth={strokeWidth} strokeDasharray={`${awayArc} ${circ - awayArc}`} strokeDashoffset={-awayOffset} strokeLinecap="butt" className="donut-animate" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-emerald-400">{Math.round(homeWin * 100)}%</span>
          <span className="text-[8px] text-muted-foreground">vs</span>
          <span className="text-xs font-bold text-cyan-400">{Math.round(awayWin * 100)}%</span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{homeLabel}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Draw</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500" />{awayLabel}</span>
      </div>
    </div>
  );
}

// ── Pitch Formation Display ────────────────────────────────────────────

function PitchFormation({ formation, players, teamName, isHome }: {
  formation: string | null;
  players: any[] | null;
  teamName: string;
  isHome: boolean;
}) {
  const lines = formation ? formation.split('-').map(Number) : [4, 4, 2];
  const gk = 1;
  const totalLines = lines.length + 1; // +1 for GK

  return (
    <div className="pitch p-3 rounded-lg">
      <p className="text-[10px] text-emerald-400 font-medium mb-1 text-center">{teamName} ({formation || '4-4-2'})</p>
      <div className="flex flex-col items-center gap-2 py-2" style={{ minHeight: '160px' }}>
        {/* Goalkeeper */}
        <div className="flex justify-center">
          <PlayerDot name="GK" isHome={isHome} />
        </div>
        {/* Outfield lines */}
        {lines.map((count, lineIdx) => (
          <div key={lineIdx} className="flex justify-center gap-1">
            {Array.from({ length: count }).map((_, pIdx) => {
              const playerIdx = gk + lines.slice(0, lineIdx).reduce((a, b) => a + b, 0) + pIdx;
              const playerName = players?.[playerIdx]?.playerName || `P${playerIdx + 1}`;
              return <PlayerDot key={pIdx} name={playerName.split(' ').pop() || playerName} isHome={isHome} />;
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
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold ${
        isHome ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' : 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
      }`}>
        {name.slice(0, 2).toUpperCase()}
      </div>
      <span className="text-[7px] text-muted-foreground mt-0.5 max-w-[40px] truncate text-center">{name}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN: Match Detail Panel
// ═══════════════════════════════════════════════════════════════════════

export function MatchDetailPanel() {
  const { selectedMatchId, isMatchPanelOpen, closeMatchPanel } = useAppStore();
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={closeMatchPanel}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 z-50 h-full w-full md:w-[70%] lg:w-[55%] bg-[#0d1117]/95 backdrop-blur-xl border-l border-white/[0.06] flex flex-col overflow-hidden"
          >
            {/* ── HEADER ──────────────────────────────────────────── */}
            <div className="flex-shrink-0 border-b border-white/[0.06] bg-gradient-to-b from-[#0d1117] to-[#0a0e1a]">
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
                <button onClick={closeMatchPanel} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold truncate">{data?.event.homeTeam || 'Home'}</p>
                    {data?.homeTeamStanding && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {data.homeTeamStanding.position}{getOrdinal(data.homeTeamStanding.position)} · {data.homeTeamStanding.pts} pts
                        {data.homeTeamStanding.form && (
                          <span className="ml-2 inline-flex gap-0.5">
                            {data.homeTeamStanding.form.slice(-5).split('').map((l, i) => <FormLetter key={i} letter={l} />)}
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
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 py-0 mb-1">
                              <span className="relative flex h-1.5 w-1.5 mr-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                              </span>
                              {data?.event.currentMinute ? `${data.event.currentMinute}'` : 'LIVE'}
                            </Badge>
                          )}
                          {isFinished && (
                            <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-[9px] px-1.5 py-0 mb-1">FT</Badge>
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
                            {data.awayTeamStanding.form.slice(-5).split('').map((l, i) => <FormLetter key={i} letter={l} />)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

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
                        activeTab === tab.id ? 'tab-active' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
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
                  <div className="text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                    <p>No data available</p>
                    <p className="text-xs text-slate-500 mt-1">Try syncing data first</p>
                  </div>
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
                        {activeTab === 'h2h' && <H2HTab data={data} />}
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
      <div className="glass-skeleton h-32 w-full" />
      <div className="glass-skeleton h-20 w-full" />
      <div className="glass-skeleton h-40 w-full" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PREDICTION TAB — with probability donut chart
// ═══════════════════════════════════════════════════════════════════════

function PredictionTab({ data }: { data: MatchDetailResponse }) {
  const tip = data.enginePrediction;
  const hasTip = tip?.tip !== null && tip?.tip !== undefined;
  const quality: TipQuality = tip?.tip?.quality ?? 'skip';
  const config = QUALITY_CONFIG[quality];

  return (
    <div className="space-y-4">
      {tip ? (
        <>
          {hasTip && tip.tip ? (
            <Card className={`glass-card-premium p-5 ${config.glow}`}>
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
                    <Badge className="bg-violet-500/10 text-violet-300 border-violet-500/20 text-[9px] px-1.5 py-0">Contrarian</Badge>
                  )}
                </div>
              </div>

              {/* Selection + Market + Donut Chart */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold text-white">{tip.tip.selection}</p>
                  <p className="text-sm text-muted-foreground mt-1">{tip.tip.market}</p>
                  {tip.tip.odds && (
                    <p className="text-3xl font-mono font-bold text-emerald-400 mt-2">
                      @{tip.tip.odds.toFixed(2)}
                    </p>
                  )}
                </div>
                <ProbabilityDonut
                  homeWin={tip.probabilities.homeWin}
                  draw={tip.probabilities.draw}
                  awayWin={tip.probabilities.awayWin}
                  homeLabel={data.event.homeTeam.slice(0, 3)}
                  awayLabel={data.event.awayTeam.slice(0, 3)}
                />
              </div>

              {/* Edge & Kelly */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.06]">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Edge</p>
                  <p className="text-lg font-bold text-emerald-400">+{(tip.tip.edge * 100).toFixed(1)}%</p>
                </div>
                <div className="text-center bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.06]">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kelly</p>
                  <p className="text-lg font-bold text-cyan-400">{(tip.tip.kellyStake * 100).toFixed(1)}%</p>
                </div>
                <div className="text-center bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.06]">
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

              <p className="text-[10px] text-slate-500 text-center mt-3">
                {tip.tip.marketsEvaluated} markets evaluated · Model agreement: {Math.round(tip.modelAgreement * 100)}%
              </p>
            </Card>
          ) : (
            <Card className="glass-card-premium p-5">
              <div className="text-center">
                <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20 border text-xs px-3 py-1 flex items-center gap-1.5 mx-auto mb-3">
                  <X className="w-4 h-4" />SKIP
                </Badge>
                <p className="text-lg font-semibold text-slate-300 mb-2">No Tip for This Match</p>
                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06] max-w-md mx-auto">
                  <p className="text-xs text-slate-400 italic flex items-start gap-1.5">
                    <Brain className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-violet-400" />
                    {tip.skipReason || 'The punter walks away — no edge found'}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Model Probabilities */}
          <Card className="glass-card-premium p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
              Model Probabilities
            </h3>
            <div className="space-y-3">
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
        <Card className="glass-card-premium p-5 text-center">
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
      <div className="flex-1 h-2.5 bg-white/[0.05] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${modelProb * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${modelProb > 0.5 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : modelProb > 0.3 ? 'bg-gradient-to-r from-cyan-600 to-cyan-400' : 'bg-slate-500'}`}
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
// STATS TAB — Team comparison + match stats
// ═══════════════════════════════════════════════════════════════════════

function StatsTab({ data }: { data: MatchDetailResponse }) {
  const tip = data.enginePrediction;

  return (
    <div className="space-y-4">
      {/* Team Comparison */}
      {data.homeTeamStanding && data.awayTeamStanding && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            Team Comparison
          </h3>
          <div className="space-y-3">
            <ComparisonBar label="Goals/match" homeVal={data.homeTeamStanding.gf / Math.max(1, data.homeTeamStanding.played)} awayVal={data.awayTeamStanding.gf / Math.max(1, data.awayTeamStanding.played)} homeLabel={data.event.homeTeam.slice(0, 3)} awayLabel={data.event.awayTeam.slice(0, 3)} />
            <ComparisonBar label="Conceded/match" homeVal={data.homeTeamStanding.ga / Math.max(1, data.homeTeamStanding.played)} awayVal={data.awayTeamStanding.ga / Math.max(1, data.awayTeamStanding.played)} homeLabel={data.event.homeTeam.slice(0, 3)} awayLabel={data.event.awayTeam.slice(0, 3)} inverse />
            {data.homeTeamStanding.xgf && data.awayTeamStanding.xgf && (
              <ComparisonBar label="xG/match" homeVal={data.homeTeamStanding.xgf / Math.max(1, data.homeTeamStanding.played)} awayVal={data.awayTeamStanding.xgf / Math.max(1, data.awayTeamStanding.played)} homeLabel={data.event.homeTeam.slice(0, 3)} awayLabel={data.event.awayTeam.slice(0, 3)} />
            )}
            <ComparisonBar label="Win %" homeVal={data.homeTeamStanding.won / Math.max(1, data.homeTeamStanding.played) * 100} awayVal={data.awayTeamStanding.won / Math.max(1, data.awayTeamStanding.played) * 100} homeLabel={data.event.homeTeam.slice(0, 3)} awayLabel={data.event.awayTeam.slice(0, 3)} isPercent />
          </div>
          <Separator className="my-3 bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">{data.event.homeTeam} Form</p>
              {data.homeTeamStanding.form ? (
                <div className="flex gap-0.5">{data.homeTeamStanding.form.slice(-5).split('').map((l, i) => <FormLetter key={i} letter={l} />)}</div>
              ) : <p className="text-[10px] text-slate-500">No data</p>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">{data.event.awayTeam} Form</p>
              {data.awayTeamStanding.form ? (
                <div className="flex gap-0.5">{data.awayTeamStanding.form.slice(-5).split('').map((l, i) => <FormLetter key={i} letter={l} />)}</div>
              ) : <p className="text-[10px] text-slate-500">No data</p>}
            </div>
          </div>
        </Card>
      )}

      {/* Live Match Stats */}
      {data.stats && (data.event.status === 'in' || data.event.status === 'finished' || data.event.status === 'live') && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
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

      {/* Engine Insights */}
      {tip && (
        <Card className="glass-card-premium p-4">
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
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// H2H TAB — Dedicated head-to-head
// ═══════════════════════════════════════════════════════════════════════

function H2HTab({ data }: { data: MatchDetailResponse }) {
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
      <Card className="glass-card-premium p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Swords className="w-3.5 h-3.5 text-cyan-400" />
          Head to Head
        </h3>
        {h2hTotal > 0 ? (
          <>
            {/* Win distribution bar */}
            <div className="flex h-8 rounded-full overflow-hidden mb-3">
              <div className="bg-emerald-500/60 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(h2hHomeWins / h2hTotal) * 100}%` }}>
                {h2hHomeWins > 0 && `${h2hHomeWins}W`}
              </div>
              <div className="bg-amber-500/40 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(h2hDraws / h2hTotal) * 100}%` }}>
                {h2hDraws > 0 && `${h2hDraws}D`}
              </div>
              <div className="bg-red-500/60 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(h2hAwayWins / h2hTotal) * 100}%` }}>
                {h2hAwayWins > 0 && `${h2hAwayWins}W`}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-4">
              <span className="text-emerald-400 font-medium">{data.event.homeTeam} {h2hHomeWins}W</span>
              <span>{h2hDraws}D</span>
              <span className="text-red-400 font-medium">{h2hAwayWins}W {data.event.awayTeam}</span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center bg-white/[0.03] rounded-lg p-2 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground">Avg Goals</p>
                <p className="text-lg font-mono font-bold text-white">{(h2hGoals / h2hTotal).toFixed(1)}</p>
              </div>
              <div className="text-center bg-white/[0.03] rounded-lg p-2 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground">O2.5 Rate</p>
                <p className="text-lg font-mono font-bold text-amber-400">{Math.round((h2hOver25 / h2hTotal) * 100)}%</p>
              </div>
              <div className="text-center bg-white/[0.03] rounded-lg p-2 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground">BTTS Rate</p>
                <p className="text-lg font-mono font-bold text-cyan-400">{Math.round((h2hBtts / h2hTotal) * 100)}%</p>
              </div>
            </div>

            {/* Results timeline */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.h2h.slice(0, 10).map((m, i) => {
                const isHomeWin = m.homeScore > m.awayScore;
                const isAwayWin = m.awayScore > m.homeScore;
                const homeIsOurTeam = m.homeTeamId === data.event.homeTeamId;
                const ourTeamWon = (homeIsOurTeam && isHomeWin) || (!homeIsOurTeam && isAwayWin);

                return (
                  <div key={i} className={`flex items-center justify-between text-[11px] py-2 px-3 rounded-lg border ${
                    ourTeamWon ? 'bg-emerald-500/5 border-emerald-500/10' : isHomeWin || isAwayWin ? 'bg-red-500/5 border-red-500/10' : 'bg-white/[0.02] border-white/[0.04]'
                  }`}>
                    <span className="text-muted-foreground w-20">{format(new Date(m.eventDate), 'MMM yyyy')}</span>
                    <span className="flex-1 text-right truncate pr-3">{m.homeTeam}</span>
                    <span className="font-mono font-bold text-white px-2 text-sm">{m.homeScore} - {m.awayScore}</span>
                    <span className="flex-1 truncate pl-3">{m.awayTeam}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Swords className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No previous meetings found</p>
            <p className="text-[11px] text-slate-500 mt-1">These teams have never played each other</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STANDINGS TAB
// ═══════════════════════════════════════════════════════════════════════

function StandingsTab({ data }: { data: MatchDetailResponse }) {
  if (data.standings.length === 0) {
    return (
      <Card className="glass-card-premium p-5 text-center">
        <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No standings data available</p>
      </Card>
    );
  }

  return (
    <Card className="glass-card-premium p-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5 text-amber-400" />
        League Standings
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-white/5">
              <th className="text-left py-2 px-1.5 w-6">#</th>
              <th className="text-left py-2 px-1.5">Team</th>
              <th className="text-center py-2 px-1.5 w-6">P</th>
              <th className="text-center py-2 px-1.5 w-6">W</th>
              <th className="text-center py-2 px-1.5 w-6">D</th>
              <th className="text-center py-2 px-1.5 w-6">L</th>
              <th className="text-center py-2 px-1.5 w-8">GD</th>
              <th className="text-center py-2 px-1.5 w-8">xGD</th>
              <th className="text-center py-2 px-1.5 w-8">Pts</th>
              <th className="text-center py-2 px-1.5 w-20">Form</th>
            </tr>
          </thead>
          <tbody>
            {data.standings.map((team, idx) => {
              const isHome = team.teamId === data.event.homeTeamId;
              const isAway = team.teamId === data.event.awayTeamId;
              const isMatch = isHome || isAway;

              return (
                <motion.tr
                  key={team.teamId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className={`border-b border-white/3 ${isMatch ? 'bg-emerald-500/5' : 'hover:bg-white/[0.02]'} transition-colors`}
                >
                  <td className="py-1.5 px-1.5 font-mono text-muted-foreground text-xs">{team.position}</td>
                  <td className={`py-1.5 px-1.5 font-medium truncate max-w-[120px] text-xs ${isMatch ? 'text-emerald-400' : ''}`}>
                    {team.teamName}
                    {team.isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-pulse inline-block ml-1" />}
                  </td>
                  <td className="py-1.5 px-1.5 text-center font-mono text-muted-foreground text-xs">{team.played}</td>
                  <td className="py-1.5 px-1.5 text-center font-mono text-emerald-400 text-xs">{team.won}</td>
                  <td className="py-1.5 px-1.5 text-center font-mono text-amber-400 text-xs">{team.drawn}</td>
                  <td className="py-1.5 px-1.5 text-center font-mono text-red-400 text-xs">{team.lost}</td>
                  <td className="py-1.5 px-1.5 text-center font-mono text-xs">
                    <span className={team.gd > 0 ? 'text-emerald-400' : team.gd < 0 ? 'text-red-400' : ''}>
                      {team.gd > 0 ? '+' : ''}{team.gd}
                    </span>
                  </td>
                  <td className="py-1.5 px-1.5 text-center font-mono text-cyan-400 text-xs">
                    {team.xgd !== null && team.xgd !== undefined ? (team.xgd > 0 ? '+' : '') + team.xgd.toFixed(1) : '-'}
                  </td>
                  <td className="py-1.5 px-1.5 text-center font-mono font-bold text-emerald-400 text-xs">{team.pts}</td>
                  <td className="py-1.5 px-1.5">
                    <div className="flex items-center justify-center gap-0.5">
                      {team.form?.split('').slice(0, 5).map((ch, i) => {
                        const color = ch === 'W' ? 'bg-emerald-400' : ch === 'D' ? 'bg-amber-400' : 'bg-red-400';
                        return <span key={i} className={`inline-block w-2 h-2 rounded-full ${color}`} />;
                      })}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LINEUPS TAB — Visual formation display
// ═══════════════════════════════════════════════════════════════════════

function LineupsTab({ data }: { data: MatchDetailResponse }) {
  const lineup = data.lineup;

  if (!lineup) {
    return (
      <Card className="glass-card-premium p-5 text-center">
        <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Lineup data not available</p>
        <p className="text-[11px] text-slate-500 mt-1">Check back closer to match time</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Formation Status */}
      <Card className="glass-card-premium p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            Lineups
          </h3>
          <Badge className={`text-[9px] ${lineup.lineupStatus === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
            {lineup.lineupStatus === 'confirmed' ? 'Confirmed' : 'Expected'}
          </Badge>
        </div>

        {/* Formations */}
        <div className="grid grid-cols-2 gap-4">
          <PitchFormation
            formation={lineup.homeFormation}
            players={lineup.homePlayers}
            teamName={data.event.homeTeam}
            isHome={true}
          />
          <PitchFormation
            formation={lineup.awayFormation}
            players={lineup.awayPlayers}
            teamName={data.event.awayTeam}
            isHome={false}
          />
        </div>
      </Card>

      {/* Unavailable Players */}
      {(lineup.homeUnavailable?.length > 0 || lineup.awayUnavailable?.length > 0) && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Unavailable
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">{data.event.homeTeam}</p>
              {lineup.homeUnavailable?.map((p: any, i: number) => (
                <p key={i} className="text-[10px] text-red-400">{p.playerName || p.name}</p>
              )) || <p className="text-[10px] text-slate-500">None</p>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">{data.event.awayTeam}</p>
              {lineup.awayUnavailable?.map((p: any, i: number) => (
                <p key={i} className="text-[10px] text-red-400">{p.playerName || p.name}</p>
              )) || <p className="text-[10px] text-slate-500">None</p>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ODDS TAB — Odds movement + Polymarket
// ═══════════════════════════════════════════════════════════════════════

function OddsTab({ data }: { data: MatchDetailResponse }) {
  return (
    <div className="space-y-4">
      {/* Match Odds */}
      {data.odds && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            Match Odds
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <OddsCard label="Home Win" odds={data.odds.homeWin} impProb={impliedProb(data.odds.homeWin)} />
            <OddsCard label="Draw" odds={data.odds.draw} impProb={impliedProb(data.odds.draw)} />
            <OddsCard label="Away Win" odds={data.odds.awayWin} impProb={impliedProb(data.odds.awayWin)} />
          </div>

          <Separator className="my-3 bg-white/[0.06]" />

          <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Goals Markets</h4>
          <div className="grid grid-cols-3 gap-2">
            <OddsCard label="Over 1.5" odds={data.odds.over15} small />
            <OddsCard label="Over 2.5" odds={data.odds.over25} small />
            <OddsCard label="Over 3.5" odds={data.odds.over35} small />
            <OddsCard label="Under 1.5" odds={data.odds.under15} small />
            <OddsCard label="Under 2.5" odds={data.odds.under25} small />
            <OddsCard label="Under 3.5" odds={data.odds.under35} small />
          </div>

          <Separator className="my-3 bg-white/[0.06]" />

          <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">BTTS & Double Chance</h4>
          <div className="grid grid-cols-3 gap-2">
            <OddsCard label="BTTS Yes" odds={data.odds.bttsYes} small />
            <OddsCard label="BTTS No" odds={data.odds.bttsNo} small />
            <OddsCard label="1X" odds={data.odds.doubleChance1x} small />
            <OddsCard label="12" odds={data.odds.doubleChance12} small />
            <OddsCard label="X2" odds={data.odds.doubleChanceX2} small />
            <OddsCard label="DnB Home" odds={data.odds.drawNoBetHome} small />
          </div>
        </Card>
      )}

      {/* Odds Movement */}
      {data.oddsMovement.length > 0 && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            Odds Movement
          </h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {data.oddsMovement.map((mov, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] py-1.5 px-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground truncate">{mov.market}</span>
                  <span className="text-slate-300 truncate">{mov.outcome}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {mov.previousDecimalOdds && (
                    <span className="text-slate-500 font-mono line-through">{mov.previousDecimalOdds.toFixed(2)}</span>
                  )}
                  <span className={`font-mono font-bold ${mov.movement === 'up' ? 'odds-up' : mov.movement === 'down' ? 'odds-down' : 'text-white'}`}>
                    {mov.decimalOdds.toFixed(2)}
                  </span>
                  {mov.movement === 'up' && <ArrowUp className="w-3 h-3 text-emerald-400" />}
                  {mov.movement === 'down' && <ArrowDown className="w-3 h-3 text-red-400" />}
                  {mov.isMaxQuote && <Badge className="bg-amber-500/10 text-amber-400 text-[8px] px-1 py-0">BEST</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Polymarket */}
      {data.polymarket && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-violet-400" />
            Polymarket Prices
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {data.polymarket.homeWinPrice && (
              <div className="text-center bg-white/[0.03] rounded-lg p-2 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground">Home Win</p>
                <p className="text-sm font-mono font-bold text-violet-400">{(data.polymarket.homeWinPrice * 100).toFixed(1)}¢</p>
              </div>
            )}
            {data.polymarket.over25Price && (
              <div className="text-center bg-white/[0.03] rounded-lg p-2 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground">Over 2.5</p>
                <p className="text-sm font-mono font-bold text-amber-400">{(data.polymarket.over25Price * 100).toFixed(1)}¢</p>
              </div>
            )}
            {data.polymarket.bttsYesPrice && (
              <div className="text-center bg-white/[0.03] rounded-lg p-2 border border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground">BTTS Yes</p>
                <p className="text-sm font-mono font-bold text-cyan-400">{(data.polymarket.bttsYesPrice * 100).toFixed(1)}¢</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {!data.odds && data.oddsMovement.length === 0 && (
        <Card className="glass-card-premium p-5 text-center">
          <DollarSign className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No odds data available</p>
        </Card>
      )}
    </div>
  );
}

function OddsCard({ label, odds, impProb, small }: { label: string; odds: number | null; impProb?: number | null; small?: boolean }) {
  if (!odds) return null;
  return (
    <div className={`text-center bg-white/[0.03] rounded-lg border border-white/[0.06] ${small ? 'p-1.5' : 'p-2.5'}`}>
      <p className={`text-muted-foreground ${small ? 'text-[9px]' : 'text-[10px]'}`}>{label}</p>
      <p className={`font-mono font-bold text-emerald-400 ${small ? 'text-xs' : 'text-lg'}`}>{odds.toFixed(2)}</p>
      {impProb !== null && impProb !== undefined && !small && (
        <p className="text-[9px] text-muted-foreground font-mono">{(impProb * 100).toFixed(0)}%</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ANALYSIS TAB — Engine reasoning breakdown
// ═══════════════════════════════════════════════════════════════════════

function AnalysisTab({ data }: { data: MatchDetailResponse }) {
  const tip = data.enginePrediction;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (!tip) {
    return (
      <Card className="glass-card-premium p-5 text-center">
        <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Engine analysis not available</p>
      </Card>
    );
  }

  const sections = [
    { id: 'h2h', icon: <Swords className="w-4 h-4 text-cyan-400" />, title: 'Head to Head', content: tip.analysis.h2h.note },
    { id: 'form', icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, title: 'Form Analysis', content: tip.analysis.form.note },
    { id: 'tactics', icon: <Users className="w-4 h-4 text-amber-400" />, title: 'Tactical Matchup', content: tip.analysis.manager.tacticalMatchup },
    { id: 'gameplay', icon: <Activity className="w-4 h-4 text-violet-400" />, title: 'Expected Gameplay', content: `${tip.analysis.gameplay.expectedStyle} game — ~${tip.analysis.gameplay.expectedGoals} goals expected` },
    { id: 'situation', icon: <Thermometer className="w-4 h-4 text-orange-400" />, title: 'Situational Factors', content: [tip.analysis.situation.weatherNote, tip.analysis.situation.fatigueNote, tip.analysis.situation.travelNote].filter(Boolean).join('. ') || 'No special factors' },
    { id: 'league', icon: <BarChart3 className="w-4 h-4 text-cyan-400" />, title: 'League Context', content: `Avg ${tip.analysis.league.avgGoalsPerMatch} goals/match, O2.5: ${Math.round(tip.analysis.league.over25Rate * 100)}%, ${tip.analysis.league.competitiveness} competitiveness` },
  ];

  return (
    <div className="space-y-4">
      {/* Engine Decision */}
      <Card className={`glass-card-premium p-5 ${tip.tip ? QUALITY_CONFIG[tip.tip.quality].glow : ''}`}>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-violet-400" />
          Engine Decision
        </h3>
        {tip.tip ? (
          <div className="text-center">
            <Badge className={`${QUALITY_CONFIG[tip.tip.quality].bg} ${QUALITY_CONFIG[tip.tip.quality].color} ${QUALITY_CONFIG[tip.tip.quality].border} border text-xs px-3 py-1 flex items-center gap-1.5 mx-auto mb-3`}>
              {QUALITY_CONFIG[tip.tip.quality].icon}
              {QUALITY_CONFIG[tip.tip.quality].label} — {tip.tip.selection}
            </Badge>
            <p className="text-sm text-muted-foreground italic mt-2">&ldquo;{tip.tip.reasoning}&rdquo;</p>
          </div>
        ) : (
          <div className="text-center">
            <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20 border text-xs px-3 py-1">SKIP</Badge>
            <p className="text-sm text-muted-foreground mt-2">{tip.skipReason || 'No edge found'}</p>
          </div>
        )}
      </Card>

      {/* Analysis Sections — Expandable */}
      <Card className="glass-card-premium p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Reasoning Breakdown
        </h3>
        <div className="space-y-1">
          {sections.map((section) => (
            <div key={section.id} className="border border-white/[0.04] rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-2 p-2.5 hover:bg-white/[0.02] transition-colors text-left"
              >
                {section.icon}
                <span className="text-xs font-medium text-slate-300 flex-1">{section.title}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedSections[section.id] ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {expandedSections[section.id] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-2.5 text-[11px] text-muted-foreground">
                      {section.content}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </Card>

      {/* AI Preview */}
      {data.metadata?.aiPreview && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            AI Preview
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{data.metadata.aiPreview}</p>
        </Card>
      )}

      {/* Manager Profiles */}
      {(data.homeManager || data.awayManager) && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            Manager Profiles
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {data.homeManager && <ManagerCard name={data.homeManager.name} profile={data.homeManager} />}
            {data.awayManager && <ManagerCard name={data.awayManager.name} profile={data.awayManager} />}
          </div>
        </Card>
      )}

      {/* Referee */}
      {data.referee && (
        <Card className="glass-card-premium p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            Referee Stats
          </h3>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Avg Yellows</p>
              <p className="text-sm font-mono font-bold text-amber-400">{data.referee.avgYellowPerMatch.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Avg Reds</p>
              <p className="text-sm font-mono font-bold text-red-400">{data.referee.avgRedPerMatch.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Avg Goals</p>
              <p className="text-sm font-mono font-bold text-emerald-400">{data.referee.avgGoalsPerMatch.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Career Games</p>
              <p className="text-sm font-mono font-bold text-cyan-400">{data.referee.careerGames}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function ManagerCard({ name, profile }: { name: string; profile: NonNullable<MatchDetailResponse['homeManager']> }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
      <p className="text-xs font-medium text-slate-300 mb-1">{name}</p>
      {profile.tacticalProfile && <p className="text-[10px] text-muted-foreground mb-1">{profile.tacticalProfile}</p>}
      {profile.preferredFormation && <Badge className="bg-white/[0.06] text-slate-400 text-[9px] px-1.5 py-0 mb-1">{profile.preferredFormation}</Badge>}
      <div className="grid grid-cols-2 gap-1 mt-1 text-[9px]">
        <span className="text-muted-foreground">Win: <span className="text-emerald-400 font-mono">{profile.winPct.toFixed(0)}%</span></span>
        <span className="text-muted-foreground">O2.5: <span className="text-amber-400 font-mono">{profile.over25Pct.toFixed(0)}%</span></span>
        <span className="text-muted-foreground">CS: <span className="text-cyan-400 font-mono">{profile.cleanSheetPct.toFixed(0)}%</span></span>
        <span className="text-muted-foreground">Poss: <span className="text-violet-400 font-mono">{profile.avgPossession.toFixed(0)}%</span></span>
      </div>
    </div>
  );
}

// ── Shared Components ──────────────────────────────────────────────────

function ComparisonBar({ label, homeVal, awayVal, homeLabel, awayLabel, inverse, isPercent }: {
  label: string; homeVal: number; awayVal: number; homeLabel: string; awayLabel: string; inverse?: boolean; isPercent?: boolean;
}) {
  const max = Math.max(homeVal, awayVal, 0.01);
  const homePct = (homeVal / max) * 100;
  const awayPct = (awayVal / max) * 100;
  const homeBetter = inverse ? homeVal < awayVal : homeVal > awayVal;
  const awayBetter = inverse ? awayVal < homeVal : awayVal > homeVal;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono ${homeBetter ? 'text-emerald-400' : ''}`}>{homeVal.toFixed(isPercent ? 0 : 2)}{isPercent ? '%' : ''}</span>
          <span className="text-muted-foreground/30">vs</span>
          <span className={`font-mono ${awayBetter ? 'text-emerald-400' : ''}`}>{awayVal.toFixed(isPercent ? 0 : 2)}{isPercent ? '%' : ''}</span>
        </div>
      </div>
      <div className="flex gap-1">
        <div className="flex-1 flex justify-end">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${homePct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`h-2 rounded-l-full ${homeBetter ? 'bg-emerald-500/60' : 'bg-slate-500/30'}`}
          />
        </div>
        <div className="flex-1">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${awayPct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`h-2 rounded-r-full ${awayBetter ? 'bg-emerald-500/60' : 'bg-slate-500/30'}`}
          />
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, home, away, suffix, isDecimal }: { label: string; home: number; away: number; suffix?: string; isDecimal?: boolean }) {
  const total = home + away || 1;
  const homePct = (home / total) * 100;
  const awayPct = (away / total) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className={`font-mono ${home > away ? 'text-emerald-400' : 'text-slate-300'} w-10 text-left`}>
          {isDecimal ? home.toFixed(1) : home}{suffix}
        </span>
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono ${away > home ? 'text-emerald-400' : 'text-slate-300'} w-10 text-right`}>
          {isDecimal ? away.toFixed(1) : away}{suffix}
        </span>
      </div>
      <div className="flex gap-0.5 h-1.5">
        <div className="flex-1 flex justify-end">
          <motion.div initial={{ width: 0 }} animate={{ width: `${homePct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} className="h-full bg-emerald-500/50 rounded-l-full" />
        </div>
        <div className="flex-1">
          <motion.div initial={{ width: 0 }} animate={{ width: `${awayPct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} className="h-full bg-cyan-500/50 rounded-r-full" />
        </div>
      </div>
    </div>
  );
}

// Sparkles icon used in AnalysisTab
function Sparkles(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
    </svg>
  );
}
