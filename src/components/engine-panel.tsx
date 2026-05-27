'use client';

import type { OurPredictionData, OurModelBreakdown } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Cpu, Scale, BarChart3, Target, TrendingUp, Shield } from 'lucide-react';
import { useState } from 'react';

interface EnginePanelProps {
  prediction: OurPredictionData;
}

const MODEL_INFO: Array<{
  key: keyof OurModelBreakdown;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  description: string;
}> = [
  {
    key: 'elo',
    label: 'Elo Rating',
    icon: <Scale className="w-3.5 h-3.5" />,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    description: 'Head-to-head rating system with home advantage',
  },
  {
    key: 'poisson',
    label: 'Poisson',
    icon: <BarChart3 className="w-3.5 h-3.5" />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    description: 'Goal distribution model using attack/defense strength',
  },
  {
    key: 'xg',
    label: 'xG Model',
    icon: <Target className="w-3.5 h-3.5" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    description: 'Expected goals analysis — less noisy than actual goals',
  },
  {
    key: 'form',
    label: 'Form Analysis',
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    description: 'Recent match form with exponential decay weighting',
  },
  {
    key: 'attackDefense',
    label: 'Att/Def Strength',
    icon: <Shield className="w-3.5 h-3.5" />,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    description: 'Classic attack/defense vs league average comparison',
  },
];

export function EnginePanel({ prediction }: EnginePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const weights = prediction.weights;
  const models = prediction.models;

  // Find which model the final prediction agrees with most
  const getVoteStatus = (modelKey: keyof OurModelBreakdown) => {
    const modelPred = models[modelKey];
    const modelWinner =
      modelPred.homeWinProb >= modelPred.drawProb && modelPred.homeWinProb >= modelPred.awayWinProb
        ? 'H'
        : modelPred.awayWinProb >= modelPred.drawProb
          ? 'A'
          : 'D';
    return modelWinner === prediction.predicted ? 'agree' : 'disagree';
  };

  return (
    <div className="border-t border-white/5 mt-3 pt-3">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          Engine Breakdown
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 text-[9px] px-1.5 py-0">
            v{prediction.engineVersion}
          </Badge>
        </span>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              {/* Model Cards */}
              {MODEL_INFO.map((info) => {
                const modelData = models[info.key];
                const weight = weights[info.key];
                const vote = getVoteStatus(info.key);
                const homePct = Math.round(modelData.homeWinProb * 100);
                const drawPct = Math.round(modelData.drawProb * 100);
                const awayPct = Math.round(modelData.awayWinProb * 100);

                return (
                  <div
                    key={info.key}
                    className={`rounded-lg ${info.bgColor} p-2.5`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={info.color}>{info.icon}</span>
                        <span className="text-xs font-medium">{info.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          (w: {(weight * 100).toFixed(0)}%
                          {'reliability' in modelData && modelData.reliability !== undefined ? `, r: ${(modelData.reliability * 100).toFixed(0)}%` : ''})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">
                          xG: {modelData.homeExpectedGoals.toFixed(1)} - {modelData.awayExpectedGoals.toFixed(1)}
                        </span>
                        <Badge
                          variant="secondary"
                          className={`text-[9px] px-1.5 py-0 ${
                            vote === 'agree'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {vote === 'agree' ? 'Agrees' : 'Differs'}
                        </Badge>
                      </div>
                    </div>

                    {/* Mini Probability Bar */}
                    <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-white/5">
                      <div
                        className="h-full rounded-l-full transition-all duration-500"
                        style={{
                          width: `${homePct}%`,
                          backgroundColor: homePct >= 50 ? '#10b981' : homePct >= 30 ? '#f59e0b' : '#94a3b8',
                        }}
                      />
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${drawPct}%`,
                          backgroundColor: '#475569',
                        }}
                      />
                      <div
                        className="h-full rounded-r-full transition-all duration-500"
                        style={{
                          width: `${awayPct}%`,
                          backgroundColor: awayPct >= 50 ? '#10b981' : awayPct >= 30 ? '#f59e0b' : '#94a3b8',
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono mt-0.5">
                      <span className="text-muted-foreground">H {homePct}%</span>
                      <span className="text-muted-foreground">D {drawPct}%</span>
                      <span className="text-muted-foreground">A {awayPct}%</span>
                    </div>
                  </div>
                );
              })}

              {/* Weight Distribution */}
              <div className="rounded-lg bg-white/5 p-2.5">
                <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">
                  Weight Distribution
                </div>
                <div className="flex w-full h-3 rounded-full overflow-hidden bg-white/5">
                  <div
                    className="h-full bg-cyan-500/70"
                    style={{ width: `${weights.elo * 100}%` }}
                    title={`Elo: ${(weights.elo * 100).toFixed(0)}%`}
                  />
                  <div
                    className="h-full bg-emerald-500/70"
                    style={{ width: `${weights.poisson * 100}%` }}
                    title={`Poisson: ${(weights.poisson * 100).toFixed(0)}%`}
                  />
                  <div
                    className="h-full bg-amber-500/70"
                    style={{ width: `${weights.xg * 100}%` }}
                    title={`xG: ${(weights.xg * 100).toFixed(0)}%`}
                  />
                  <div
                    className="h-full bg-violet-500/70"
                    style={{ width: `${weights.form * 100}%` }}
                    title={`Form: ${(weights.form * 100).toFixed(0)}%`}
                  />
                  <div
                    className="h-full bg-rose-500/70"
                    style={{ width: `${weights.attackDefense * 100}%` }}
                    title={`Att/Def: ${(weights.attackDefense * 100).toFixed(0)}%`}
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                  {MODEL_INFO.map((info) => (
                    <span key={info.key} className="text-[9px] flex items-center gap-1">
                      <span
                        className={`w-2 h-2 rounded-sm ${
                          info.key === 'elo'
                            ? 'bg-cyan-500/70'
                            : info.key === 'poisson'
                              ? 'bg-emerald-500/70'
                              : info.key === 'xg'
                                ? 'bg-amber-500/70'
                                : info.key === 'form'
                                  ? 'bg-violet-500/70'
                                  : 'bg-rose-500/70'
                        }`}
                      />
                      <span className="text-muted-foreground">
                        {info.key === 'attackDefense' ? 'A/D' : info.key.charAt(0).toUpperCase() + info.key.slice(1)}{' '}
                        {(weights[info.key] * 100).toFixed(0)}%
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Ensemble Summary */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  Final: H {(prediction.homeWinProb * 100).toFixed(1)}% / D{' '}
                  {(prediction.drawProb * 100).toFixed(1)}% / A{' '}
                  {(prediction.awayWinProb * 100).toFixed(1)}%
                </span>
                <span>
                  Confidence: {(prediction.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
