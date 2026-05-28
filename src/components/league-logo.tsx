'use client';

import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeagueLogoProps {
  leagueId: number;
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: 20,
  md: 28,
  lg: 36,
} as const;

const SIZE_CLASSES = {
  sm: 'w-5 h-5',
  md: 'w-7 h-7',
  lg: 'w-9 h-9',
} as const;

const SHIELD_SIZE_CLASSES = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
} as const;

export function LeagueLogo({ leagueId, name, src, size = 'sm', className }: LeagueLogoProps) {
  const [error, setError] = useState(false);

  // Resolution priority: src prop → leagueId-based URL → Shield fallback
  const effectiveSrc = src && src.trim() ? src : null;
  const finalSrc = effectiveSrc || (leagueId ? `https://sports.bzzoiroiro.com/img/league/${leagueId}/` : null);
  const finalAlt = name || 'League Badge';

  const baseClasses = cn(
    'rounded object-contain bg-white/5 shrink-0 transition-opacity duration-300',
    SIZE_CLASSES[size],
    className,
  );

  if (!finalSrc || error) {
    return (
      <div
        className={cn(baseClasses, 'flex items-center justify-center')}
        role="img"
        aria-label={finalAlt}
      >
        <Shield className={cn(SHIELD_SIZE_CLASSES[size], 'text-white/15')} />
      </div>
    );
  }

  return (
    <img
      src={finalSrc}
      alt={finalAlt}
      width={SIZE_MAP[size]}
      height={SIZE_MAP[size]}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      className={baseClasses}
    />
  );
}
