'use client';

import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TeamLogoProps {
  teamId: number;
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
} as const;

const SIZE_CLASSES = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12',
} as const;

const SHIELD_SIZE_CLASSES = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6',
} as const;

export function TeamLogo({ teamId, name, src, size = 'md', className }: TeamLogoProps) {
  const [error, setError] = useState(false);

  // Resolution priority: src prop → teamId-based URL → Shield fallback
  const effectiveSrc = src && src.trim() ? src : null;
  const finalSrc = effectiveSrc || (teamId ? `https://sports.bzzoiro.com/img/team/${teamId}/` : null);
  const finalAlt = name || 'Team Logo';

  const baseClasses = cn(
    'rounded-full object-contain bg-white/5 shrink-0 transition-opacity duration-300',
    SIZE_CLASSES[size],
    className,
  );

  if (!finalSrc || error) {
    return (
      <div
        className={cn(baseClasses, 'flex items-center justify-center border border-white/10')}
        role="img"
        aria-label={finalAlt}
      >
        <Shield className={cn(SHIELD_SIZE_CLASSES[size], 'text-white/20')} />
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
