'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PunterTipV4Data, TipQuality } from '@/lib/types';
import { format } from 'date-fns';
import {
  Clock, Shield, ChevronDown, Brain, Crosshair,
  Flame, TrendingUp, Minus, Eye,
  Swords, Thermometer, Wind, Users, BarChart3,
  AlertTriangle, CheckCircle2, Zap, Target,
  CloudRain, UserCheck, Moon, Trophy, Activity,
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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
  accent: string;
}> = {
  gold: {
    icon: <Flame className="w-3.5 h-3.5" />,
    label: 'GOLD',
    color: 'text-amber-300',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.12)]',
    ring: 'ring-1 ring-amber-500/20',
    gradient: 'from-amber-500/8 via-transparent to-amber-500/3',
    accent: 'text-amber-400',
  },
  silver: {
    icon: <Crosshair className="w-3.5 h-3.5" />,
    label: 'SILVER',
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/12',
    border: 'border-cyan-500/25',
    glow: 'shadow-[0_0_15px_rgba(6,182,212,0.08)]',
    ring: 'ring-1 ring-cyan-500/15',
    gradient: 'from-cyan-500/6 via-transparent to-cyan-500/3',
    accent: 'text-cyan-400',
  },
  bronze: {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    label: 'BRONZE',
    color: 'text-slate-300',
    bg: 'bg-slate-500/12',
    border: 'border-slate-500/20',
    glow: '',
    ring: '',
    gradient: 'from-slate-500/4 via-transparent to-slate-500/2',
    accent: 'text-slate-300',
  },
  skip: {
    icon: <Minus className="w-3.5 h-3.5" />,
    label: 'SKIP',
    color: 'text-slate-500',
    bg: 'bg-slate-500/8',
    border: 'border-slate-500/15',
    glow: '',
    ring: '',
    gradient: '',
    accent: 'text-slate-500',
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

// ── Confidence Ring ─────────────────────────────────────────────────

function ConfidenceRing({ value, size = 36, accent = '#10b981' }: { value: number; size?: number; accent?: string }) {
  const pct = Math.round(value * 100);
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth={2.5} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="donut-animate" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold text-white">
        {pct}
      </span>
    </div>
  );
}

// ── Form Letters ────────────────────────────────────────────────────

function FormLetter({ letter }: { letter: string }) {
  const colors: Record<string, string> = {
    W: 'bg-emerald-500/30 text-emerald-300',
    D: 'bg-amber-500/30 text-amber-300',
    L: 'bg-red-500/30 text-red-300',
  };
  return (
    <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold', colors[letter] || 'bg-slate-500/20 text-slate-400')}>
      {letter}
    </span>
  );
}

// ── Edge Bar ────────────────────────────────────────────────────────

