'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Target, ChevronRight, Clock, Sparkles, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamLogo } from '@/components/team-logo';
import { LeagueLogo } from '@/components/league-logo';

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
  prediction?: {
    market: string;
    selection: string;
    probability: number;
    confidence: string;
    advisorStatus: string;
  } | null;
}

interface PremiumFixtureCardProps {
  fixture: FixtureData;
  onClick?: () => void;
  showPrediction?: boolean;
}

// ── Status helpers ──────────────────────────────────────────────────

function isLiveStatus(status: string): boolean {
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE', 'IN_PLAY', 'HALFTIME', 'SECOND_HALF', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'];
  return liveStatuses.includes(status?.toUpperCase());
}

function isFinishedStatus(status: string): boolean {
  const finishedStatuses = ['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'FINISHED', 'COMPLETE'];
  return finishedStatuses.includes(status?.toUpperCase());
}

// ── Confidence color map ────────────────────────────────────────────

function confidenceColor(confidence: string): string {
  const c = confidence?.toLowerCase() || '';
  if (c.includes('high') || c.includes('strong')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
  if (c.includes('medium') || c.includes('moderate')) return 'bg-amber-500/15 text-amber-300 border-amber-500/25';
  if (c.includes('low') || c.includes('weak')) return 'bg-red-500/15 text-red-300 border-red-500/25';
  return 'bg-white/[0.04] text-white/40 border-white/[0.08]';
}

function marketFamilyChip(market: string): string {
  const m = market?.toLowerCase() || '';
  if (m.includes('1x2') || m.includes('match result') || m.includes('winner')) return '1X2';
  if (m.includes('over') || m.includes('under') || m.includes('goals')) return 'O/U';
  if (m.includes('btts') || m.includes('both teams')) return 'BTTS';
  if (m.includes('handicap') || m.includes('asian')) return 'HC';
  if (m.includes('double chance') || m.includes('dc')) return 'DC';
  if (m.includes('draw no bet') || m.includes('dnb')) return 'DNB';
  return m.slice(0, 3).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════
// PREMIUM FIXTURE CARD
// ═══════════════════════════════════════════════════════════════════════

export function PremiumFixtureCard({ fixture, onClick, showPrediction = true }: PremiumFixtureCardProps) {
  const live = isLiveStatus(fixture.status);
  const finished = isFinishedStatus(fixture.status);
  const hasScore = fixture.homeScore != null && fixture.awayScore != null;
  const hasPrediction = !!fixture.prediction && showPrediction;
  const kickoffFormatted = fixture.kickoffTime
    ? new Date(fixture.kickoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : 'TBD';

  // Status pill styling
  const statusPill = live
    ? 'border-red-500/20 bg-red-500/10 text-red-300'
    : finished
      ? 'border-white/[0.08] bg-white/[0.04] text-white/40'
      : 'border-white/[0.08] bg-white/[0.03] text-white/55';

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'group relative w-full overflow-hidden rounded-[24px] border text-left transition-all',
        live
          ? 'border-red-500/15 bg-red-500/[0.03]'
          : 'border-white/[0.06] bg-[#0d1117]',
        hasPrediction && 'shadow-[0_0_0_1px_rgba(16,231,116,0.05)]',
        'hover:border-emerald-500/20 hover:bg-white/[0.04]'
      )}
    >
      {/* Background radial gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className={cn(
            'absolute inset-0 opacity-100',
            hasPrediction
              ? 'bg-[radial-gradient(circle_at_top_right,rgba(16,231,116,0.08),transparent_45%)]'
              : 'bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.03),transparent_45%)]'
          )}
        />
      </div>

      <div className="relative z-10 p-4">
        {/* ── Top row: Status pill + League badge ───────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                statusPill
              )}
            >
              {live
                ? `LIVE${fixture.currentMinute ? ` · ${fixture.currentMinute}'` : ''}`
                : finished
                  ? 'FT'
                  : kickoffFormatted}
            </div>
            {!hasPrediction && !showPrediction && (
              <div className="hidden sm:flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-white/35">
                <Lock className="w-3 h-3" /> Premium
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <LeagueLogo
              leagueId={fixture.leagueId}
              name={fixture.leagueName}
              src={fixture.leagueLogoUrl || undefined}
              size="sm"
            />
            <span className="text-[10px] text-white/30 truncate max-w-[80px] sm:max-w-[120px]">
              {fixture.leagueName}
            </span>
          </div>
        </div>

        {/* ── Middle: Two team rows ──────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 items-start">
          <div className="min-w-0 space-y-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo
                teamId={fixture.homeTeamId}
                name={fixture.homeTeam}
                src={fixture.homeTeamLogo || undefined}
                size="sm"
              />
              <span className="text-sm font-semibold text-white truncate">
                {fixture.homeTeam}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo
                teamId={fixture.awayTeamId}
                name={fixture.awayTeam}
                src={fixture.awayTeamLogo || undefined}
                size="sm"
              />
              <span className="text-sm font-semibold text-white/72 truncate">
                {fixture.awayTeam}
              </span>
            </div>
          </div>

          {/* Score area */}
          <div className="shrink-0 text-right min-w-[60px]">
            {hasScore ? (
              <div className="space-y-2">
                <p className="text-lg font-black text-white tabular-nums leading-none">
                  {fixture.homeScore}
                </p>
                <p className="text-lg font-black text-white/70 tabular-nums leading-none">
                  {fixture.awayScore}
                </p>
              </div>
            ) : hasPrediction ? (
              <div className="space-y-1.5">
                <p className="text-sm font-black text-emerald-400 tabular-nums">
                  {Math.round(fixture.prediction!.probability * 100)}%
                </p>
                <p className="text-[9px] text-white/25 uppercase tracking-wider">Model</p>
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-white/20 mb-0.5" />
                <p className="text-sm font-bold text-white/60">{kickoffFormatted}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom: Prediction area ──────────────────────────────── */}
        <div className="mt-4 rounded-[20px] border border-white/[0.05] bg-black/10 px-3.5 py-3">
          {hasPrediction ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">
                  <Target className="w-3 h-3" /> Pick
                </div>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
                  {marketFamilyChip(fixture.prediction!.market)}
                </span>
              </div>
              <p className="mt-2 text-[15px] font-black leading-snug text-white">
                {fixture.prediction!.selection}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]',
                    confidenceColor(fixture.prediction!.confidence)
                  )}
                >
                  {fixture.prediction!.confidence}
                </span>
                {fixture.prediction!.probability > 0.6 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                    <Sparkles className="w-3 h-3" /> Value
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-white/25 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-white/70">No prediction yet</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                  Open match center to view stats, lineups, and analysis.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
