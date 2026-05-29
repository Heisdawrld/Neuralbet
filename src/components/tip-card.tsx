'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PunterTipV4Data, TheTipData, TipQuality } from '@/lib/types';
import { format } from 'date-fns';
import {
  Clock, Shield, ChevronDown, Brain, Crosshair,
  Flame, TrendingUp, Minus, Eye,
  Swords, Thermometer, Wind, Users, BarChart3,
  AlertTriangle, CheckCircle2, Zap, Target,
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Quality Config ──────────────────────────────────────────────────

const QUALITY_CONFIG: Record<TipQuality, {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  ring: string;
  gradient: string;
  oddsColor: string;
}> = {
  gold: {
    icon: <Flame className="w-4 h-4" />,
    label: 'GOLD',
    color: 'text-amber-300',
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/40',
    glow: 'gold-glow',
    ring: 'ring-1 ring-amber-500/30',
    gradient: 'from-amber-500/10 via-transparent to-amber-500/5',
    oddsColor: 'text-amber-400',
  },
  silver: {
    icon: <Crosshair className="w-4 h-4" />,
    label: 'SILVER',
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/15',
    border: 'border-cyan-500/30',
    glow: 'silver-glow',
    ring: 'ring-1 ring-cyan-500/20',
    gradient: 'from-cyan-500/8 via-transparent to-cyan-500/4',
    oddsColor: 'text-cyan-400',
  },
  bronze: {
    icon: <TrendingUp className="w-4 h-4" />,
    label: 'BRONZE',
    color: 'text-slate-300',
    bg: 'bg-slate-500/15',
    border: 'border-slate-500/30',
    glow: 'bronze-glow',
    ring: 'ring-1 ring-slate-500/15',
    gradient: 'from-slate-500/5 via-transparent to-slate-500/3',
    oddsColor: 'text-slate-300',
  },
  skip: {
    icon: <Minus className="w-4 h-4" />,
    label: 'SKIP',
    color: 'text-slate-500',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    glow: '',
    ring: '',
    gradient: '',
    oddsColor: 'text-slate-500',
  },
};

const RISK_COLORS: Record<string, string> = {
  'very-low': 'text-emerald-400',
  'low': 'text-emerald-400',
  'medium': 'text-amber-400',
  'high': 'text-orange-400',
  'very-high': 'text-red-400',
};

const RISK_BG: Record<string, string> = {
  'very-low': 'bg-emerald-500/10 border-emerald-500/20',
  'low': 'bg-emerald-500/10 border-emerald-500/20',
  'medium': 'bg-amber-500/10 border-amber-500/20',
  'high': 'bg-orange-500/10 border-orange-500/20',
  'very-high': 'bg-red-500/10 border-red-500/20',
};

// ── Mini Confidence Ring ────────────────────────────────────────────

function MiniConfidenceRing({ value, size = 28 }: { value: number; size?: number }) {
  const pct = Math.round(value * 100);
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value);
  const color = pct > 70 ? '#10b981' : pct > 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="donut-animate" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-white">
        {pct}
      </span>
    </div>
  );
}

// ── Form Letter Component ────────────────────────────────────────────

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

// ── Mini Edge Meter ──────────────────────────────────────────────────

