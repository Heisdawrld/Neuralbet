'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceMeter } from './confidence-meter';
import { ProbabilityBar } from './probability-bar';
import { EnginePanel } from './engine-panel';
import type { PredictionData, OurPredictionData, TipQuality } from '@/lib/types';
import { format } from 'date-fns';
import { Clock, Zap, Radio } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';

interface MatchCardProps {
  prediction: PredictionData;
  ourPrediction?: OurPredictionData;
  compact?: boolean;
  onClick?: () => void;
  quality?: TipQuality;
}

export function MatchCard({ prediction, ourPrediction, compact = false, onClick, quality }: MatchCardProps) {
  const isLive = prediction.match.status === 'in' || prediction.match.status === 'live';
  const isRecommended = prediction.isRecommended;
  const [showEngine, setShowEngine] = useState(false);

  // Determine glow class based on quality
  const getGlowClass = () => {
    if (quality === 'gold') return 'gold-glow';
    if (quality === 'silver') return 'silver-glow';
    if (quality === 'bronze') return 'bronze-glow';
    return '';
  };

  const getQualityBadge = () => {
    if (quality === 'gold') return <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[9px] px-1.5 py-0">GOLD</Badge>;
    if (quality === 'silver') return <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/20 text-[9px] px-1.5 py-0">SILVER</Badge>;
    if (quality === 'bronze') return <Badge className="bg-slate-500/15 text-slate-300 border-slate-500/20 text-[9px] px-1.5 py-0">BRONZE</Badge>;
    return null;
  };

  const getRecommendationLabel = () => {
    const recs = prediction.recommendations;
    if (recs.betFavorite) return 'Best Bet';
    if (recs.winner) return 'Winner';
    if (recs.over25) return 'Over 2.5';
    if (recs.btts) return 'BTTS';
    if (recs.over15) return 'Over 1.5';
    if (recs.over35) return 'Over 3.5';
    if (isRecommended) return 'Recommended';
    return null;
  };

  const handleCardClick = () => {
    if (ourPrediction) {
      setShowEngine(!showEngine);
    }
    onClick?.();
  };

  return (
    <Card
      className={`glass-card-premium hover-lift transition-all duration-300 cursor-pointer ${getGlowClass()} ${
        compact ? 'p-3' : 'p-4'
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
            <span className="text-muted-foreground/40">•</span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(prediction.match.eventDate), 'HH:mm')}
            </span>
            {isLive && (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                LIVE
              </span>
            )}
            {ourPrediction && (
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 text-[9px] px-1.5 py-0">
                Ensemble
              </Badge>
            )}
            {getQualityBadge()}
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

          {/* Expected Goals */}
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
        </div>

        {/* Confidence Meter */}
        <div className="flex-shrink-0">
          <ConfidenceMeter value={prediction.confidence} size={compact ? 40 : 52} showLabel={!compact} />
        </div>
      </div>

      {/* Recommendation Badge */}
      {isRecommended && (
        <div className="mt-2 flex items-center gap-2">
          <Badge
            variant="secondary"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]"
          >
            <Zap className="w-3 h-3 mr-1" />
            {getRecommendationLabel() || 'Recommended'}
          </Badge>
        </div>
      )}

      {/* Engine Breakdown Panel */}
      {ourPrediction && showEngine && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <EnginePanel prediction={ourPrediction} />
        </motion.div>
      )}
    </Card>
  );
}
