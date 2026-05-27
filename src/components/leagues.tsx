'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchLeagues, fetchLeagueStandings } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Trophy, Search, ArrowLeft, Globe, BarChart3 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
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
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Spain': '🇪🇸',
  'Germany': '🇩🇪',
  'Italy': '🇮🇹',
  'France': '🇫🇷',
  'Netherlands': '🇳🇱',
  'Portugal': '🇵🇹',
  'Brazil': '🇧🇷',
  'Argentina': '🇦🇷',
  'Turkey': '🇹🇷',
  'Belgium': '🇧🇪',
  'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'USA': '🇺🇸',
  'Mexico': '🇲🇽',
  'Japan': '🇯🇵',
  'South Korea': '🇰🇷',
  'Australia': '🇦🇺',
  'China': '🇨🇳',
  'Russia': '🇷🇺',
  'Ukraine': '🇺🇦',
  'Poland': '🇵🇱',
  'Sweden': '🇸🇪',
  'Norway': '🇳🇴',
  'Denmark': '🇩🇰',
  'Switzerland': '🇨🇭',
  'Austria': '🇦🇹',
  'Czech Republic': '🇨🇿',
  'Greece': '🇬🇷',
  'Romania': '🇷🇴',
  'Croatia': '🇭🇷',
  'Serbia': '🇷🇸',
  'Colombia': '🇨🇴',
  'Chile': '🇨🇱',
  'Ecuador': '🇪🇨',
  'Peru': '🇵🇪',
  'Uruguay': '🇺🇾',
  'Paraguay': '🇵🇾',
  'Saudi Arabia': '🇸🇦',
  'Egypt': '🇪🇬',
  'Nigeria': '🇳🇬',
  'South Africa': '🇿🇦',
  'International': '🌍',
  'Europe': '🇪🇺',
  'World': '🌍',
  'Africa': '🌍',
  'South America': '🌎',
  'Asia': '🌏',
  'Venezuela': '🇻🇪',
  'Finland': '🇫🇮',
  'Ireland': '🇮🇪',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'Israel': '🇮🇱',
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
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.country || '').toLowerCase().includes(q)
    );
  }, [leagues, search]);

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
          placeholder="Search leagues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-10 bg-white/5 border-white/10"
        />
      </div>

      {/* Leagues Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-240px)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-2">
            <AnimatePresence mode="popLayout">
              {(filteredLeagues as LeagueItem[]).map((league) => (
                <motion.div
                  key={league.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card
                    className="glass-card hover-glow p-4 cursor-pointer transition-all duration-300"
                    onClick={() => setSelectedLeagueId(league.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {countryFlagMap[league.country || ''] || '⚽'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{league.name}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {league.country || 'International'}
                          {league.current_season && <span className="ml-1">• {league.current_season.year}/{(league.current_season.year + 1) % 100}</span>}
                        </div>
                      </div>
                      <BarChart3 className="w-4 h-4 text-muted-foreground/30" />
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function LeagueStandings({
  leagueId,
  leagueName,
  onBack,
}: {
  leagueId: number;
  leagueName: string;
  onBack: () => void;
}) {
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
      return (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-full ${color}`}
        />
      );
    });
  };

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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg bg-white/5" />
          ))}
        </div>
      ) : standings.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-200px)]">
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
                  <th className="text-center py-2 px-2 w-16">xGD</th>
                  <th className="text-center py-2 px-2 w-24">Form</th>
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
                    <td className="py-2 px-2 font-mono text-muted-foreground">
                      {team.position}
                    </td>
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
                    <td className="py-2 px-2 text-center font-mono text-cyan-400">
                      {team.xgd !== null && team.xgd !== undefined ? (team.xgd > 0 ? '+' : '') + team.xgd.toFixed(1) : '-'}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center justify-center gap-1">
                        {getFormDots(team.form)}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      ) : (
        <Card className="glass-card p-8 text-center">
          <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No standings data available</p>
        </Card>
      )}
    </div>
  );
}
