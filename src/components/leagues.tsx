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
import { Trophy, Search, ArrowLeft, Globe, BarChart3, TrendingUp, Target } from 'lucide-react';
import { useState, useMemo } from 'react';
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

  // Group by country
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-400" />
          Leagues
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse leagues and standings from around the world
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search leagues or countries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-10 bg-white/5 border-white/10"
        />
      </div>

      {/* Leagues grouped by country */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-240px)]">
          <div className="space-y-4 pr-2">
            {groupedLeagues.map(([country, countryLeagues]) => (
              <div key={country}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{countryFlagMap[country] || '⚽'}</span>
                  <h3 className="text-sm font-semibold text-muted-foreground">{country}</h3>
                  <Badge className="bg-white/[0.04] text-slate-400 text-[9px]">{countryLeagues.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <AnimatePresence mode="popLayout">
                    {countryLeagues.map((league) => (
                      <motion.div
                        key={league.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card
                          className="glass-card hover-glow p-3 cursor-pointer transition-all duration-300"
                          onClick={() => setSelectedLeagueId(league.id)}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">{countryFlagMap[league.country || ''] || '⚽'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{league.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {league.current_season && <span>{league.current_season.year}/{(league.current_season.year + 1) % 100}</span>}
                              </div>
                            </div>
                            <BarChart3 className="w-4 h-4 text-muted-foreground/30" />
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── League Standings with Tabbed View ─────────────────────────────────

type StandingsView = 'overall' | 'home' | 'away' | 'xg';

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
      return <span key={i} className={`inline-block w-2 h-2 rounded-full ${color}`} />;
    });
  };

  const viewTabs: Array<{ id: StandingsView; label: string; icon: React.ReactNode }> = [
    { id: 'overall', label: 'Overall', icon: <Trophy className="w-3 h-3" /> },
    { id: 'home', label: 'Home', icon: <Target className="w-3 h-3" /> },
    { id: 'away', label: 'Away', icon: <ArrowLeft className="w-3 h-3" /> },
    { id: 'xg', label: 'xG Plot', icon: <TrendingUp className="w-3 h-3" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 bg-white/5 hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{leagueName}</h1>
          <p className="text-sm text-muted-foreground">
            {data?.season?.name || 'League Standings'}
          </p>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-lg border border-white/[0.06]">
        {viewTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
              view === tab.id
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg bg-white/5" />
          ))}
        </div>
      ) : standings.length > 0 ? (
        view === 'xg' ? (
          <XGScatterPlot standings={standings} />
        ) : (
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-white/5">
                    <th className="text-left py-2 px-2 w-8">#</th>
                    <th className="text-left py-2 px-2">Team</th>
                    <th className="text-center py-2 px-2 w-8">P</th>
                    <th className="text-center py-2 px-2 w-8">W</th>
                    <th className="text-center py-2 px-2 w-8">D</th>
                    <th className="text-center py-2 px-2 w-8">L</th>
                    <th className="text-center py-2 px-2 w-10">GF</th>
                    <th className="text-center py-2 px-2 w-10">GA</th>
                    <th className="text-center py-2 px-2 w-10">GD</th>
                    <th className="text-center py-2 px-2 w-10">Pts</th>
                    {view === 'overall' && (
                      <>
                        <th className="text-center py-2 px-2 w-16">xGD</th>
                        <th className="text-center py-2 px-2 w-24">Form</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team: StandingData, idx: number) => (
                    <motion.tr
                      key={team.teamId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="border-b border-white/3 hover:bg-white/3 transition-colors"
                    >
                      <td className="py-2 px-2 font-mono text-muted-foreground">{team.position}</td>
                      <td className="py-2 px-2 font-medium truncate max-w-[150px]">
                        <span className="flex items-center gap-1.5">
                          {team.teamName}
                          {team.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-pulse" />}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-muted-foreground">{team.played}</td>
                      <td className="py-2 px-2 text-center font-mono text-emerald-400">{team.won}</td>
                      <td className="py-2 px-2 text-center font-mono text-amber-400">{team.drawn}</td>
                      <td className="py-2 px-2 text-center font-mono text-red-400">{team.lost}</td>
                      <td className="py-2 px-2 text-center font-mono">{team.gf}</td>
                      <td className="py-2 px-2 text-center font-mono">{team.ga}</td>
                      <td className="py-2 px-2 text-center font-mono">
                        <span className={team.gd > 0 ? 'text-emerald-400' : team.gd < 0 ? 'text-red-400' : ''}>
                          {team.gd > 0 ? '+' : ''}{team.gd}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-emerald-400">{team.pts}</td>
                      {view === 'overall' && (
                        <>
                          <td className="py-2 px-2 text-center font-mono text-cyan-400">
                            {team.xgd !== null && team.xgd !== undefined ? (team.xgd > 0 ? '+' : '') + team.xgd.toFixed(1) : '-'}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center justify-center gap-1">
                              {getFormDots(team.form)}
                            </div>
                          </td>
                        </>
                      )}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )
      ) : (
        <Card className="glass-card p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <Trophy className="w-8 h-8 text-muted-foreground" />
            <p className="text-muted-foreground">No standings data available</p>
            <p className="text-[11px] text-slate-500">Try syncing data first</p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── xG Scatter Plot ───────────────────────────────────────────────────

function XGScatterPlot({ standings }: { standings: StandingData[] }) {
  const teamsWithXG = standings.filter(t => t.xgf !== null && t.xga !== null && t.xgf !== undefined && t.xga !== undefined);

  if (teamsWithXG.length === 0) {
    return (
      <Card className="glass-card-premium p-8 text-center">
        <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No xG data available for this league</p>
      </Card>
    );
  }

  const maxGf = Math.max(...teamsWithXG.map(t => t.gf / Math.max(1, t.played)), 1);
  const maxGa = Math.max(...teamsWithXG.map(t => t.ga / Math.max(1, t.played)), 1);
  const maxXgf = Math.max(...teamsWithXG.map(t => (t.xgf || 0) / Math.max(1, t.played)), 1);
  const maxXga = Math.max(...teamsWithXG.map(t => (t.xga || 0) / Math.max(1, t.played)), 1);

  const chartWidth = 500;
  const chartHeight = 400;
  const padding = 50;
  const plotW = chartWidth - padding * 2;
  const plotH = chartHeight - padding * 2;

  return (
    <Card className="glass-card-premium p-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
        xG vs Actual Goals — Scatter Plot
      </h3>
      <p className="text-[10px] text-muted-foreground mb-3">
        Teams above the line overperform xG (score more than expected). Below = underperforming.
      </p>
      <div className="overflow-x-auto">
        <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full max-w-lg mx-auto">
          {/* Background */}
          <rect x={0} y={0} width={chartWidth} height={chartHeight} fill="rgba(17,24,39,0.3)" rx="8" />

          {/* Grid lines */}
          {[0, 0.5, 1, 1.5, 2, 2.5, 3].map(v => {
            const x = padding + (v / maxXgf) * plotW;
            const y = chartHeight - padding - (v / maxGf) * plotH;
            return (
              <g key={v}>
                <line x1={x} y1={padding} x2={x} y2={chartHeight - padding} stroke="rgba(255,255,255,0.04)" />
                <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="rgba(255,255,255,0.04)" />
                <text x={x} y={chartHeight - padding + 15} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">{v.toFixed(1)}</text>
                <text x={padding - 10} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="9" fontFamily="monospace">{v.toFixed(1)}</text>
              </g>
            );
          })}

          {/* Axis labels */}
          <text x={chartWidth / 2} y={chartHeight - 5} textAnchor="middle" fill="#94a3b8" fontSize="10">xG per match →</text>
          <text x={10} y={chartHeight / 2} textAnchor="middle" fill="#94a3b8" fontSize="10" transform={`rotate(-90, 10, ${chartHeight / 2})`}>Goals per match →</text>

          {/* Diagonal line (perfect xG correlation) */}
          <line
            x1={padding} y1={chartHeight - padding}
            x2={padding + plotW} y2={chartHeight - padding - plotH}
            stroke="rgba(16,185,129,0.2)" strokeWidth="1" strokeDasharray="4 4"
          />

          {/* Data points */}
          {teamsWithXG.map((team, i) => {
            const xgfPerMatch = (team.xgf || 0) / Math.max(1, team.played);
            const gfPerMatch = team.gf / Math.max(1, team.played);
            const cx = padding + (xgfPerMatch / maxXgf) * plotW;
            const cy = chartHeight - padding - (gfPerMatch / maxGf) * plotH;
            const isOverperforming = gfPerMatch > xgfPerMatch;

            return (
              <g key={team.teamId}>
                <circle
                  cx={cx} cy={cy} r="5"
                  fill={isOverperforming ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'}
                  stroke={isOverperforming ? '#10b981' : '#ef4444'}
                  strokeWidth="1"
                  className="hover:opacity-100 transition-opacity"
                />
                <text
                  x={cx} y={cy - 8}
                  textAnchor="middle" fill="#94a3b8" fontSize="8"
                  fontFamily="sans-serif"
                >
                  {team.teamName.slice(0, 3).toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}
