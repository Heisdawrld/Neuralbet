'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchLeagues, fetchLeagueStandings } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, Search, ArrowLeft, BarChart3, TrendingUp, Target } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { StandingData } from '@/lib/types';

interface LeagueItem {
  id: number;
  name: string;
  country: string;
  is_women: boolean;
  is_active: boolean;
  current_season: {
    id: number;
    name: string;
    year: number;
    start_date: string;
    end_date: string;
    is_current: boolean;
  } | null;
}

const countryFlagMap: Record<string, string> = {
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Spain': '🇪🇸', 'Germany': '🇩🇪', 'Italy': '🇮🇹',
  'France': '🇫🇷', 'Netherlands': '🇳🇱', 'Portugal': '🇵🇹', 'Brazil': '🇧🇷',
  'Argentina': '🇦🇷', 'Turkey': '🇹🇷', 'Belgium': '🇧🇪', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'USA': '🇺🇸', 'Mexico': '🇲🇽', 'Japan': '🇯🇵', 'South Korea': '🇰🇷',
  'Australia': '🇦🇺', 'China': '🇨🇳', 'Russia': '🇷🇺', 'Ukraine': '🇺🇦',
  'Poland': '🇵🇱', 'Sweden': '🇸🇪', 'Norway': '🇳🇴', 'Denmark': '🇩🇰',
  'Switzerland': '🇨🇭', 'Austria': '🇦🇹', 'Czech Republic': '🇨🇿', 'Greece': '🇬🇷',
  'Romania': '🇷🇴', 'Croatia': '🇭🇷', 'Serbia': '🇷🇸', 'Colombia': '🇨🇴',
  'Chile': '🇨🇱', 'Ecuador': '🇪🇨', 'Peru': '🇵🇪', 'Uruguay': '🇺🇾',
  'Paraguay': '🇵🇾', 'Saudi Arabia': '🇸🇦', 'Egypt': '🇪🇬', 'Nigeria': '🇳🇬',
  'South Africa': '🇿🇦', 'International': '🌍', 'Europe': '🇪🇺', 'World': '🌍',
  'Africa': '🌍', 'South America': '🌎', 'Asia': '🌏', 'Venezuela': '🇻🇪',
  'Finland': '🇫🇮', 'Ireland': '🇮🇪', 'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Israel': '🇮🇱',
};

