'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Target, Clock, Sparkles, Lock, Flame, CloudRain, UserCheck, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamLogo } from '@/components/team-logo';

export interface FixtureData {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamLogo: string;
  awayTeamLogo: string;
  leagueId: number;
  leagueName: string;
  leagueLogoUrl: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  kickoffTime: string;
  currentMinute: number | null;
  isLocalDerby?: boolean;
  prediction?: {
    market: string;
    selection: string;
    probability: number;
    confidence: string;
    advisorStatus: string;
    quality?: string;
    intelligenceFlags?: string[];
  } | null;
}

interface PremiumFixtureCardProps {
  fixture: FixtureData;
  onClick?: () => void;
  showPrediction?: boolean;
}

function isLiveStatus(status: string): boolean {
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE', 'IN_PLAY', 'HALFTIME', 'SECOND_HALF', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'];
  return liveStatuses.includes(status?.toUpperCase());
}

function isFinishedStatus(status: string): boolean {
  const finishedStatuses = ['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'FINISHED', 'COMPLETE'];
  return finishedStatuses.includes(status?.toUpperCase());
}

function marketChip(market: string): string {
  const m = market?.toLowerCase() || '';
  if (m.includes('1x2') || m.includes('match result') || m.includes('winner')) return '1X2';
  if (m.includes('over') || m.includes('under') || m.includes('goals')) return 'O/U';
  if (m.includes('btts') || m.includes('both teams')) return 'BTTS';
  if (m.includes('handicap') || m.includes('asian')) return 'HC';
  if (m.includes('double chance') || m.includes('dc')) return 'DC';
  if (m.includes('draw no bet') || m.includes('dnb')) return 'DNB';
  return m.slice(0, 3).toUpperCase();
}

const QUALITY_BORDER: Record<string, string> = {
  gold: 'border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.08)]',
  silver: 'border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.06)]',
  bronze: 'border-slate-500/15',
};

const QUALITY_ACCENT: Record<string, string> = {
  gold: 'text-amber-400',
  silver: 'text-cyan-400',
  bronze: 'text-slate-400',
};

const INTELLIGENCE_ICONS: Record<string, React.ReactNode> = {
  derby: <Flame className="w-3 h-3 text-orange-400" />,
  weather: <CloudRain className="w-3 h-3 text-blue-400" />,
  manager_debut: <UserCheck className="w-3 h-3 text-violet-400" />,
  rest_day: <Moon className="w-3 h-3 text-amber-400" />,
};

export function PremiumFixtureCard({ fixture, onClick, showPrediction = true }: PremiumFixtureCardProps) {
  const live = isLiveStatus(fixture.status);
  const finished = isFinishedStatus(fixture.status);
  const hasScore = fixture.homeScore != null && fixture.awayScore != null;
  const hasPrediction = !!fixture.prediction && showPrediction;
  const quality = fixture.prediction?.quality || '';
  const kickoffFormatted = fixture.kickoffTime
    ? new Date(fixture.kickoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : 'TBD';

  const qualityBorder = hasPrediction ? (QUALITY_BORDER[quality] || '') : '';
  const qualityAccent = hasPrediction ? (QUALITY_ACCENT[quality] || 'text-emerald-400') : 'text-emerald-400';

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.995 }}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl border text-left transition-all duration-200',
        live
          ? 'border-red-500/20 bg-gradient-to-br from-red-500/[0.04] to-[#0d1117]'
          : 'border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm',
        qualityBorder,
        'hover:border-emerald-500/25 hover:translate-y-[-1px] hover:shadow-[0_4px_20px_rgba(16,185,129,0.06)]'
      )}
    >
      <div className="relative z-10 p-4">
        {/* ── Row 1: Time/Status + Derby/Intelligence badges ──── */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {/* Status pill */}
            <div
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]',
                live
                  ? 'border-red-500/25 bg-red-500/10 text-red-300'
                  : finished
                    ? 'border-white/[0.08] bg-white/[0.04] text-white/40'
                    : 'border-white/[0.08] bg-white/[0.03] text-slate-400'
              )}
            >
              {live
                ? `LIVE${fixture.currentMinute ? ` · ${fixture.currentMinute}'` : ''}`
                : finished
                  ? 'FT'
                  : kickoffFormatted}
            </div>
            {/* Derby badge */}
            {fixture.isLocalDerby && (
              <span className="flex items-center gap-0.5 text-[9px] text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-1.5 py-0.5 font-medium">
                <Flame className="w-2.5 h-2.5" /> Derby
              </span>
            )}
          </div>
          {/* Intelligence flags */}
          {hasPrediction && fixture.prediction?.intelligenceFlags && fixture.prediction.intelligenceFlags.length > 0 && (
            <div className="flex items-center gap-1">
              {fixture.prediction.intelligenceFlags.slice(0, 3).map((flag) => (
                <span key={flag} className="flex items-center justify-center w-5 h-5 rounded bg-white/[0.04] border border-white/[0.06]" title={flag}>
                  {INTELLIGENCE_ICONS[flag] || <Sparkles className="w-2.5 h-2.5 text-slate-400" />}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Row 2: Teams + Score/Probability ──────────────── */}
        <div className="flex items-center gap-3">
          {/* Teams column */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2.5">
              <TeamLogo teamId={fixture.homeTeamId} name={fixture.homeTeam} src={fixture.homeTeamLogo || undefined} size="md" />
              <span className="text-sm font-semibold text-white truncate">{fixture.homeTeam}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <TeamLogo teamId={fixture.awayTeamId} name={fixture.awayTeam} src={fixture.awayTeamLogo || undefined} size="md" />
              <span className="text-sm font-semibold text-white/70 truncate">{fixture.awayTeam}</span>
            </div>
          </div>

          {/* Score / Probability area */}
          <div className="shrink-0 min-w-[52px] text-right">
            {hasScore ? (
              <div className="space-y-2">
                <p className={cn("text-xl font-black tabular-nums leading-none", live ? "text-emerald-400" : "text-white")}>
                  {fixture.homeScore}
                </p>
                <p className={cn("text-xl font-black tabular-nums leading-none", live ? "text-emerald-400" : "text-white/70")}>
                  {fixture.awayScore}
                </p>
              </div>
            ) : hasPrediction ? (
              <div className="flex flex-col items-end">
                <span className={cn("text-2xl font-black tabular-nums", qualityAccent)}>
                  {Math.round(fixture.prediction!.probability * 100)}
                </span>
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">% conf</span>
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-xl border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
                <Clock className="w-3.5 h-3.5 text-white/20 mb-0.5" />
                <p className="text-sm font-bold text-white/50 tabular-nums">{kickoffFormatted}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 3: Prediction Strip ──────────────────────── */}
        {hasPrediction ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.025] border border-white/[0.05] px-3 py-2">
            <div className={cn(
              "flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]",
              quality === 'gold' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25' :
              quality === 'silver' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
              'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            )}>
              <Target className="w-2.5 h-2.5" />
              {marketChip(fixture.prediction!.market)}
            </div>
            <span className="text-[13px] font-bold text-white truncate flex-1">
              {fixture.prediction!.selection}
            </span>
            {/* Mini confidence bar */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <div className="w-12 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(fixture.prediction!.probability * 100)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={cn(
                    "h-full rounded-full",
                    quality === 'gold' ? 'bg-amber-400' : quality === 'silver' ? 'bg-cyan-400' : 'bg-emerald-400'
                  )}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.015] border border-white/[0.04] px-3 py-2.5">
            <Shield className="w-3.5 h-3.5 text-white/20 shrink-0" />
            <span className="text-[11px] text-white/30">Open match center for full analysis</span>
          </div>
        )}
      </div>
    </motion.button>
  );
}
