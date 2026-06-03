'use client';

import { Bell } from 'lucide-react';

export function Topbar({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800/60 bg-[#070a13]/80 px-6 backdrop-blur-xl">
      <h1 className="text-base font-bold text-slate-100">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="grid h-8 w-8 place-items-center rounded-xl border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200">
          <Bell className="h-4 w-4" />
        </button>
        <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981]" title="Live" />
      </div>
    </header>
  );
}
