'use client';

import React, { useState, use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Clock, Target, BarChart3, Swords, Trophy, Users,
  Shield, Brain, AlertTriangle, Zap, Radio, Flame, TrendingUp,
  Crosshair, Activity, MapPin, Thermometer, Minus, CloudRain,
  Moon, UserCheck, Eye, ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { TeamLogo } from '@/components/team-logo';
import { LeagueLogo } from '@/components/league-logo';
import { ProbabilityBar } from '@/components/probability-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { TipQuality, PunterTipV4Data } from '@/lib/types';

// ── Types ───────────────────────────────────────────────────────────

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
    position: number; teamId: number; teamName: string;
    played: number; won: number; drawn: number; lost: number;
    gf: number; ga: number; gd: number; pts: number;
    xgf: number | null; xga: number | null; xgd: number | null;
    form: string | null;
  } | null;
  awayTeamStanding: {
    position: number; teamId: number; teamName: string;
    played: number; won: number; drawn: number; lost: number;
    gf: number; ga: number; gd: number; pts: number;
    xgf: number | null; xga: number | null; xgd: number | null;
    form: string | null;
  } | null;
  enginePrediction: PunterTipV4Data | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function isLive(s: string) { return ['1H','2H','HT','ET','BT','P','SUSP','INT','LIVE','IN_PLAY','HALFTIME','SECOND_HALF'].includes(s?.toUpperCase()); }
function isFin(s: string) { return ['FT','AET','PEN','WO','AWD','CANC','ABD','FINISHED','COMPLETE'].includes(s?.toUpperCase()); }
function impliedProb(odds: number | null) { return odds && odds > 0 ? 1 / odds : null; }

const Q_CFG: Record<TipQuality, { color: string; bg: string; border: string; label: string }> = {
  gold:   { color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30', label: 'GOLD' },
  silver: { color: 'text-cyan-300',  bg: 'bg-cyan-500/12',  border: 'border-cyan-500/25',  label: 'SILVER' },
  bronze: { color: 'text-slate-300', bg: 'bg-slate-500/12', border: 'border-slate-500/20', label: 'BRONZE' },
  skip:   { color: 'text-slate-500', bg: 'bg-slate-500/8',  border: 'border-slate-500/15', label: 'SKIP' },
};

function FormDot({ ch }: { ch: string }) {
  const c = ch === 'W' ? 'bg-emerald-400' : ch === 'D' ? 'bg-amber-400' : 'bg-red-400';
  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full', c)} />;
}

// ── Tabs ────────────────────────────────────────────────────────────

type TabId = 'prediction' | 'stats' | 'h2h' | 'standings' | 'lineups';
const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'prediction', label: 'Prediction', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'stats',      label: 'Stats',      icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'h2h',        label: 'H2H',        icon: <Swords className="w-3.5 h-3.5" /> },
  { id: 'standings',  label: 'Table',      icon: <Trophy className="w-3.5 h-3.5" /> },
  { id: 'lineups',    label: 'Lineups',    icon: <Users className="w-3.5 h-3.5" /> },
];

