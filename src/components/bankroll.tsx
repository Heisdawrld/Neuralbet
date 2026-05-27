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
import { DollarSign, TrendingUp, TrendingDown, Percent, Target, Plus, Trash2, BarChart3 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import type { BetRecord } from '@/lib/types';

const STORAGE_KEY = 'neuralbet_bankroll';

function saveBets(bets: BetRecord[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
}

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

    return {
      totalProfit,
      roi,
      winRate,
      avgOdds,
      totalBets: bets.length,
      settledBets: settled.length,
      wins: wins.length,
    };
  }, [bets]);

  const chartData = useMemo(() => {
    const sortedBets = [...bets]
      .filter((b) => b.result === 'win' || b.result === 'loss')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate cumulative profits using reduce to avoid mutation in map
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Profit/Loss"
          value={`$${stats.totalProfit.toFixed(2)}`}
          color={stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCard
          icon={<Percent className="w-4 h-4" />}
          label="ROI"
          value={`${stats.roi.toFixed(1)}%`}
          color={stats.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCard
          icon={<Target className="w-4 h-4" />}
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          color={stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}
        />
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Avg Odds"
          value={stats.avgOdds.toFixed(2)}
          color="text-cyan-400"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Wins"
          value={String(stats.wins)}
          color="text-emerald-400"
        />
        <StatCard
          icon={<TrendingDown className="w-4 h-4" />}
          label="Total Bets"
          value={String(stats.totalBets)}
          color="text-slate-400"
        />
      </div>

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

      {/* Bets List */}
      {bets.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-560px)]">
          <div className="space-y-2 pr-2">
            {bets.map((bet, idx) => (
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
                        {bet.league && <span>• {bet.league}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono font-bold ${
                          bet.profit > 0
                            ? 'text-emerald-400'
                            : bet.profit < 0
                            ? 'text-red-400'
                            : 'text-muted-foreground'
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
      ) : (
        <Card className="glass-card p-12 text-center">
          <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">No Bets Logged</p>
          <p className="text-muted-foreground">Start tracking your bets to see performance analytics</p>
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
