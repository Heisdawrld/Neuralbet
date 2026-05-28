'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DollarSign, TrendingUp, TrendingDown, Percent, Target, Plus, Trash2, BarChart3, Filter, Shield, PieChart } from 'lucide-react';
import { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import type { BetRecord } from '@/lib/types';

const STORAGE_KEY = 'neuralbet_bankroll';

function saveBets(bets: BetRecord[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
}

type FilterType = 'all' | 'win' | 'loss' | 'pending' | 'void';

export function Bankroll() {
  const [bets, setBets] = useState<BetRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [form, setForm] = useState({
    match: '',
    selection: '',
    odds: '',
    stake: '',
    result: 'pending' as BetRecord['result'],
    league: '',
  });

  const addBet = () => {
    const odds = parseFloat(form.odds) || 0;
    const stake = parseFloat(form.stake) || 0;
    const profit = form.result === 'win' ? stake * (odds - 1) : form.result === 'loss' ? -stake : 0;

    const newBet: BetRecord = {
      id: uuidv4(),
      match: form.match,
      selection: form.selection,
      odds,
      stake,
      result: form.result,
      profit,
      date: new Date().toISOString(),
      league: form.league,
    };

    const updated = [newBet, ...bets];
    setBets(updated);
    saveBets(updated);
    setForm({ match: '', selection: '', odds: '', stake: '', result: 'pending', league: '' });
    setDialogOpen(false);
  };

  const deleteBet = (id: string) => {
    const updated = bets.filter((b) => b.id !== id);
    setBets(updated);
    saveBets(updated);
  };

  const stats = useMemo(() => {
    const settled = bets.filter((b) => b.result === 'win' || b.result === 'loss');
    const wins = settled.filter((b) => b.result === 'win');
    const totalStake = settled.reduce((s, b) => s + b.stake, 0);
    const totalProfit = settled.reduce((s, b) => s + b.profit, 0);
    const avgOdds = settled.length > 0 ? settled.reduce((s, b) => s + b.odds, 0) / settled.length : 0;
    const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
    const winRate = settled.length > 0 ? (wins.length / settled.length) * 100 : 0;

    // Kelly staking recommendation
    const kellyStake = winRate > 0 && avgOdds > 1 ? ((winRate / 100) * (avgOdds - 1) - (1 - winRate / 100)) / (avgOdds - 1) : 0;

    return {
      totalProfit,
      roi,
      winRate,
      avgOdds,
      totalBets: bets.length,
      settledBets: settled.length,
      wins: wins.length,
      losses: settled.length - wins.length,
      pendingBets: bets.filter(b => b.result === 'pending').length,
      kellyStake: Math.max(0, kellyStake),
    };
  }, [bets]);

  const chartData = useMemo(() => {
    const sortedBets = [...bets]
      .filter((b) => b.result === 'win' || b.result === 'loss')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const cumulativeProfits = sortedBets.reduce<number[]>((acc, b, i) => {
      const prev = i > 0 ? acc[i - 1] : 0;
      acc.push(prev + b.profit);
      return acc;
    }, []);

    return sortedBets.map((b, i) => ({
      name: `Bet ${i + 1}`,
      profit: cumulativeProfits[i],
      bet: b.profit,
    }));
  }, [bets]);

  const filteredBets = useMemo(() => {
    if (filter === 'all') return bets;
    return bets.filter(b => b.result === filter);
  }, [bets, filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            Bankroll Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your betting performance and ROI
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add Bet
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#111827] border-white/10 text-foreground">
            <DialogHeader>
              <DialogTitle>Log New Bet</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Match</Label>
                <Input
                  value={form.match}
                  onChange={(e) => setForm({ ...form, match: e.target.value })}
                  placeholder="Team A vs Team B"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Selection</Label>
                  <Input
                    value={form.selection}
                    onChange={(e) => setForm({ ...form, selection: e.target.value })}
                    placeholder="Home Win"
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">League</Label>
                  <Input
                    value={form.league}
                    onChange={(e) => setForm({ ...form, league: e.target.value })}
                    placeholder="Premier League"
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Odds</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.odds}
                    onChange={(e) => setForm({ ...form, odds: e.target.value })}
                    placeholder="2.10"
                    className="bg-white/5 border-white/10 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Stake</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.stake}
                    onChange={(e) => setForm({ ...form, stake: e.target.value })}
                    placeholder="10.00"
                    className="bg-white/5 border-white/10 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Result</Label>
                  <Select value={form.result} onValueChange={(v) => setForm({ ...form, result: v as BetRecord['result'] })}>
                    <SelectTrigger className="bg-white/5 border-white/10 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="win">Win</SelectItem>
                      <SelectItem value="loss">Loss</SelectItem>
                      <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={addBet}
                disabled={!form.match || !form.odds || !form.stake}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                Log Bet
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={<DollarSign className="w-4 h-4" />} label="Profit/Loss" value={`$${stats.totalProfit.toFixed(2)}`} color={stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <StatCard icon={<Percent className="w-4 h-4" />} label="ROI" value={`${stats.roi.toFixed(1)}%`} color={stats.roi >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <StatCard icon={<Target className="w-4 h-4" />} label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color={stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'} />
        <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Avg Odds" value={stats.avgOdds.toFixed(2)} color="text-cyan-400" />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Wins" value={String(stats.wins)} color="text-emerald-400" />
        <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Losses" value={String(stats.losses)} color="text-red-400" />
        <StatCard icon={<Shield className="w-4 h-4" />} label="Kelly %" value={`${(stats.kellyStake * 100).toFixed(1)}%`} color="text-violet-400" />
      </div>

      {/* Kelly Staking Recommendation */}
      {stats.settledBets > 5 && (
        <Card className="glass-card-premium p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-medium">Kelly Staking Recommendation</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground mb-1">
                Based on your win rate ({stats.winRate.toFixed(1)}%) and avg odds ({stats.avgOdds.toFixed(2)}):
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Recommended stake per bet:</span>
                <span className="text-lg font-bold font-mono text-violet-400">
                  {(stats.kellyStake * 100).toFixed(1)}%
                </span>
                <span className="text-[10px] text-muted-foreground">of bankroll</span>
              </div>
              {stats.kellyStake <= 0 && (
                <p className="text-[10px] text-amber-400 mt-1">
                  ⚠ Negative Kelly suggests no edge — consider reducing bet sizes
                </p>
              )}
            </div>
            <div className="w-20 h-20">
              <svg viewBox="0 0 80 80" className="w-full h-full">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                <circle cx="40" cy="40" r="32" fill="none" stroke="#8b5cf6" strokeWidth="6" strokeDasharray={`${2 * Math.PI * 32}`} strokeDashoffset={`${2 * Math.PI * 32 * (1 - Math.min(stats.kellyStake, 1))}`} strokeLinecap="round" className="-rotate-90 origin-center donut-animate" />
                <text x="40" y="43" textAnchor="middle" fill="#8b5cf6" fontSize="14" fontFamily="monospace" fontWeight="bold">
                  {(stats.kellyStake * 100).toFixed(0)}%
                </text>
              </svg>
            </div>
          </div>
        </Card>
      )}

      {/* Profit Chart */}
      {chartData.length > 0 && (
        <Card className="glass-card p-4">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Cumulative Profit/Loss
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                  }}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#10b981"
                  fill="url(#profitGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Filter + Bets List */}
      {bets.length > 0 && (
        <>
          {/* Filter Tabs */}
          <div className="flex gap-1 p-1 bg-white/[0.03] rounded-lg border border-white/[0.06]">
            {(['all', 'win', 'loss', 'pending', 'void'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium transition-all capitalize ${
                  filter === f
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                }`}
              >
                <Filter className="w-3 h-3" />
                {f} {f === 'all' ? `(${bets.length})` : `(${bets.filter(b => b.result === f).length})`}
              </button>
            ))}
          </div>

          <ScrollArea className="h-[calc(100vh-600px)]">
            <div className="space-y-2 pr-2">
              {filteredBets.map((bet, idx) => (
                <motion.div
                  key={bet.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <Card className="glass-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{bet.match}</span>
                          <ResultBadge result={bet.result} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground font-mono">
                          <span>{bet.selection}</span>
                          <span>@{bet.odds.toFixed(2)}</span>
                          <span>Stake: ${bet.stake.toFixed(2)}</span>
                          {bet.league && <span>· {bet.league}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-mono font-bold ${
                            bet.profit > 0 ? 'text-emerald-400' : bet.profit < 0 ? 'text-red-400' : 'text-muted-foreground'
                          }`}
                        >
                          {bet.profit > 0 ? '+' : ''}${bet.profit.toFixed(2)}
                        </span>
                        <button
                          onClick={() => deleteBet(bet.id)}
                          className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Empty state */}
      {bets.length === 0 && (
        <Card className="glass-card p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-foreground">No Bets Logged</p>
            <p className="text-muted-foreground text-sm">Start tracking your bets to see performance analytics</p>
            <Button onClick={() => setDialogOpen(true)} variant="ghost" className="text-emerald-400 border border-emerald-500/20 mt-2">
              <Plus className="w-4 h-4 mr-2" />
              Log Your First Bet
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card className="glass-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-lg font-bold font-mono ${color}`}>{value}</span>
    </Card>
  );
}

function ResultBadge({ result }: { result: BetRecord['result'] }) {
  const styles: Record<string, string> = {
    win: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    loss: 'bg-red-500/15 text-red-400 border-red-500/20',
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    void: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  };

  return (
    <Badge className={`${styles[result]} text-[10px] capitalize`}>
      {result}
    </Badge>
  );
}