function EdgeBar({ value, max = 0.15, accent = 'emerald' }: { value: number; max?: number; accent?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const gradients: Record<string, string> = {
    emerald: 'from-emerald-500 to-cyan-400',
    amber: 'from-amber-500 to-orange-400',
    cyan: 'from-cyan-500 to-blue-400',
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={cn('h-full rounded-full bg-gradient-to-r', gradients[accent] || gradients.emerald)}
        />
      </div>
      <span className="text-[9px] font-mono text-emerald-400">+{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INTELLIGENCE PANEL — Shows which modules fired
// ═══════════════════════════════════════════════════════════════════════

function IntelligencePanel({ tip }: { tip: PunterTipV4Data }) {
  const modules: Array<{
    key: string;
    icon: React.ReactNode;
    label: string;
    color: string;
    active: boolean;
    detail: string;
  }> = [
    {
      key: 'derby',
      icon: <Flame className="w-3 h-3" />,
      label: 'Derby',
      color: 'text-orange-400',
      active: !!tip.analysis?.situation?.isDerby,
      detail: 'xG dampened, volatility boosted, BTTS tilted',
    },
    {
      key: 'weather',
      icon: <CloudRain className="w-3 h-3" />,
      label: 'Weather',
      color: 'text-blue-400',
      active: !!tip.analysis?.situation?.weatherNote,
      detail: tip.analysis?.situation?.weatherNote || 'No weather impact',
    },
    {
      key: 'fatigue',
      icon: <Moon className="w-3 h-3" />,
      label: 'Rest Day',
      color: 'text-amber-400',
      active: !!tip.analysis?.situation?.fatigueNote,
      detail: tip.analysis?.situation?.fatigueNote || 'No fatigue differential',
    },
    {
      key: 'motivation',
      icon: <Trophy className="w-3 h-3" />,
      label: 'Motivation',
      color: 'text-emerald-400',
      active: tip.analysis?.situation?.homeMotivation !== 'normal' || tip.analysis?.situation?.awayMotivation !== 'normal',
      detail: `Home: ${tip.analysis?.situation?.homeMotivation || 'normal'} · Away: ${tip.analysis?.situation?.awayMotivation || 'normal'}`,
    },
  ];

  const activeModules = modules.filter(m => m.active);
  if (activeModules.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Activity className="w-3 h-3 text-violet-400" />
        <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">Intelligence Modules</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {activeModules.map((mod) => (
          <div
            key={mod.key}
            className="flex items-center gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1"
            title={mod.detail}
          >
            <span className={mod.color}>{mod.icon}</span>
            <span className="text-[9px] text-slate-300 font-medium">{mod.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TIP CARD — Main component
// ═══════════════════════════════════════════════════════════════════════

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
  const accentColor = quality === 'gold' ? '#f59e0b' : quality === 'silver' ? '#06b6d4' : '#10b981';

  const handleCardClick = () => {
    if (onMatchClick) {
      onMatchClick();
    } else {
      setShowAnalysis(!showAnalysis);
    }
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAnalysis(!showAnalysis);
  };

  return (
    <div
      className={cn(
        'relative rounded-2xl border overflow-hidden transition-all duration-300 cursor-pointer',
        'bg-[#0d1117]/80 backdrop-blur-sm',
        config.border,
        config.glow,
        isSkip ? 'opacity-50 hover:opacity-70' : 'hover:translate-y-[-1px]',
      )}
      onClick={handleCardClick}
    >
      {/* Quality gradient overlay */}
      {hasTip && config.gradient && (
        <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', config.gradient)} />
      )}

      <div className="relative p-4">
        {/* ── Row 1: League + Time + Quality Badge ──────────── */}
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className="text-[11px] text-slate-500 truncate max-w-[140px]">
            {tip.leagueName}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(new Date(tip.eventDate), 'HH:mm')}
          </span>
          {hasTip && (
            <Badge className={cn(config.bg, config.color, config.border, 'border text-[9px] px-1.5 py-0 flex items-center gap-0.5 ml-auto')}>
              {config.icon}
              {config.label}
            </Badge>
          )}
        </div>

        {/* ── Row 2: Teams + Tip + Odds ─────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          {/* Teams */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold truncate max-w-[160px]">{tip.homeTeam}</p>
              <span className="text-[10px] font-mono text-slate-500">{Math.round(tip.probabilities.homeWin * 100)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white/70 truncate max-w-[160px]">{tip.awayTeam}</p>
              <span className="text-[10px] font-mono text-slate-500">{Math.round(tip.probabilities.awayWin * 100)}%</span>
            </div>
          </div>

          {/* The Tip */}
          {hasTip && tip.tip ? (
            <div className="flex items-center gap-2.5 shrink-0">
              <ConfidenceRing value={tip.tip.confidence} size={38} accent={accentColor} />
              <div className="text-right min-w-[90px]">
                <p className="text-sm font-bold text-white leading-tight mb-0.5 truncate max-w-[110px]">
                  {tip.tip.selection}
                </p>
                {tip.tip.odds && (
                  <p className={cn('text-lg font-mono font-bold', config.accent)}>
                    @{tip.tip.odds.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="shrink-0">
              <Badge className="bg-slate-500/8 text-slate-500 border-slate-500/15 text-[10px]">
                SKIP
              </Badge>
            </div>
          )}
        </div>

        {/* ── Row 3: Edge + Risk + Market ────────────────────── */}
        {hasTip && tip.tip && (
          <div className="mt-2.5 flex items-center gap-3 text-[11px] flex-wrap">
            <span className="text-slate-500">{tip.tip.market}</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-600">Edge</span>
              <EdgeBar value={tip.tip.edge} accent={quality === 'gold' ? 'amber' : quality === 'silver' ? 'cyan' : 'emerald'} />
            </div>
            <Badge className={cn(RISK_BG[tip.tip.riskLevel], RISK_COLORS[tip.tip.riskLevel], 'text-[9px] px-1.5 py-0 flex items-center gap-0.5 ml-auto')}>
              <Shield className="w-2.5 h-2.5" />
              {tip.tip.riskLevel}
            </Badge>
          </div>
        )}

        {/* ── Skip reason ────────────────────────────────────── */}
        {!hasTip && tip.skipReason && (
          <p className="mt-1.5 text-[10px] text-slate-500 italic truncate">{tip.skipReason}</p>
        )}

        {/* ── Expand Toggle ──────────────────────────────────── */}
        <button
          onClick={handleExpandClick}
          className="mt-2 flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', showAnalysis && 'rotate-180')} />
          {showAnalysis ? 'Hide Analysis' : 'Full Analysis'}
        </button>

        {/* ── Expanded Analysis Panel ─────────────────────────── */}
        <AnimatePresence>
          {showAnalysis && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                {/* Intelligence Modules */}
                <IntelligencePanel tip={tip} />

                {/* Reasoning */}
                {hasTip && tip.tip && tip.tip.reasoning && (
                  <div className="flex items-start gap-1.5">
                    <Brain className="w-3 h-3 mt-0.5 flex-shrink-0 text-violet-400" />
                    <p className="text-[11px] text-slate-400 italic leading-relaxed">
                      &ldquo;{tip.tip.reasoning}&rdquo;
                    </p>
                  </div>
                )}

                {/* H2H */}
                <AnalysisSection icon={<Swords className="w-3 h-3" />} title="Head to Head">
                  {tip.analysis.h2h.totalMeetings > 0 ? (
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-300">{tip.analysis.h2h.note}</p>
                      <div className="flex gap-3 text-[10px] font-mono">
                        <span className="text-emerald-400">O2.5: {Math.round(tip.analysis.h2h.over25Rate * 100)}%</span>
                        <span className="text-cyan-400">BTTS: {Math.round(tip.analysis.h2h.bttsRate * 100)}%</span>
                        <span className="text-slate-400">Avg: {tip.analysis.h2h.avgGoals}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500">No previous meetings found</p>
                  )}
                </AnalysisSection>

                {/* Form */}
                <AnalysisSection icon={<BarChart3 className="w-3 h-3" />} title="Form & Last 5">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { team: tip.homeTeam, data: tip.analysis.last5.home, trend: tip.analysis.form.homeTrend },
                      { team: tip.awayTeam, data: tip.analysis.last5.away, trend: tip.analysis.form.awayTrend },
                    ].map(({ team, data, trend }) => (
                      <div key={team}>
                        <p className="text-[10px] text-slate-500 mb-1">{team}</p>
                        <div className="flex gap-0.5 mb-1">
                          {data.form.split('').map((l: string, i: number) => (
                            <FormLetter key={i} letter={l} />
                          ))}
                        </div>
                        <p className="text-[9px] text-slate-400">
                          {data.wins}W {data.draws}D {data.losses}L ·{' '}
                          <span className={trend === 'rising' ? 'text-emerald-400' : trend === 'declining' ? 'text-red-400' : 'text-slate-400'}>
                            {trend}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </AnalysisSection>

                {/* Tactics */}
                <AnalysisSection icon={<Users className="w-3 h-3" />} title="Tactics">
                  <p className="text-[10px] text-slate-300">{tip.analysis.manager.tacticalMatchup}</p>
                  <div className="flex gap-2 text-[9px] mt-1">
                    <span className="text-cyan-400">{tip.analysis.gameplay.expectedStyle} game</span>
                    <span className="text-slate-400">~{tip.analysis.gameplay.expectedGoals} goals expected</span>
                  </div>
                </AnalysisSection>

                {/* Situational Badges */}
                <AnalysisSection icon={<Thermometer className="w-3 h-3" />} title="Context">
                  <div className="flex gap-1.5 flex-wrap">
                    {tip.analysis.situation.isDerby && (
                      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[9px] px-1.5 py-0">
                        <Flame className="w-2.5 h-2.5 mr-0.5" /> Derby
                      </Badge>
                    )}
                    {tip.analysis.situation.weatherNote && (
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] px-1.5 py-0">
                        <Wind className="w-2.5 h-2.5 mr-0.5" /> {tip.analysis.situation.weatherNote}
                      </Badge>
                    )}
                    {tip.analysis.situation.fatigueNote && (
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] px-1.5 py-0">
                        {tip.analysis.situation.fatigueNote}
                      </Badge>
                    )}
                    {tip.analysis.situation.keyAbsences.length > 0 && (
                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] px-1.5 py-0">
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> {tip.analysis.situation.keyAbsences.length} absent
                      </Badge>
                    )}
                  </div>
                </AnalysisSection>

                {/* xG Summary */}
                <div className="flex items-center gap-3 text-[10px] font-mono pt-1">
                  <span className="text-slate-500">xG</span>
                  <span className="text-emerald-400 font-bold">{tip.probabilities.homeXg.toFixed(2)}</span>
                  <span className="text-slate-600">—</span>
                  <span className="text-emerald-400 font-bold">{tip.probabilities.awayXg.toFixed(2)}</span>
                  <span className="text-slate-600 ml-2">O2.5: {Math.round(tip.probabilities.over25 * 100)}%</span>
                  <span className="text-slate-600">BTTS: {Math.round(tip.probabilities.bttsYes * 100)}%</span>
                </div>

                {/* Data Quality */}
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-500">Data quality</span>
                  <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(tip.analysis.dataQuality * 100)}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500"
                    />
                  </div>
                  <span className="text-slate-400 font-mono">{Math.round(tip.analysis.dataQuality * 100)}%</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Analysis Section ────────────────────────────────────────────────

function AnalysisSection({ icon, title, children }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-cyan-400">{icon}</span>
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}
