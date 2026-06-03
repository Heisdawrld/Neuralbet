'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Brain, Home, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/fixtures', label: 'Fixtures', icon: Zap },
  { href: '/predict', label: 'Predict', icon: Brain },
  { href: '/performance', label: 'Stats', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-800/80 bg-[#070a13]/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition',
                active ? 'bg-blue-500/15 text-blue-200' : 'text-slate-500',
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-blue-300' : 'text-slate-500')} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
