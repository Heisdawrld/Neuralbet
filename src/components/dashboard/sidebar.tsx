'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Brain, Home, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarUser } from './sidebar-user';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: Home },
  { href: '/fixtures', label: 'Fixtures', icon: Zap },
  { href: '/predict', label: 'Predict', icon: Brain },
  { href: '/performance', label: 'Performance', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-800/60 bg-[#070a13]/95 backdrop-blur-xl md:flex">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-800/60 px-5">
        <div className="prism relative grid h-9 w-9 place-items-center rounded-xl border border-blue-400/30 bg-blue-500/10">
          <div className="h-4 w-4 rotate-45 rounded-[3px] border border-blue-300 bg-blue-400/20" />
          <div className="absolute h-[7px] w-[7px] rotate-45 bg-blue-300" />
        </div>
        <div>
          <div className="text-sm font-black tracking-[0.22em]">CIPHER</div>
          <div className="text-[9px] uppercase tracking-[0.28em] text-slate-500">Decode football</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== '/dashboard' && path.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-blue-500/15 text-blue-200 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300')} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-slate-800/60 p-4">
        <SidebarUser />
      </div>
    </aside>
  );
}
