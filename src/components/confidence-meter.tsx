'use client';

import { motion } from 'framer-motion';

interface ConfidenceMeterProps {
  value: number; // 0-1
  size?: number;
  showLabel?: boolean;
}

export function ConfidenceMeter({ value, size = 48, showLabel = true }: ConfidenceMeterProps) {
  const percentage = Math.round(value * 100);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - value * circumference;

  const getColor = (v: number) => {
    if (v >= 0.7) return '#10b981';
    if (v >= 0.5) return '#f59e0b';
    return '#ef4444';
  };

  const color = getColor(value);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={3}
            fill="none"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              filter: `drop-shadow(0 0 6px ${color}40)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-mono font-bold"
            style={{ color, fontSize: size < 56 ? 11 : 14 }}
          >
            {percentage}%
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Confidence
        </span>
      )}
    </div>
  );
}
