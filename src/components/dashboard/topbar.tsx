'use client';

import { Bell } from 'lucide-react';

export function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800/60 bg-[#070a13]/90 px-4 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3">
        <div className="prism relative grid h-8 w-8 place-items-center rounded-lg border border-blue-400/30 bg-blue-500/10 md:hidden">
          <div className="h-4 w-4 rotate-45 rounded-[3px] border border-blue-300 bg-blue-400/20" />
          <div className="absolute h-[6px] w-[6px] rotate-45 bg-blue-300" />
        </div>
        <h1 className="text-base font-bold text-slate-100">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <button className="grid h-8 w-8 place-items-center rounded-xl border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200">
          <Bell className="h-4 w-4" />
        </button>
        <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981]" title="Live" />
      </div>
    </header>
  );
}
