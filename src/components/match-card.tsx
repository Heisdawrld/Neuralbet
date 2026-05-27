'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceMeter } from './confidence-meter';
import { ProbabilityBar } from './probability-bar';
import type { PredictionData } from '@/lib/types';
import { format } from 'date-fns';
import { Clock, Zap } from 'lucide-react';

interface MatchCardProps {
  prediction: PredictionData;
  compact?: boolean;
  onClick?: () => void;
}

export function MatchCard({ prediction, compact = false, onClick }: MatchCardProps) {
  const isLive = prediction.match.status === 'in' || prediction.match.status === 'live';
  const isRecommended = prediction.isRecommended;

  const getRecommendationLabel = () => {
    const recs = prediction.recommendations;
    if (recs.betFavorite) return '🔥 Best Bet';
    if (recs.winner) return '🏆 Winner';
    if (recs.over25) return '⚽ Over 2.5';
    if (recs.btts) return '🎯 BTTS';
    if (recs.over15) return '📈 Over 1.5';
    if (recs.over35) return '💥 Over 3.5';
    if (isRecommended) return '⚡ Recommended';
    return null;
  };

  return (
    <Card
      className={`glass-card hover-glow cursor-pointer transition-all duration-300 ${
        compact ? 'p-3' : 'p-4'
      }`}
      onClick={onClick}
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
              <span className="flex items-center gap-1 text-[11px] text-neon-cyan">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 live-pulse" />
                LIVE
              </span>
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
    </Card>
  );
}