export function Leagues() {
  const [search, setSearch] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);

  const { data: leaguesData, isLoading } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => fetchLeagues(200),
  });

  const leagues = leaguesData?.results || [];

  const filteredLeagues = useMemo(() => {
    if (!search) return leagues;
    const q = search.toLowerCase();
    return (leagues as LeagueItem[]).filter(
      (l) => l.name.toLowerCase().includes(q) || (l.country || '').toLowerCase().includes(q)
    );
  }, [leagues, search]);

  const groupedLeagues = useMemo(() => {
    const groups: Record<string, LeagueItem[]> = {};
    for (const league of filteredLeagues as LeagueItem[]) {
      const country = league.country || 'International';
      if (!groups[country]) groups[country] = [];
      groups[country].push(league);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLeagues]);

  if (selectedLeagueId) {
    const leagueName = (leagues as LeagueItem[]).find((l) => l.id === selectedLeagueId)?.name || 'League';
    return (
      <LeagueStandings
        leagueId={selectedLeagueId}
        leagueName={leagueName}
        onBack={() => setSelectedLeagueId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          Leagues
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Browse leagues and standings from around the world
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search leagues or countries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/30 focus:bg-white/[0.05] transition-all"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl glass-skeleton" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {groupedLeagues.map(([country, countryLeagues]) => (
            <div key={country}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{countryFlagMap[country] || '⚽'}</span>
                <h3 className="text-sm font-semibold text-slate-300">{country}</h3>
                <span className="text-[10px] text-slate-500 font-mono">{countryLeagues.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {countryLeagues.map((league, i) => (
                  <motion.button
                    key={league.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    onClick={() => setSelectedLeagueId(league.id)}
                    className="w-full rounded-xl border border-white/[0.06] bg-[#0d1117]/80 p-3 text-left hover:border-emerald-500/20 hover:bg-white/[0.03] transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{countryFlagMap[league.country || ''] || '⚽'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{league.name}</div>
                        {league.current_season && (
                          <div className="text-[10px] text-slate-500">{league.current_season.year}/{(league.current_season.year + 1) % 100}</div>
                        )}
                      </div>
                      <BarChart3 className="w-4 h-4 text-slate-600" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── League Standings ────────────────────────────────────────────────

type StandingsView = 'overall' | 'xg';

function LeagueStandings({
  leagueId,
  leagueName,
  onBack,
}: {
  leagueId: number;
  leagueName: string;
  onBack: () => void;
}) {
  const [view, setView] = useState<StandingsView>('overall');
  const { data, isLoading } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fetchLeagueStandings(leagueId),
    enabled: !!leagueId,
  });

  const standings = data?.standings || [];

  const getFormDots = (form?: string | null) => {
    if (!form) return null;
    return form.split('').slice(0, 5).map((ch, i) => {
      const color = ch === 'W' ? 'bg-emerald-400' : ch === 'D' ? 'bg-amber-400' : 'bg-red-400';
      return <span key={i} className={cn('inline-block w-2 h-2 rounded-full', color)} />;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{leagueName}</h1>
          <p className="text-sm text-slate-500">{data?.season?.name || 'Standings'}</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1.5">
        {([
          { id: 'overall' as const, label: 'Table', icon: <Trophy className="w-3 h-3" /> },
          { id: 'xg' as const, label: 'xG Plot', icon: <TrendingUp className="w-3 h-3" /> },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all',
              view === tab.id
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                : 'bg-white/[0.02] text-slate-400 border-white/[0.06] hover:bg-white/[0.05]'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg glass-skeleton" />
          ))}
        </div>
      ) : standings.length > 0 ? (
        view === 'xg' ? (
          <XGScatterPlot standings={standings} />
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
                    <th className="text-left py-2.5 px-3 w-8">#</th>
                    <th className="text-left py-2.5 px-3">Team</th>
                    <th className="text-center py-2.5 px-2 w-8">P</th>
                    <th className="text-center py-2.5 px-2 w-8">W</th>
                    <th className="text-center py-2.5 px-2 w-8">D</th>
                    <th className="text-center py-2.5 px-2 w-8">L</th>
                    <th className="text-center py-2.5 px-2 w-10">GD</th>
                    <th className="text-center py-2.5 px-2 w-10 font-bold">Pts</th>
                    <th className="text-center py-2.5 px-2 w-14">xGD</th>
                    <th className="text-center py-2.5 px-3 w-24">Form</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team: StandingData, idx: number) => (
                    <motion.tr
                      key={team.teamId}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-2 px-3 font-mono text-slate-500 text-xs">{team.position}</td>
                      <td className="py-2 px-3 font-medium truncate max-w-[160px]">
                        <span className="flex items-center gap-1.5">
                          {team.teamName}
                          {team.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-pulse" />}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-slate-400 text-xs">{team.played}</td>
                      <td className="py-2 px-2 text-center font-mono text-emerald-400 text-xs">{team.won}</td>
                      <td className="py-2 px-2 text-center font-mono text-amber-400 text-xs">{team.drawn}</td>
                      <td className="py-2 px-2 text-center font-mono text-red-400 text-xs">{team.lost}</td>
                      <td className="py-2 px-2 text-center font-mono text-xs">
                        <span className={team.gd > 0 ? 'text-emerald-400' : team.gd < 0 ? 'text-red-400' : 'text-slate-400'}>
                          {team.gd > 0 ? '+' : ''}{team.gd}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-emerald-400 text-xs">{team.pts}</td>
                      <td className="py-2 px-2 text-center font-mono text-cyan-400 text-xs">
                        {team.xgd != null ? (team.xgd > 0 ? '+' : '') + team.xgd.toFixed(1) : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-center gap-0.5">
                          {getFormDots(team.form)}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-10 text-center">
          <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No standings data available</p>
        </div>
      )}
    </div>
  );
}

// ── xG Scatter Plot ─────────────────────────────────────────────────

function XGScatterPlot({ standings }: { standings: StandingData[] }) {
  const teamsWithXG = standings.filter(t => t.xgf != null && t.xga != null);

  if (teamsWithXG.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-10 text-center">
        <TrendingUp className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">No xG data available</p>
      </div>
    );
  }

  const maxGf = Math.max(...teamsWithXG.map(t => t.gf / Math.max(1, t.played)), 1);
  const maxXgf = Math.max(...teamsWithXG.map(t => (t.xgf || 0) / Math.max(1, t.played)), 1);

  const chartWidth = 500;
  const chartHeight = 400;
  const padding = 50;
  const plotW = chartWidth - padding * 2;
  const plotH = chartHeight - padding * 2;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 p-4">
      <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
        xG vs Actual Goals
      </h3>
      <p className="text-[10px] text-slate-500 mb-4">
        Above the line = overperforming xG. Below = underperforming.
      </p>
      <div className="overflow-x-auto">
        <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full max-w-lg mx-auto">
          <rect x={0} y={0} width={chartWidth} height={chartHeight} fill="rgba(17,24,39,0.3)" rx="8" />
          {[0, 0.5, 1, 1.5, 2, 2.5, 3].map(v => {
            const x = padding + (v / maxXgf) * plotW;
            const y = chartHeight - padding - (v / maxGf) * plotH;
            return (
              <g key={v}>
                <line x1={x} y1={padding} x2={x} y2={chartHeight - padding} stroke="rgba(255,255,255,0.04)" />
                <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="rgba(255,255,255,0.04)" />
                <text x={x} y={chartHeight - padding + 15} textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="monospace">{v.toFixed(1)}</text>
                <text x={padding - 10} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="monospace">{v.toFixed(1)}</text>
              </g>
            );
          })}
          <text x={chartWidth / 2} y={chartHeight - 5} textAnchor="middle" fill="#64748b" fontSize="10">xG per match →</text>
          <text x={10} y={chartHeight / 2} textAnchor="middle" fill="#64748b" fontSize="10" transform={`rotate(-90, 10, ${chartHeight / 2})`}>Goals per match →</text>
          <line x1={padding} y1={chartHeight - padding} x2={padding + plotW} y2={chartHeight - padding - plotH} stroke="rgba(16,185,129,0.2)" strokeWidth="1" strokeDasharray="4 4" />
          {teamsWithXG.map((team) => {
            const xgfPerMatch = (team.xgf || 0) / Math.max(1, team.played);
            const gfPerMatch = team.gf / Math.max(1, team.played);
            const cx = padding + (xgfPerMatch / maxXgf) * plotW;
            const cy = chartHeight - padding - (gfPerMatch / maxGf) * plotH;
            const over = gfPerMatch > xgfPerMatch;
            return (
              <g key={team.teamId}>
                <circle cx={cx} cy={cy} r="5" fill={over ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'} stroke={over ? '#10b981' : '#ef4444'} strokeWidth="1" />
                <text x={cx} y={cy - 8} textAnchor="middle" fill="#94a3b8" fontSize="8">{team.teamName.slice(0, 3).toUpperCase()}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