function MiniEdgeMeter({ value, max = 0.15 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
        />
      </div>
      <span className="text-[9px] font-mono text-emerald-400">+{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

// ── Main TipCard Component ──────────────────────────────────────────

interface TipCardProps {
  tip: PunterTipV4Data;
  onMatchClick?: () => void;
}

export function TipCard({ tip, onMatchClick }: TipCardProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const hasTip = tip.tip !== null;
  const quality: TipQuality = tip.tip?.quality ?? 'skip';
  const config = QUALITY_CONFIG[quality];
  const isSkip = quality === 'skip';

  const handleClick = (e: React.MouseEvent) => {
    if (isSkip) {
      setShowAnalysis(!showAnalysis);
      return;
    }
    const target = e.target as HTMLElement;
    const isTeamsArea = target.closest('[data-teams-area]');
    if (isTeamsArea && onMatchClick) {
      onMatchClick();
    } else if (onMatchClick) {
      onMatchClick();
    } else {
      setShowAnalysis(!showAnalysis);
    }
  };

  return (
    <Card
      className={`glass-card-premium hover-lift transition-all duration-300 cursor-pointer ${config.glow} ${config.ring} ${
        isSkip ? 'opacity-60 hover:opacity-80' : ''
      }`}
      onClick={handleClick}
    >
      {/* Gradient overlay for quality */}
      {hasTip && config.gradient && (
        <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} pointer-events-none rounded-xl`} />
      )}

      <div className="relative p-4">
        {/* ── Header Row ─────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* League & Time */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground truncate">
                {tip.leagueName}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(tip.eventDate), 'HH:mm')}
              </span>
              {hasTip && (
                <Badge className={`${config.bg} ${config.color} ${config.border} border text-[9px] px-1.5 py-0 flex items-center gap-0.5`}>
                  {config.icon}
                  {config.label}
                </Badge>
              )}
            </div>

            {/* Teams — Clickable area */}
            <div className="flex items-center justify-between" data-teams-area>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold truncate max-w-[160px] hover:text-emerald-300 transition-colors">{tip.homeTeam}</p>
                <p className="text-sm font-semibold truncate max-w-[160px] hover:text-emerald-300 transition-colors">{tip.awayTeam}</p>
              </div>

              {/* Mini probability bars */}
              <div className="flex flex-col items-end gap-0.5 text-[10px] font-mono text-muted-foreground">
                <span>{Math.round(tip.probabilities.homeWin * 100)}%</span>
                <span>{Math.round(tip.probabilities.draw * 100)}%</span>
                <span>{Math.round(tip.probabilities.awayWin * 100)}%</span>
              </div>
            </div>
          </div>

          {/* ── THE TIP — One-line display + confidence ring ──── */}
          {hasTip && tip.tip ? (
            <div className="flex-shrink-0 flex items-center gap-2">
              <MiniConfidenceRing value={tip.tip.confidence} size={32} />
              <div className="text-right min-w-[100px]">
                <p className="text-sm font-bold text-white leading-tight mb-0.5">
                  {tip.tip.selection}
                </p>
                {tip.tip.odds && (
                  <p className={`text-lg font-mono font-bold ${config.oddsColor}`}>
                    @{tip.tip.odds.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-shrink-0 flex items-center gap-2">
              <Minus className="w-5 h-5 text-slate-600" />
              <div className="text-right">
                <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20 border text-[10px] px-2 py-0 flex items-center gap-1">
                  SKIP
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* ── One-line tip display ───────────────────────────── */}
        {hasTip && tip.tip && (
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">{tip.tip.market}</span>
            <span className="text-muted-foreground/40">@</span>
            <span className={`font-mono font-bold ${config.oddsColor}`}>
              {tip.tip.odds?.toFixed(2)}
            </span>
            <span className="text-emerald-400 font-mono">+{(tip.tip.edge * 100).toFixed(1)}% edge</span>
            <div className="ml-auto flex items-center gap-2">
              {/* Risk */}
              <Badge className={`${RISK_BG[tip.tip.riskLevel]} ${RISK_COLORS[tip.tip.riskLevel]} text-[9px] px-1.5 py-0 flex items-center gap-0.5`}>
                <Shield className="w-2.5 h-2.5" />
                {tip.tip.riskLevel.replace('-', ' ')}
              </Badge>
              {tip.tip.isSafePlay && (
                <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px] px-1.5 py-0 flex items-center gap-0.5">
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
        )}

        {/* ── Skip reason (one-line) ─────────────────────────── */}
        {!hasTip && tip.skipReason && (
          <p className="mt-1 text-[10px] text-slate-500 italic truncate">
            {tip.skipReason}
          </p>
        )}

        {/* ── Edge Meter ─────────────────────────────────────── */}
        {hasTip && tip.tip && (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Edge</span>
              <MiniEdgeMeter value={tip.tip.edge} />
            </div>
            <span className="text-[9px] text-muted-foreground ml-auto">
              Model agreement: {Math.round(tip.modelAgreement * 100)}%
            </span>
          </div>
        )}

        {/* ── Expand Toggle ────────────────────────────────────── */}
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
          <ChevronDown className={`w-3 h-3 transition-transform ${showAnalysis ? 'rotate-180' : ''}`} />
          <span>Full Analysis</span>
        </div>

        {/* ── Expanded Analysis Panel ──────────────────────────── */}
        <AnimatePresence>
          {showAnalysis && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                {/* Reasoning */}
                {hasTip && tip.tip && (
                  <p className="text-[11px] text-muted-foreground italic flex items-start gap-1.5">
                    <Brain className="w-3 h-3 mt-0.5 flex-shrink-0 text-violet-400" />
                    &ldquo;{tip.tip.reasoning}&rdquo;
                  </p>
                )}

                {/* H2H */}
                <AnalysisSection icon={<Swords className="w-3 h-3" />} title="Head to Head">
                  {tip.analysis.h2h.totalMeetings > 0 ? (
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-300">{tip.analysis.h2h.note}</p>
                      <div className="flex gap-3 text-[10px]">
                        <span className="text-emerald-400">O2.5: {Math.round(tip.analysis.h2h.over25Rate * 100)}%</span>
                        <span className="text-cyan-400">BTTS: {Math.round(tip.analysis.h2h.bttsRate * 100)}%</span>
                        <span className="text-slate-400">Avg: {tip.analysis.h2h.avgGoals} goals</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500">No previous meetings found</p>
                  )}
                </AnalysisSection>

                {/* Last 5 + Form */}
                <AnalysisSection icon={<BarChart3 className="w-3 h-3" />} title="Form & Last 5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">{tip.homeTeam}</p>
                      <div className="flex gap-0.5 mb-1">
                        {tip.analysis.last5.home.form.split('').map((l, i) => (
                          <FormLetter key={i} letter={l} />
                        ))}
                      </div>
                      <p className="text-[9px] text-slate-400">
                        {tip.analysis.last5.home.wins}W {tip.analysis.last5.home.draws}D {tip.analysis.last5.home.losses}L
                        {' · '}
                        <span className={tip.analysis.form.homeTrend === 'rising' ? 'text-emerald-400' : tip.analysis.form.homeTrend === 'declining' ? 'text-red-400' : 'text-slate-400'}>
                          {tip.analysis.form.homeTrend}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">{tip.awayTeam}</p>
                      <div className="flex gap-0.5 mb-1">
                        {tip.analysis.last5.away.form.split('').map((l, i) => (
                          <FormLetter key={i} letter={l} />
                        ))}
                      </div>
                      <p className="text-[9px] text-slate-400">
                        {tip.analysis.last5.away.wins}W {tip.analysis.last5.away.draws}D {tip.analysis.last5.away.losses}L
                        {' · '}
                        <span className={tip.analysis.form.awayTrend === 'rising' ? 'text-emerald-400' : tip.analysis.form.awayTrend === 'declining' ? 'text-red-400' : 'text-slate-400'}>
                          {tip.analysis.form.awayTrend}
                        </span>
                      </p>
                    </div>
                  </div>
                </AnalysisSection>

                {/* Manager & Gameplay */}
                <AnalysisSection icon={<Users className="w-3 h-3" />} title="Tactics & Gameplay">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-300">
                      {tip.analysis.manager.tacticalMatchup}
                    </p>
                    <div className="flex gap-2 text-[9px]">
                      <span className="text-cyan-400">{tip.analysis.gameplay.expectedStyle} game</span>
                      <span className="text-slate-400">~{tip.analysis.gameplay.expectedGoals} goals expected</span>
                    </div>
                  </div>
                </AnalysisSection>

                {/* Situation */}
                <AnalysisSection icon={<Thermometer className="w-3 h-3" />} title="Situational">
                  <div className="flex gap-2 flex-wrap">
                    {tip.analysis.situation.isDerby && (
                      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[9px] px-1.5 py-0">Derby</Badge>
                    )}
                    {tip.analysis.situation.weatherNote && (
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] px-1.5 py-0 flex items-center gap-1">
                        <Wind className="w-2.5 h-2.5" />
                        {tip.analysis.situation.weatherNote}
                      </Badge>
                    )}
                    {tip.analysis.situation.fatigueNote && (
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] px-1.5 py-0">
                        {tip.analysis.situation.fatigueNote}
                      </Badge>
                    )}
                    {tip.analysis.situation.keyAbsences.length > 0 && (
                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] px-1.5 py-0 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {tip.analysis.situation.keyAbsences.length} absences
                      </Badge>
                    )}
                    <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[9px] px-1.5 py-0">
                      Home: {tip.analysis.situation.homeMotivation}
                    </Badge>
                    <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[9px] px-1.5 py-0">
                      Away: {tip.analysis.situation.awayMotivation}
                    </Badge>
                  </div>
                </AnalysisSection>

                {/* xG Summary */}
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-muted-foreground">xG:</span>
                  <span>{tip.probabilities.homeXg.toFixed(2)}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{tip.probabilities.awayXg.toFixed(2)}</span>
                  <span className="text-slate-500 ml-2">
                    O2.5: {Math.round(tip.probabilities.over25 * 100)}%
                  </span>
                  <span className="text-slate-500">
                    BTTS: {Math.round(tip.probabilities.bttsYes * 100)}%
                  </span>
                </div>

                {/* Data Quality */}
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">Data quality:</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 bar-animate"
                      style={{ width: `${Math.round(tip.analysis.dataQuality * 100)}%` }}
                    />
                  </div>
                  <span className="text-slate-400 font-mono">{Math.round(tip.analysis.dataQuality * 100)}%</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

// ── Analysis Section Helper ──────────────────────────────────────────

function AnalysisSection({ icon, title, children }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-cyan-400">{icon}</span>
        <span className="text-[10px] font-medium text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