// ═══════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function MatchCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('prediction');

  const { data, isLoading } = useQuery<MatchDetailResponse>({
    queryKey: ['match-detail', id],
    queryFn: () => fetch(`/api/match/${id}`).then(r => r.json()),
    staleTime: 30000,
    refetchInterval: 45000,
  });

  const live = isLive(data?.event?.status || '');
  const finished = isFin(data?.event?.status || '');

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* ── Nav Bar ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-[#0a0e1a]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex-1" />
          {data?.event && (
            <div className="flex items-center gap-2">
              <LeagueLogo leagueId={data.event.leagueId} name={data.event.leagueName} size="sm" />
              <span className="text-[11px] text-slate-400 truncate max-w-[150px]">{data.event.leagueName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <MatchSkeleton />
        ) : !data ? (
          <div className="text-center py-20">
            <AlertTriangle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-lg text-slate-400">Match not found</p>
            <Button variant="ghost" onClick={() => router.back()} className="mt-4 text-emerald-400 border border-emerald-500/20">Go Back</Button>
          </div>
        ) : (
          <>
            {/* ── HERO ────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm overflow-hidden mb-6">
              {/* Status bar */}
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {live ? (
                    <Badge className="bg-red-500/15 text-red-300 border-red-500/25 text-[10px]">
                      <span className="relative flex h-1.5 w-1.5 mr-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" /></span>
                      LIVE{data.event.currentMinute ? ` · ${data.event.currentMinute}'` : ''}
                    </Badge>
                  ) : finished ? (
                    <Badge className="bg-white/[0.04] text-slate-400 border-white/[0.08] text-[10px]">FT</Badge>
                  ) : (
                    <Badge className="bg-white/[0.03] text-slate-400 border-white/[0.06] text-[10px]">
                      <Clock className="w-3 h-3 mr-1" />
                      {format(new Date(data.event.eventDate), 'EEE dd MMM · HH:mm')}
                    </Badge>
                  )}
                  {data.event.roundNumber && (
                    <span className="text-[10px] text-slate-500">Matchday {data.event.roundNumber}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {data.event.isLocalDerby && (
                    <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[9px]">
                      <Flame className="w-2.5 h-2.5 mr-0.5" /> Derby
                    </Badge>
                  )}
                  {data.event.weatherDescription && (
                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px]">
                      <CloudRain className="w-2.5 h-2.5 mr-0.5" />
                      {data.event.weatherTemperatureC != null && `${data.event.weatherTemperatureC}°`}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Teams + Score */}
              <div className="px-5 py-6 flex items-center justify-between gap-4">
                <div className="flex flex-col items-center gap-2 flex-1">
                  <TeamLogo teamId={data.event.homeTeamId} name={data.event.homeTeam} size="xl" />
                  <span className="text-sm font-semibold text-center leading-tight">{data.event.homeTeam}</span>
                  {data.homeTeamStanding && (
                    <span className="text-[10px] text-slate-500">{data.homeTeamStanding.position}{getOrd(data.homeTeamStanding.position)} · {data.homeTeamStanding.pts} pts</span>
                  )}
                </div>

                <div className="flex flex-col items-center gap-1">
                  {data.event.homeScore != null && data.event.awayScore != null ? (
                    <div className="flex items-center gap-3">
                      <span className={cn("text-4xl font-black font-mono tabular-nums", live ? "text-emerald-400" : "text-white")}>{data.event.homeScore}</span>
                      <span className="text-2xl text-slate-600">-</span>
                      <span className={cn("text-4xl font-black font-mono tabular-nums", live ? "text-emerald-400" : "text-white")}>{data.event.awayScore}</span>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-400 font-mono">vs</p>
                    </div>
                  )}
                  {data.event.homeScoreHt != null && data.event.awayScoreHt != null && (
                    <span className="text-[10px] text-slate-500 font-mono">HT: {data.event.homeScoreHt} - {data.event.awayScoreHt}</span>
                  )}
                </div>

                <div className="flex flex-col items-center gap-2 flex-1">
                  <TeamLogo teamId={data.event.awayTeamId} name={data.event.awayTeam} size="xl" />
                  <span className="text-sm font-semibold text-center leading-tight">{data.event.awayTeam}</span>
                  {data.awayTeamStanding && (
                    <span className="text-[10px] text-slate-500">{data.awayTeamStanding.position}{getOrd(data.awayTeamStanding.position)} · {data.awayTeamStanding.pts} pts</span>
                  )}
                </div>
              </div>

              {/* Odds bar */}
              {data.odds && (data.odds.homeWin || data.odds.draw || data.odds.awayWin) && (
                <div className="px-5 pb-4">
                  <ProbabilityBar
                    home={impliedProb(data.odds.homeWin) || 0.33}
                    draw={impliedProb(data.odds.draw) || 0.33}
                    away={impliedProb(data.odds.awayWin) || 0.33}
                    homeLabel={data.event.homeTeam.slice(0, 3).toUpperCase()}
                    awayLabel={data.event.awayTeam.slice(0, 3).toUpperCase()}
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                    <span>@{data.odds.homeWin?.toFixed(2) || '—'}</span>
                    <span>@{data.odds.draw?.toFixed(2) || '—'}</span>
                    <span>@{data.odds.awayWin?.toFixed(2) || '—'}</span>
                  </div>
                </div>
              )}

              {/* Venue */}
              {data.event.venue && (
                <div className="px-5 pb-3 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <MapPin className="w-3 h-3" />
                  {data.event.venue.name}{data.event.venue.city ? `, ${data.event.venue.city}` : ''}
                  {data.event.venue.capacity && ` · ${data.event.venue.capacity.toLocaleString()} capacity`}
                </div>
              )}
            </motion.div>

            {/* ── TABS ────────────────────────────────────────── */}
            <div className="flex gap-1.5 mb-5 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all whitespace-nowrap',
                    activeTab === tab.id
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                      : 'bg-white/[0.02] text-slate-400 border-white/[0.06] hover:bg-white/[0.05]'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── TAB CONTENT ─────────────────────────────────── */}
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
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

function getOrd(n: number) { const s = ['th','st','nd','rd']; const v = n % 100; return s[(v-20)%10] || s[v] || s[0]; }

// ═══════════════════════════════════════════════════════════════════════
// PREDICTION TAB
// ═══════════════════════════════════════════════════════════════════════

function PredictionTab({ data }: { data: MatchDetailResponse }) {
  const pred = data.enginePrediction;
  if (!pred) {
    return <EmptyTab icon={<Target className="w-8 h-8" />} title="No prediction available" sub="Sync data and try again" />;
  }

  const hasTip = pred.tip !== null;
  const quality: TipQuality = pred.tip?.quality ?? 'skip';
  const cfg = Q_CFG[quality];

  return (
    <div className="space-y-4">
      {/* The Tip Card */}
      {hasTip && pred.tip ? (
        <div className={cn('rounded-2xl border p-5', cfg.border, cfg.bg)}>
          <div className="flex items-center gap-2 mb-3">
            <Badge className={cn(cfg.bg, cfg.color, cfg.border, 'text-[10px]')}>
              {cfg.label}
            </Badge>
            <span className="text-[11px] text-slate-500">{pred.tip.market}</span>
          </div>
          <p className="text-xl font-bold text-white mb-1">{pred.tip.selection}</p>
          <div className="flex items-center gap-4 text-sm">
            {pred.tip.odds && <span className={cn('font-mono font-bold text-lg', cfg.color)}>@{pred.tip.odds.toFixed(2)}</span>}
            <span className="text-emerald-400 font-mono">+{(pred.tip.edge * 100).toFixed(1)}% edge</span>
            <span className="text-slate-400 font-mono">{Math.round(pred.tip.confidence * 100)}% conf</span>
          </div>
          {pred.tip.reasoning && (
            <p className="mt-3 text-[12px] text-slate-400 italic flex items-start gap-1.5">
              <Brain className="w-3.5 h-3.5 mt-0.5 text-violet-400 shrink-0" />
              &ldquo;{pred.tip.reasoning}&rdquo;
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-500/15 bg-slate-500/[0.03] p-5 text-center">
          <Minus className="w-6 h-6 text-slate-500 mx-auto mb-2" />
          <p className="text-slate-400 font-medium">Engine says: SKIP</p>
          {pred.skipReason && <p className="text-[11px] text-slate-500 mt-1">{pred.skipReason}</p>}
        </div>
      )}

      {/* Probabilities */}
      <Section title="Market Probabilities" icon={<BarChart3 className="w-4 h-4 text-cyan-400" />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Home Win', val: pred.probabilities.homeWin },
            { label: 'Draw', val: pred.probabilities.draw },
            { label: 'Away Win', val: pred.probabilities.awayWin },
            { label: 'Over 2.5', val: pred.probabilities.over25 },
            { label: 'BTTS Yes', val: pred.probabilities.bttsYes },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-xl bg-white/[0.025] border border-white/[0.05] p-2.5 text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
              <p className="text-lg font-bold font-mono text-emerald-400">{Math.round(val * 100)}%</p>
            </div>
          ))}
        </div>
      </Section>

      {/* xG */}
      <Section title="Expected Goals" icon={<Activity className="w-4 h-4 text-emerald-400" />}>
        <div className="flex items-center justify-center gap-8 py-2">
          <div className="text-center">
            <p className="text-2xl font-black font-mono text-emerald-400">{pred.probabilities.homeXg.toFixed(2)}</p>
            <p className="text-[10px] text-slate-500">{data.event.homeTeam}</p>
          </div>
          <span className="text-slate-600 text-lg">—</span>
          <div className="text-center">
            <p className="text-2xl font-black font-mono text-emerald-400">{pred.probabilities.awayXg.toFixed(2)}</p>
            <p className="text-[10px] text-slate-500">{data.event.awayTeam}</p>
          </div>
        </div>
      </Section>

      {/* Intelligence */}
      {(pred.analysis?.situation?.isDerby || pred.analysis?.situation?.weatherNote || pred.analysis?.situation?.fatigueNote) && (
        <Section title="Intelligence Modules" icon={<Zap className="w-4 h-4 text-violet-400" />}>
          <div className="flex flex-wrap gap-1.5">
            {pred.analysis.situation.isDerby && <IntelBadge icon={<Flame className="w-3 h-3" />} label="Derby" color="orange" />}
            {pred.analysis.situation.weatherNote && <IntelBadge icon={<CloudRain className="w-3 h-3" />} label={pred.analysis.situation.weatherNote} color="blue" />}
            {pred.analysis.situation.fatigueNote && <IntelBadge icon={<Moon className="w-3 h-3" />} label={pred.analysis.situation.fatigueNote} color="amber" />}
          </div>
        </Section>
      )}
    </div>
  );
}

function IntelBadge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  };
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium', colors[color])}>
      {icon} {label}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STATS TAB
// ═══════════════════════════════════════════════════════════════════════

function StatsTab({ data }: { data: MatchDetailResponse }) {
  const hs = data.homeTeamStanding;
  const as_ = data.awayTeamStanding;
  const s = data.stats;
  const pred = data.enginePrediction;

  const hasStandings = hs && as_;
  const hasLiveStats = !!s;

  if (!hasStandings && !hasLiveStats) {
    return <EmptyTab icon={<BarChart3 className="w-8 h-8" />} title="No stats available" sub="Sync data to populate team statistics" />;
  }

  // Derived stats from standings
  const homeGpg = hs ? (hs.gf / Math.max(1, hs.played)).toFixed(2) : '—';
  const awayGpg = as_ ? (as_.gf / Math.max(1, as_.played)).toFixed(2) : '—';
  const homeCapg = hs ? (hs.ga / Math.max(1, hs.played)).toFixed(2) : '—';
  const awayCapg = as_ ? (as_.ga / Math.max(1, as_.played)).toFixed(2) : '—';
  const homeXgpg = hs?.xgf ? (hs.xgf / Math.max(1, hs.played)).toFixed(2) : '—';
  const awayXgpg = as_?.xgf ? (as_.xgf / Math.max(1, as_.played)).toFixed(2) : '—';
  const homeXgApg = hs?.xga ? (hs.xga / Math.max(1, hs.played)).toFixed(2) : '—';
  const awayXgApg = as_?.xga ? (as_.xga / Math.max(1, as_.played)).toFixed(2) : '—';

  return (
    <div className="space-y-4">
      {/* Form */}
      {hasStandings && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-4">
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Recent Form
          </h3>
          <div className="grid grid-cols-2 gap-6">
            {[
              { team: data.event.homeTeam, st: hs! },
              { team: data.event.awayTeam, st: as_! },
            ].map(({ team, st }) => (
              <div key={team}>
                <p className="text-sm font-medium text-white mb-2">{team}</p>
                <div className="flex gap-1 mb-2">
                  {(st.form || '').split('').slice(0, 5).map((ch: string, i: number) => (
                    <FormDot key={i} ch={ch} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-emerald-500/10 p-1.5">
                    <p className="text-lg font-bold font-mono text-emerald-400">{st.won}</p>
                    <p className="text-[9px] text-slate-500">Won</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-1.5">
                    <p className="text-lg font-bold font-mono text-amber-400">{st.drawn}</p>
                    <p className="text-[9px] text-slate-500">Drawn</p>
                  </div>
                  <div className="rounded-lg bg-red-500/10 p-1.5">
                    <p className="text-lg font-bold font-mono text-red-400">{st.lost}</p>
                    <p className="text-[9px] text-slate-500">Lost</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Season Stats Comparison */}
      {hasStandings && (() => {
        const rows = [
          { label: 'Position', home: `${hs!.position}${getOrd(hs!.position)}`, away: `${as_!.position}${getOrd(as_!.position)}`, hVal: 21 - hs!.position, aVal: 21 - as_!.position },
          { label: 'Points', home: hs!.pts, away: as_!.pts, hVal: hs!.pts, aVal: as_!.pts },
          { label: 'Played', home: hs!.played, away: as_!.played, hVal: hs!.played, aVal: as_!.played },
          { label: 'Goals/Game', home: homeGpg, away: awayGpg, hVal: parseFloat(homeGpg) || 0, aVal: parseFloat(awayGpg) || 0 },
          { label: 'Conceded/Game', home: homeCapg, away: awayCapg, hVal: parseFloat(awayCapg) || 0, aVal: parseFloat(homeCapg) || 0 },
          { label: 'xG/Game', home: homeXgpg, away: awayXgpg, hVal: parseFloat(homeXgpg) || 0, aVal: parseFloat(awayXgpg) || 0 },
          { label: 'xGA/Game', home: homeXgApg, away: awayXgApg, hVal: parseFloat(awayXgApg) || 0, aVal: parseFloat(homeXgApg) || 0 },
          { label: 'Goal Diff', home: hs!.gd > 0 ? `+${hs!.gd}` : String(hs!.gd), away: as_!.gd > 0 ? `+${as_!.gd}` : String(as_!.gd), hVal: hs!.gd, aVal: as_!.gd },
        ];

        return (
          <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-0 px-4 py-3 border-b border-white/[0.06] text-[10px] text-slate-500 uppercase tracking-wider">
              <span>{data.event.homeTeam}</span>
              <span className="text-center px-4">Season Stats</span>
              <span className="text-right">{data.event.awayTeam}</span>
            </div>
            {rows.map((row, i) => {
              const total = Math.abs(row.hVal) + Math.abs(row.aVal);
              const hPct = total > 0 ? (Math.abs(row.hVal) / total) * 100 : 50;
              return (
                <div key={i} className="px-4 py-2.5 border-b border-white/[0.03]">
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-0 items-center mb-1.5">
                    <span className={cn("text-sm font-mono", row.hVal > row.aVal ? 'text-emerald-400 font-bold' : 'text-slate-300')}>{row.home}</span>
                    <span className="text-[10px] text-slate-500 px-4 text-center">{row.label}</span>
                    <span className={cn("text-sm font-mono text-right", row.aVal > row.hVal ? 'text-emerald-400 font-bold' : 'text-slate-300')}>{row.away}</span>
                  </div>
                  <div className="flex h-1 rounded-full overflow-hidden bg-white/[0.04]">
                    <div className="h-full bg-emerald-500/60 rounded-l-full" style={{ width: `${hPct}%` }} />
                    <div className="h-full bg-cyan-500/60 rounded-r-full" style={{ width: `${100 - hPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Model Prediction Summary */}
      {pred && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-4">
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" /> Model Assessment
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-white/[0.025] border border-white/[0.05] p-2.5 text-center">
              <p className="text-[10px] text-slate-500">Expected Style</p>
              <p className="text-sm font-medium text-white capitalize">{pred.analysis?.gameplay?.expectedStyle || '—'}</p>
            </div>
            <div className="rounded-xl bg-white/[0.025] border border-white/[0.05] p-2.5 text-center">
              <p className="text-[10px] text-slate-500">Expected Goals</p>
              <p className="text-sm font-mono font-bold text-emerald-400">{pred.analysis?.gameplay?.expectedGoals?.toFixed(1) || '—'}</p>
            </div>
            <div className="rounded-xl bg-white/[0.025] border border-white/[0.05] p-2.5 text-center">
              <p className="text-[10px] text-slate-500">Data Quality</p>
              <p className="text-sm font-mono font-bold text-cyan-400">{Math.round((pred.analysis?.dataQuality || 0) * 100)}%</p>
            </div>
            <div className="rounded-xl bg-white/[0.025] border border-white/[0.05] p-2.5 text-center">
              <p className="text-[10px] text-slate-500">Model Agreement</p>
              <p className="text-sm font-mono font-bold text-amber-400">{Math.round((pred.modelAgreement || 0) * 100)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Live Match Stats (only when available — during/after match) */}
      {hasLiveStats && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-red-400" /> Match Stats
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-0 px-4 py-2 border-b border-white/[0.06] text-[10px] text-slate-500 uppercase tracking-wider">
            <span>{data.event.homeTeam}</span>
            <span className="text-center px-4">Stat</span>
            <span className="text-right">{data.event.awayTeam}</span>
          </div>
          {[
            { label: 'Possession', home: `${s!.homeBallPossession}%`, away: `${s!.awayBallPossession}%`, hVal: s!.homeBallPossession, aVal: s!.awayBallPossession },
            { label: 'Total Shots', home: s!.homeTotalShots, away: s!.awayTotalShots, hVal: s!.homeTotalShots, aVal: s!.awayTotalShots },
            { label: 'xG', home: s!.homeXg?.toFixed(2) || '—', away: s!.awayXg?.toFixed(2) || '—', hVal: s!.homeXg, aVal: s!.awayXg },
            { label: 'Corners', home: s!.homeCorners, away: s!.awayCorners, hVal: s!.homeCorners, aVal: s!.awayCorners },
            { label: 'Fouls', home: s!.homeFouls, away: s!.awayFouls, hVal: s!.homeFouls, aVal: s!.awayFouls },
          ].map((row, i) => {
            const total = (row.hVal || 0) + (row.aVal || 0);
            const hPct = total > 0 ? ((row.hVal || 0) / total) * 100 : 50;
            return (
              <div key={i} className="px-4 py-2.5 border-b border-white/[0.03]">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-0 items-center mb-1.5">
                  <span className={cn("text-sm font-mono", (row.hVal || 0) > (row.aVal || 0) ? 'text-emerald-400 font-bold' : 'text-slate-300')}>{row.home}</span>
                  <span className="text-[10px] text-slate-500 px-4 text-center">{row.label}</span>
                  <span className={cn("text-sm font-mono text-right", (row.aVal || 0) > (row.hVal || 0) ? 'text-emerald-400 font-bold' : 'text-slate-300')}>{row.away}</span>
                </div>
                <div className="flex h-1 rounded-full overflow-hidden bg-white/[0.04]">
                  <div className="h-full bg-emerald-500/60 rounded-l-full" style={{ width: `${hPct}%` }} />
                  <div className="h-full bg-cyan-500/60 rounded-r-full" style={{ width: `${100 - hPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// H2H TAB
// ═══════════════════════════════════════════════════════════════════════

function H2HTab({ data }: { data: MatchDetailResponse }) {
  if (data.h2h.length === 0) return <EmptyTab icon={<Swords className="w-8 h-8" />} title="No H2H data" sub="Sync H2H to see previous meetings" />;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">{data.h2h.length} previous {data.h2h.length === 1 ? 'meeting' : 'meetings'}</p>
      {data.h2h.map((match, i) => {
        const isHomeWin = match.homeScore > match.awayScore;
        const isDraw = match.homeScore === match.awayScore;
        return (
          <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="rounded-xl border border-white/[0.06] bg-[#0d1117]/80 p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium truncate", match.homeTeamId === data.event.homeTeamId ? 'text-white' : 'text-slate-400')}>{match.homeTeam}</p>
                <p className={cn("text-sm font-medium truncate", match.awayTeamId === data.event.awayTeamId ? 'text-white' : 'text-slate-400')}>{match.awayTeam}</p>
              </div>
              <div className="text-center min-w-[50px]">
                <p className="text-lg font-black font-mono text-white">{match.homeScore} - {match.awayScore}</p>
              </div>
              <div className="text-right min-w-[70px]">
                <p className="text-[10px] text-slate-500">{format(new Date(match.eventDate), 'dd MMM yyyy')}</p>
                <Badge className={cn('text-[9px] mt-0.5', isHomeWin ? 'bg-emerald-500/10 text-emerald-400' : isDraw ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400')}>
                  {isHomeWin ? 'H' : isDraw ? 'D' : 'A'}
                </Badge>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STANDINGS TAB
// ═══════════════════════════════════════════════════════════════════════

function StandingsTab({ data }: { data: MatchDetailResponse }) {
  if (data.standings.length === 0) return <EmptyTab icon={<Trophy className="w-8 h-8" />} title="No standings data" />;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <LeagueLogo leagueId={data.event.leagueId} name={data.event.leagueName} size="sm" />
        <span className="text-xs text-slate-300 font-medium">{data.event.leagueName}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] text-slate-500 uppercase tracking-wider border-b border-white/[0.04]">
              <th className="py-2 px-3 text-left w-6">#</th>
              <th className="py-2 px-2 text-left">Team</th>
              <th className="py-2 px-2 text-center w-6">P</th>
              <th className="py-2 px-2 text-center w-6">W</th>
              <th className="py-2 px-2 text-center w-6">D</th>
              <th className="py-2 px-2 text-center w-6">L</th>
              <th className="py-2 px-2 text-center w-8">Pts</th>
            </tr>
          </thead>
          <tbody>
            {data.standings.map((team) => {
              const isMT = team.teamId === data.event.homeTeamId || team.teamId === data.event.awayTeamId;
              return (
                <tr key={team.teamId} className={cn('border-b border-white/[0.03] transition-colors', isMT ? 'bg-emerald-500/[0.04]' : 'hover:bg-white/[0.02]')}>
                  <td className={cn('py-2 px-3 font-mono', isMT ? 'text-emerald-400' : 'text-slate-500')}>{team.position}</td>
                  <td className={cn('py-2 px-2 truncate max-w-[140px]', isMT ? 'text-white font-semibold' : 'text-slate-300')}>{team.teamName}</td>
                  <td className="py-2 px-2 text-center font-mono text-slate-400">{team.played}</td>
                  <td className="py-2 px-2 text-center font-mono text-slate-400">{team.won}</td>
                  <td className="py-2 px-2 text-center font-mono text-slate-400">{team.drawn}</td>
                  <td className="py-2 px-2 text-center font-mono text-slate-400">{team.lost}</td>
                  <td className={cn('py-2 px-2 text-center font-mono font-bold', isMT ? 'text-emerald-400' : 'text-white')}>{team.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LINEUPS TAB
// ═══════════════════════════════════════════════════════════════════════

function LineupsTab({ data }: { data: MatchDetailResponse }) {
  const lu = data.lineup;
  if (!lu || lu.lineupStatus === 'unknown') return <EmptyTab icon={<Users className="w-8 h-8" />} title="Lineups not available" sub="Usually confirmed 1-2 hours before kick-off" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <PitchFormation formation={lu.homeFormation} players={lu.homePlayers} teamName={data.event.homeTeam} isHome />
        <PitchFormation formation={lu.awayFormation} players={lu.awayPlayers} teamName={data.event.awayTeam} isHome={false} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <PlayerList players={lu.homePlayers} teamName={data.event.homeTeam} />
        <PlayerList players={lu.awayPlayers} teamName={data.event.awayTeam} />
      </div>
    </div>
  );
}

function PitchFormation({ formation, players, teamName, isHome }: { formation: string | null; players: any[] | null; teamName: string; isHome: boolean }) {
  const lines = formation ? formation.split('-').map(Number) : [4,4,2];
  return (
    <div className="pitch p-3 rounded-xl">
      <p className="text-[10px] text-emerald-400 font-medium mb-2 text-center">{teamName} ({formation || '4-4-2'})</p>
      <div className="flex flex-col items-center gap-2 py-2" style={{ minHeight: '140px' }}>
        <div className="flex justify-center">
          <PlayerDot name={players?.[0]?.playerName || 'GK'} isHome={isHome} />
        </div>
        {lines.map((count, li) => (
          <div key={li} className="flex justify-center gap-1">
            {Array.from({ length: count }).map((_, pi) => {
              const idx = 1 + lines.slice(0, li).reduce((a, b) => a + b, 0) + pi;
              return <PlayerDot key={pi} name={(players?.[idx]?.playerName || '').split(' ').pop() || `P${idx+1}`} isHome={isHome} />;
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
      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold', isHome ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' : 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40')}>
        {name.slice(0, 2).toUpperCase()}
      </div>
      <span className="text-[7px] text-slate-500 mt-0.5 max-w-[40px] truncate text-center">{name}</span>
    </div>
  );
}

function PlayerList({ players, teamName }: { players: any[] | null; teamName: string }) {
  if (!players?.length) return <div className="rounded-xl border border-white/[0.06] bg-[#0d1117]/80 p-4 text-center"><p className="text-xs text-slate-500">No player data</p></div>;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0d1117]/80 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06]"><p className="text-[10px] text-slate-500 uppercase tracking-wider">{teamName}</p></div>
      <div className="divide-y divide-white/[0.03] max-h-56 overflow-y-auto">
        {players.map((p: any, i: number) => (
          <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-white/[0.02]">
            <span className="text-slate-500 font-mono w-5 text-right">{p.shirtNumber || i+1}</span>
            <span className="text-slate-300 truncate">{p.playerName || `Player ${i+1}`}</span>
            {p.position && <span className="ml-auto text-[9px] text-slate-500">{p.position}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared helpers ──────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-xs font-medium text-slate-300 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyTab({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-10 text-center">
      <div className="text-slate-600 mx-auto mb-3 w-fit">{icon}</div>
      <p className="text-sm text-slate-400">{title}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function MatchSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117] p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-16 rounded-full glass-skeleton" />
          <Skeleton className="h-5 w-20 glass-skeleton" />
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex flex-col items-center gap-2"><Skeleton className="h-12 w-12 rounded-full glass-skeleton" /><Skeleton className="h-4 w-24 glass-skeleton" /></div>
          <Skeleton className="h-12 w-24 glass-skeleton" />
          <div className="flex flex-col items-center gap-2"><Skeleton className="h-12 w-12 rounded-full glass-skeleton" /><Skeleton className="h-4 w-24 glass-skeleton" /></div>
        </div>
      </div>
      <div className="flex gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 glass-skeleton" />)}</div>
      <Skeleton className="h-48 w-full rounded-2xl glass-skeleton" />
    </div>
  );
}
