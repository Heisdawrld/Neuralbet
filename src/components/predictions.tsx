'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchPredictions, fetchLeagues } from '@/lib/api';
import { MatchCard } from '@/components/match-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Filter, Star, TrendingUp } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { PredictionData } from '@/lib/types';

type SortKey = 'confidence' | 'date' | 'league';

export function Predictions() {
  const [minConfidence, setMinConfidence] = useState(0);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('confidence');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');

  const { data: predictionsData, isLoading } = useQuery({
    queryKey: ['predictions', 'all'],
    queryFn: () => fetchPredictions({ status: 'upcoming', limit: 100 }),
    refetchInterval: 60000,
  });

  const predictions = predictionsData?.results || [];

  const filteredPredictions = useMemo(() => {
    let filtered = [...predictions];

    if (recommendedOnly) {
      filtered = filtered.filter((p: PredictionData) => p.isRecommended);
    }

    if (minConfidence > 0) {
      filtered = filtered.filter((p: PredictionData) => p.confidence >= minConfidence / 100);
    }

    if (leagueFilter !== 'all') {
      filtered = filtered.filter((p: PredictionData) => String(p.match.leagueId) === leagueFilter);
    }

    filtered.sort((a: PredictionData, b: PredictionData) => {
      switch (sortBy) {
        case 'confidence':
          return b.confidence - a.confidence;
        case 'date':
          return new Date(a.match.eventDate).getTime() - new Date(b.match.eventDate).getTime();
        case 'league':
          return (a.match.leagueName || '').localeCompare(b.match.leagueName || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [predictions, recommendedOnly, minConfidence, leagueFilter, sortBy]);

  // Get unique leagues from predictions
  const uniqueLeagues = useMemo(() => {
    const leagueMap = new Map<number, string>();
    predictions.forEach((p: PredictionData) => {
      if (p.match.leagueId && p.match.leagueName) {
        leagueMap.set(p.match.leagueId, p.match.leagueName);
      }
    });
    return Array.from(leagueMap.entries()).map(([id, name]) => ({ id, name }));
  }, [predictions]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-emerald-400" />
          Predictions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          ML-powered match predictions with confidence ratings
        </p>
      </div>

      {/* Filters */}
      <Card className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Min Confidence: {minConfidence}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">League</Label>
            <Select value={leagueFilter} onValueChange={setLeagueFilter}>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10">
                <SelectValue placeholder="All Leagues" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Leagues</SelectItem>
                {uniqueLeagues.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Sort By</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confidence">Confidence</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="league">League</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 pt-5">
            <Switch
              checked={recommendedOnly}
              onCheckedChange={setRecommendedOnly}
              className="data-[state=checked]:bg-emerald-500"
            />
            <Label className="text-xs flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400" />
              Recommended Only
            </Label>
          </div>
        </div>
      </Card>

      {/* Stats Row */}
      <div className="flex gap-3 flex-wrap">
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          <TrendingUp className="w-3 h-3 mr-1" />
          {filteredPredictions.length} Predictions
        </Badge>
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
          <Star className="w-3 h-3 mr-1" />
          {filteredPredictions.filter((p: PredictionData) => p.isRecommended).length} Recommended
        </Badge>
      </div>

      {/* Predictions Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : filteredPredictions.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-320px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
            <AnimatePresence mode="popLayout">
              {filteredPredictions.map((pred: PredictionData) => (
                <motion.div
                  key={pred.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                >
                  <MatchCard prediction={pred} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      ) : (
        <Card className="glass-card p-8 text-center">
          <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No predictions match your filters</p>
        </Card>
      )}
    </div>
  );
}
