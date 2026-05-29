'use client';

import { useAppStore } from '@/lib/store';
import { DashboardV2 } from '@/components/dashboard-v2';
import { Predictions } from '@/components/predictions';
import { ValueBets } from '@/components/value-bets';
import { LiveMatches } from '@/components/live-matches';
import { Leagues } from '@/components/leagues';
import { Bankroll } from '@/components/bankroll';
import { motion, AnimatePresence } from 'framer-motion';
import type { NavTab } from '@/lib/types';
import {
  LayoutDashboard,
  Crosshair,
  Radio,
  Trophy,
  DollarSign,
  Menu,
  X,
  Zap,
  Brain,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const navItems: Array<{
  id: NavTab;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'Fixtures & overview',
  },
  {
    id: 'predictions',
    label: 'Predictions',
    icon: <Crosshair className="w-5 h-5" />,
    description: 'Model predictions',
  },
  {
    id: 'value-bets',
    label: 'Value Bets',
    icon: <Brain className="w-5 h-5" />,
    description: 'Edge detection',
  },
  {
    id: 'live',
    label: 'Live',
    icon: <Radio className="w-5 h-5" />,
    description: 'In-play matches',
  },
  {
    id: 'leagues',
    label: 'Leagues',
    icon: <Trophy className="w-5 h-5" />,
    description: 'Standings & stats',
  },
  {
    id: 'bankroll',
    label: 'Bankroll',
    icon: <DollarSign className="w-5 h-5" />,
    description: 'Profit tracker',
  },
];

/* ── Animated Neural Background ─────────────────────────────────── */
function NeuralBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(16,185,129,.3) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(16,185,129,.3) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Radial glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/[0.04] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-cyan-500/[0.03] rounded-full blur-[100px]" />
    </div>
  );
}

/* ── Logo component ──────────────────────────────────────────────── */
function NeuralBetLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/icon-192.png"
        alt="NeuralBet"
        width={36}
        height={36}
        className="w-9 h-9 rounded-xl shadow-lg shadow-emerald-500/25 shrink-0 object-cover"
      />
      {!collapsed && (
        <div className="overflow-hidden">
          <h1 className="text-base font-bold tracking-tight leading-none">NeuralBet</h1>
          <p className="text-[10px] text-emerald-400 uppercase tracking-[0.2em] leading-none mt-0.5">
            V5 Engine
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Engine Status Pill ──────────────────────────────────────────── */
function EngineStatus({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-2.5 py-1.5",
      collapsed && "justify-center px-1.5"
    )}>
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
      {!collapsed && (
        <div className="overflow-hidden">
          <span className="text-[9px] text-emerald-400 font-medium uppercase tracking-wider">Engine Online</span>
          <div className="flex items-center gap-1 mt-0.5">
            <Activity className="w-2.5 h-2.5 text-emerald-500/50" />
            <span className="text-[8px] text-slate-500">467 tests · 7 modules</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main App ────────────────────────────────────────────────────── */
function AppContent() {
  const { activeTab, setActiveTab, sidebarCollapsed, setSidebarCollapsed } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardV2 />;
      case 'predictions': return <Predictions />;
      case 'value-bets': return <ValueBets />;
      case 'live': return <LiveMatches />;
      case 'leagues': return <Leagues />;
      case 'bankroll': return <Bankroll />;
      default: return <DashboardV2 />;
    }
  };

  const handleNavClick = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0e1a]">
      <NeuralBg />

      {/* ── Desktop Sidebar ──────────────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-[#0d1117]/80 backdrop-blur-xl border-r border-white/[0.06] h-full transition-all duration-300 relative z-10",
          sidebarCollapsed ? "w-[68px]" : "w-64"
        )}
      >
        {/* Logo */}
        <div className={cn("border-b border-white/[0.06]", sidebarCollapsed ? "p-3" : "p-5")}>
          <NeuralBetLogo collapsed={sidebarCollapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-200 group relative',
                  sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500/15 to-cyan-500/5 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                )}
              >
                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <span className={cn('transition-colors shrink-0', isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300')}>
                  {item.icon}
                </span>
                {!sidebarCollapsed && (
                  <>
                    <div className="flex-1 text-left overflow-hidden">
                      <span className="block truncate">{item.label}</span>
                    </div>
                    {item.id === 'live' && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="px-2 pb-2">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Engine Status */}
        <div className={cn("border-t border-white/[0.06]", sidebarCollapsed ? "p-2" : "p-3")}>
          <EngineStatus collapsed={sidebarCollapsed} />
        </div>

        {/* Footer */}
        {!sidebarCollapsed && (
          <div className="px-4 pb-3 text-center">
            <div className="text-[9px] text-slate-600">
              Turso · BSD API v2
            </div>
            <div className="text-[9px] text-slate-700 mt-0.5">
              © 2026 NeuralBet
            </div>
          </div>
        )}
      </aside>

      {/* ── Mobile Menu Overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-72 h-full bg-[#0d1117] border-r border-white/[0.06]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                <NeuralBetLogo />
                <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg hover:bg-white/5">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <nav className="p-3 space-y-1">
                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                        isActive
                          ? 'bg-gradient-to-r from-emerald-500/15 to-cyan-500/5 text-emerald-400'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      )}
                    >
                      {item.icon}
                      <div>
                        <span className="block">{item.label}</span>
                        <span className="text-[10px] text-slate-500">{item.description}</span>
                      </div>
                    </button>
                  );
                })}
              </nav>
              <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-white/[0.06]">
                <EngineStatus />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto md:pb-0 pb-16 relative z-10">
        {/* Mobile Header */}
        <div className="md:hidden sticky top-0 z-40 bg-[#0a0e1a]/90 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 rounded-lg hover:bg-white/5">
            <Menu className="w-5 h-5 text-slate-400" />
          </button>
          <NeuralBetLogo />
          <div className="w-8" />
        </div>

        {/* Content Area */}
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ─────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0d1117]/95 backdrop-blur-lg border-t border-white/[0.06] safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-all min-w-[56px] relative',
                  isActive ? 'text-emerald-400' : 'text-slate-500 active:text-slate-300'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-active"
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <span className={cn('transition-colors', isActive ? 'text-emerald-400' : 'text-slate-500')}>
                  {item.icon}
                </span>
                <span className={cn('text-[9px] font-medium', isActive ? 'text-emerald-400' : 'text-slate-500')}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function Home() {
  return <AppContent />;
}
