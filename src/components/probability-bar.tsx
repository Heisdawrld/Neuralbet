'use client';

import { motion } from 'framer-motion';

interface ProbabilityBarProps {
  home: number;
  draw: number;
  away: number;
  showLabels?: boolean;
  homeLabel?: string;
  awayLabel?: string;
}

export function ProbabilityBar({
  home,
  draw,
  away,
  showLabels = true,
  homeLabel = 'H',
  awayLabel = 'A',
}: ProbabilityBarProps) {
  const homePct = Math.round(home * 100);
  const drawPct = Math.round(draw * 100);
  const awayPct = Math.round(away * 100);

  const getColor = (val: number) => {
    if (val >= 0.5) return '#10b981';
    if (val >= 0.3) return '#f59e0b';
    return '#94a3b8';
  };

  return (
    <div className="space-y-1.5">
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-white/5">
        <motion.div
          className="h-full rounded-l-full"
          style={{ backgroundColor: getColor(home) }}
          initial={{ width: 0 }}
          animate={{ width: `${homePct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        <motion.div
          className="h-full"
          style={{ backgroundColor: '#475569' }}
          initial={{ width: 0 }}
          animate={{ width: `${drawPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
        />
        <motion.div
          className="h-full rounded-r-full"
          style={{ backgroundColor: getColor(away) }}
          initial={{ width: 0 }}
          animate={{ width: `${awayPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
      {showLabels && (
        <div className="flex justify-between text-[11px] font-mono">
          <span style={{ color: getColor(home) }}>{homeLabel} {homePct}%</span>
          <span className="text-slate-400">D {drawPct}%</span>
          <span style={{ color: getColor(away) }}>{awayLabel} {awayPct}%</span>
        </div>
      )}
    </div>
  );
}
