'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceMeter } from './confidence-meter';
import { ProbabilityBar } from './probability-bar';
import { EnginePanel } from './engine-panel';
import type { PredictionData, OurPredictionData } from '@/lib/types';
import { format } from 'date-fns';
import {
  Clock, Zap, ShieldCheck, AlertTriangle, Eye, X, ChevronDown,
  TrendingUp, Shield, Brain, Flame
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PunterMatchCardProps {
  prediction: PredictionData;
  ourPrediction?: OurPredictionData;
  compact?: boolean;
  onClick?: () => void;
}

const DECISION_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string; border: string }> = {
  'strong-bet': { icon: <Flame className="w-3 h-3" />, label: 'Strong Bet', color: 'text-emerald-300', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40' },
  'bet': { icon: <Zap className="w-3 h-3" />, label: 'Bet', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  'small-bet': { icon: <TrendingUp className="w-3 h-3" />, label: 'Small Bet', color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
  'watch': { icon: <Eye className="w-3 h-3" />, label: 'Watch', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  'pass': { icon: <X className="w-3 h-3" />, label: 'Pass', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
};

const RISK_COLORS: Record<string, string> = {
  'very-low': 'text-emerald-400',
  'low': 'text-emerald-400',
  'medium': 'text-amber-400',
  'high': 'text-orange-400',
  'very-high': 'text-red-400',
  'avoid': 'text-red-500',
};

const MOTIVATION_LABELS: Record<string, { label: string; color: string }> = {
  'must-win': { label: 'MUST WIN', color: 'text-red-400' },
  'high': { label: 'HIGH', color: 'text-amber-400' },
  'medium': { label: 'MED', color: 'text-slate-400' },
  'low': { label: 'LOW', color: 'text-slate-500' },
  'dead-rubber': { label: 'DEAD', color: 'text-slate-600' },
};

export function PunterMatchCard({ prediction, ourPrediction, compact = false, onClick }: PunterMatchCardProps) {
  const isLive = prediction.match.status === 'in' || prediction.match.status === 'live';
  const isRecommended = prediction.isRecommended;
  const [showDetails, setShowDetails] = useState(false);

  const decision = ourPrediction?.decision;
  const risk = ourPrediction?.risk;
  const situational = ourPrediction?.situational;
  const decisionConfig = decision ? DECISION_CONFIG[decision.action] : null;

  const handleCardClick = () => {
    setShowDetails(!showDetails);
    onClick?.();
  };

  return (
    <Card
      className={`glass-card hover-glow cursor-pointer transition-all duration-300 ${
        compact ? 'p-3' : 'p-4'
      } ${decision?.action === 'strong-bet' ? 'ring-1 ring-emerald-500/30' : ''} ${
        decision?.action === 'pass' ? 'opacity-70' : ''
      }`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* League & Time */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground truncate">
              {prediction.match.leagueName || 'Unknown League'}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(prediction.match.eventDate), 'HH:mm')}
            </span>
            {isLive && (
              <span className="flex items-center gap-1 text-[11px] text-cyan-400">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                LIVE
              </span>
            )}
            {/* Punter Decision Badge */}
            {decisionConfig && (
              <Badge className={`${decisionConfig.bg} ${decisionConfig.color} ${decisionConfig.border} border text-[10px] px-2 py-0 flex items-center gap-1`}>
                {decisionConfig.icon}
                {decisionConfig.label}
              </Badge>
            )}
          </div>

          {/* Teams */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">
                {prediction.match.homeTeam}
              </span>
              {prediction.match.homeScore !== null && (
                <span className="font-mono text-sm font-bold ml-2">
                  {prediction.match.homeScore}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">
                {prediction.match.awayTeam}
              </span>
              {prediction.match.awayScore !== null && (
                <span className="font-mono text-sm font-bold ml-2">
                  {prediction.match.awayScore}
                </span>
              )}
            </div>
          </div>

          {/* Probabilities */}
          {!compact && (
            <div className="mt-3">
              <ProbabilityBar
                home={prediction.homeWinProb}
                draw={prediction.drawProb}
                away={prediction.awayWinProb}
                homeLabel={prediction.match.homeTeam.slice(0, 3).toUpperCase()}
                awayLabel={prediction.match.awayTeam.slice(0, 3).toUpperCase()}
              />
            </div>
          )}

          {/* Expected Goals & Score */}
          {!compact && (
            <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground font-mono">
              <span>xG: {prediction.homeXg?.toFixed(2)}</span>
              <span>-</span>
              <span>{prediction.awayXg?.toFixed(2)}</span>
              {prediction.mostLikelyScore && (
                <span className="ml-auto text-slate-500">
                  Score: {prediction.mostLikelyScore}
                </span>
              )}
            </div>
          )}

          {/* Punter Intelligence Row */}
          {!compact && risk && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[10px] font-medium flex items-center gap-1 ${RISK_COLORS[risk.riskLevel]}`}>
                <Shield className="w-3 h-3" />
                Risk: {risk.riskLevel.replace('-', ' ')}
              </span>
              {situational?.isDerby && (
                <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[9px] px-1.5 py-0">
                  Derby
                </Badge>
              )}
              {situational?.sampleSizeWarning && (
                <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[9px] px-1.5 py-0">
                  Small Sample
                </Badge>
              )}
              {decision?.isContrarian && (
                <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-[9px] px-1.5 py-0">
                  Contrarian
                </Badge>
              )}
              {decision?.isSafePlay && (
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] px-1.5 py-0">
                  Safe Play
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Confidence Meter */}
        <div className="flex-shrink-0">
          <ConfidenceMeter value={prediction.confidence} size={compact ? 40 : 52} showLabel={!compact} />
        </div>
      </div>

      {/* Punter Reasoning */}
      {!compact && decision && (
        <div className="mt-2">
          <p className="text-[11px] text-muted-foreground italic">
            &ldquo;{decision.reasoning}&rdquo;
          </p>
        </div>
      )}

      {/* Recommendation Badge */}
      {isRecommended && !compact && (
        <div className="mt-2 flex items-center gap-2">
          <Badge
            variant="secondary"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]"
          >
            <Zap className="w-3 h-3 mr-1" />
            {getRecommendationLabel(prediction)}
          </Badge>
        </div>
      )}

      {/* Expand Details Toggle */}
      {ourPrediction && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          <Brain className="w-3 h-3" />
          <span>Engine Analysis</span>
        </div>
      )}

      {/* Expanded Details Panel */}
      <AnimatePresence>
        {ourPrediction && showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
              {/* Motivation */}
              {situational && (
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-muted-foreground">Motivation:</span>
                  <span className={MOTIVATION_LABELS[situational.homeMotivation]?.color}>
                    Home: {MOTIVATION_LABELS[situational.homeMotivation]?.label}
                  </span>
                  <span className={MOTIVATION_LABELS[situational.awayMotivation]?.color}>
                    Away: {MOTIVATION_LABELS[situational.awayMotivation]?.label}
                  </span>
                </div>
              )}

              {/* Risk Factors */}
              {risk && risk.riskFactors.length > 0 && (
                <div className="space-y-1">
                  {risk.riskFactors.slice(0, 3).map((factor, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-400/80">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{factor}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Situational Notes */}
              {situational && situational.notes.length > 0 && (
                <div className="space-y-1">
                  {situational.notes.slice(0, 3).map((note, i) => (
                    <div key={i} className="text-[10px] text-slate-400 flex items-start gap-1.5">
                      <span className="text-cyan-400">●</span>
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Value Bets */}
              {ourPrediction.valueBets.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Value Detected:</span>
                  {ourPrediction.valueBets.slice(0, 3).map((vb, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] px-1.5 py-0">
                        {vb.selection}
                      </Badge>
                      <span className="text-emerald-400 font-mono">+{(vb.edge * 100).toFixed(1)}% edge</span>
                      <span className="text-muted-foreground font-mono">@ {vb.odds.toFixed(2)}</span>
                      <span className="text-violet-400 font-mono">Kelly: {(vb.adjustedKelly * 100).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Engine Panel (models breakdown) */}
              <EnginePanel prediction={{
                ...ourPrediction,
                id: ourPrediction.eventId,
                match: prediction.match,
                homeXg: ourPrediction.homeExpectedGoals,
                awayXg: ourPrediction.awayExpectedGoals,
              } as any} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function getRecommendationLabel(prediction: PredictionData): string {
  const recs = prediction.recommendations;
  if (recs.betFavorite) return 'Best Bet';
  if (recs.winner) return 'Winner';
  if (recs.over25) return 'Over 2.5';
  if (recs.btts) return 'BTTS';
  if (recs.over15) return 'Over 1.5';
  if (recs.over35) return 'Over 3.5';
  if (prediction.isRecommended) return 'Recommended';
  return 'Recommended';
}
