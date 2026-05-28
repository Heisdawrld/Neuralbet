'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PunterTipV4Data, TheTipData, TipQuality } from '@/lib/types';
import { format } from 'date-fns';
import {
  Clock, Shield, ChevronDown, Brain, Crosshair,
  Flame, TrendingUp, Minus, X, Eye,
  Swords, Thermometer, Wind, Users, BarChart3,
  AlertTriangle, CheckCircle2, Zap,
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
}> = {
  gold: {
    icon: <Flame className="w-4 h-4" />,
    label: 'GOLD',
    color: 'text-amber-300',
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/40',
    glow: 'shadow-amber-500/10',
    ring: 'ring-1 ring-amber-500/30',
  },
  silver: {
    icon: <Crosshair className="w-4 h-4" />,
    label: 'SILVER',
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/15',
    border: 'border-cyan-500/30',
    glow: 'shadow-cyan-500/10',
    ring: 'ring-1 ring-cyan-500/20',
  },
  bronze: {
    icon: <TrendingUp className="w-4 h-4" />,
    label: 'BRONZE',
    color: 'text-slate-300',
    bg: 'bg-slate-500/15',
    border: 'border-slate-500/30',
    glow: '',
    ring: '',
  },
  skip: {
    icon: <X className="w-4 h-4" />,
    label: 'SKIP',
    color: 'text-slate-500',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    glow: '',
    ring: '',
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

// ── Main TipCard Component ──────────────────────────────────────────

interface TipCardProps {
  tip: PunterTipV4Data;
}

export function TipCard({ tip }: TipCardProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const hasTip = tip.tip !== null;
  const quality: TipQuality = tip.tip?.quality ?? 'skip';
  const config = QUALITY_CONFIG[quality];

  return (
    <Card
      className={`glass-card hover-glow transition-all duration-300 cursor-pointer ${config.ring} ${config.glow} ${
        !hasTip ? 'opacity-50' : ''
      }`}
      onClick={() => setShowAnalysis(!showAnalysis)}
    >
      <div className="p-4">
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
            </div>

            {/* Teams */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold truncate max-w-[160px]">{tip.homeTeam}</p>
                <p className="text-sm font-semibold truncate max-w-[160px]">{tip.awayTeam}</p>
              </div>

              {/* Mini probability bars */}
              <div className="flex flex-col items-end gap-0.5 text-[10px] font-mono text-muted-foreground">
                <span>{Math.round(tip.probabilities.homeWin * 100)}%</span>
                <span>{Math.round(tip.probabilities.draw * 100)}%</span>
                <span>{Math.round(tip.probabilities.awayWin * 100)}%</span>
              </div>
            </div>
          </div>

          {/* ── THE TIP ──────────────────────────────────────── */}
          {hasTip && tip.tip ? (
            <div className="flex-shrink-0 text-right min-w-[100px]">
              <Badge className={`${config.bg} ${config.color} ${config.border} border text-[11px] px-2.5 py-0.5 flex items-center gap-1 ml-auto mb-1`}>
                {config.icon}
                {config.label}
              </Badge>
              <p className="text-base font-bold text-white leading-tight">
                {tip.tip.selection}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {tip.tip.market}
              </p>
              {tip.tip.odds && (
                <p className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
                  {tip.tip.odds.toFixed(2)}
                </p>
              )}
            </div>
          ) : (
            <div className="flex-shrink-0 text-right min-w-[100px]">
              <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20 border text-[11px] px-2.5 py-0.5 flex items-center gap-1 ml-auto mb-1">
                <X className="w-3 h-3" />
                SKIP
              </Badge>
              <p className="text-[11px] text-slate-500 italic mt-1 max-w-[100px]">
                {tip.skipReason}
              </p>
            </div>
          )}
        </div>

        {/* ── Reasoning & Stats Row ───────────────────────────── */}
        {hasTip && tip.tip && (
          <div className="mt-3 space-y-2">
            {/* Reasoning */}
            <p className="text-[11px] text-muted-foreground italic flex items-start gap-1.5">
              <Brain className="w-3 h-3 mt-0.5 flex-shrink-0 text-violet-400" />
              &ldquo;{tip.tip.reasoning}&rdquo;
            </p>

            {/* Stats Row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Edge */}
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] px-1.5 py-0">
                +{(tip.tip.edge * 100).toFixed(1)}% edge
              </Badge>
              {/* Risk */}
              <Badge className={`${RISK_BG[tip.tip.riskLevel]} text-[9px] px-1.5 py-0 flex items-center gap-1`}>
                <Shield className="w-2.5 h-2.5" />
                {tip.tip.riskLevel.replace('-', ' ')}
              </Badge>
              {/* Kelly */}
              <span className="text-[9px] text-violet-400 font-mono">
                Kelly {(tip.tip.kellyStake * 100).toFixed(1)}%
              </span>
              {/* Flags */}
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
              {/* Markets evaluated */}
              <span className="text-[9px] text-slate-500 ml-auto">
                {tip.tip.marketsEvaluated} markets checked
              </span>
            </div>
          </div>
        )}

        {/* ── Expand Toggle ────────────────────────────────────── */}
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <ChevronDown className={`w-3 h-3 transition-transform ${showAnalysis ? 'rotate-180' : ''}`} />
          <Swords className="w-3 h-3" />
          <span>Full Analysis</span>
          <span className="ml-auto text-[9px]">Model agreement: {Math.round(tip.modelAgreement * 100)}%</span>
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
                      <span className="text-slate-400">{tip.analysis.gameplay.expectedCards} cards</span>
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
                    {tip.analysis.situation.travelNote && (
                      <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[9px] px-1.5 py-0">
                        {tip.analysis.situation.travelNote}
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

                {/* League Context */}
                <AnalysisSection icon={<BarChart3 className="w-3 h-3" />} title="League Context">
                  <div className="flex gap-3 text-[9px] text-slate-400">
                    <span>Avg {tip.analysis.league.avgGoalsPerMatch} goals/match</span>
                    <span>O2.5: {Math.round(tip.analysis.league.over25Rate * 100)}%</span>
                    <span>BTTS: {Math.round(tip.analysis.league.bttsRate * 100)}%</span>
                    <span className={tip.analysis.league.competitiveness === 'high' ? 'text-amber-400' : 'text-slate-400'}>
                      {tip.analysis.league.competitiveness} competitiveness
                    </span>
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
                      className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500"
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
