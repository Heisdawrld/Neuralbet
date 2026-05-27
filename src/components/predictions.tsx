'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchOurPredictions } from '@/lib/api';
import { PunterMatchCard } from '@/components/punter-match-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Filter, Star, TrendingUp, ShieldCheck, AlertTriangle, Eye } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { PredictionData, OurPredictionData } from '@/lib/types';

type SortKey = 'confidence' | 'date' | 'league' | 'risk';
type DecisionFilter = 'all' | 'strong-bet' | 'bet' | 'small-bet' | 'watch' | 'pass';

export function Predictions() {
  const [minConfidence, setMinConfidence] = useState(0);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('confidence');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');

  const { data: predictionsData, isLoading } = useQuery({
    queryKey: ['our-predictions', 'all'],
    queryFn: () => fetchOurPredictions({ limit: 100 }),
    refetchInterval: 60000,
  });

  const predictions = predictionsData?.results || [];
  const rawPredictions = predictionsData?.raw || [];

  const filteredPredictions = useMemo(() => {
    let filtered = [...predictions];
    const rawFiltered = [...rawPredictions];

    // Filter by punter decision
    if (decisionFilter !== 'all') {
      const filteredIds = new Set(
        rawFiltered
          .filter((p) => p.decision.action === decisionFilter)
          .map((p) => p.eventId)
      );
      filtered = filtered.filter((p) => filteredIds.has(p.id));
    }

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
  }, [predictions, rawPredictions, recommendedOnly, minConfidence, leagueFilter, sortBy, decisionFilter]);

  // Count decisions
  const decisionCounts = useMemo(() => {
    const counts = { 'strong-bet': 0, 'bet': 0, 'small-bet': 0, 'watch': 0, 'pass': 0 };
    rawPredictions.forEach((p) => {
      const action = p.decision.action;
      if (action in counts) counts[action as keyof typeof counts]++;
    });
    return counts;
  }, [rawPredictions]);

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

  // Build raw prediction map for lookups
  const rawPredictionMap = useMemo(() => {
    const map = new Map<number, OurPredictionData>();
    rawPredictions.forEach((p) => map.set(p.eventId, p));
    return map;
  }, [rawPredictions]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-emerald-400" />
          Predictions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Punter Brain v2 — Thinks like a human, bets like a pro
        </p>
      </div>

      {/* Filters */}
      <Card className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Decision</Label>
            <Select value={decisionFilter} onValueChange={(v) => setDecisionFilter(v as DecisionFilter)}>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Decisions</SelectItem>
                <SelectItem value="strong-bet">💪 Strong Bet ({decisionCounts['strong-bet']})</SelectItem>
                <SelectItem value="bet">✅ Bet ({decisionCounts['bet']})</SelectItem>
                <SelectItem value="small-bet">🔍 Small Bet ({decisionCounts['small-bet']})</SelectItem>
                <SelectItem value="watch">👁 Watch ({decisionCounts['watch']})</SelectItem>
                <SelectItem value="pass">🚫 Pass ({decisionCounts['pass']})</SelectItem>
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
        <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
          <ShieldCheck className="w-3 h-3 mr-1" />
          {decisionCounts['strong-bet'] + decisionCounts['bet']} Bets
        </Badge>
        <Badge variant="secondary" className="bg-violet-500/10 text-violet-400 border-violet-500/20">
          <Eye className="w-3 h-3 mr-1" />
          {decisionCounts['watch']} Watching
        </Badge>
      </div>

      {/* Predictions Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : filteredPredictions.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-380px)]">
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
                  <PunterMatchCard
                    prediction={pred}
                    ourPrediction={rawPredictionMap.get(pred.id)}
                  />
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
