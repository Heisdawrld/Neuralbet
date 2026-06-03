import { getAuth } from '@/lib/auth/server';
import { getPerformance } from '@/lib/performance/records';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/dashboard/topbar';
import { BarChart3, Clock, Target, TrendingUp } from 'lucide-react';

function pct(v: number | null) {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function units(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}u`;
}

export default async function PerformancePage() {
  const { userId } = await getAuth();
  if (!userId) redirect('/sign-in');

  const perf = await getPerformance(userId);
  const cards = [
    { label: 'Tracked Picks', value: String(perf.total), sub: `${perf.pending} pending`, icon: BarChart3, color: 'text-blue-300' },
    { label: 'Hit Rate', value: pct(perf.hitRate), sub: `${perf.wins}W / ${perf.losses}L`, icon: Target, color: 'text-emerald-300' },
    { label: 'ROI', value: pct(perf.roi), sub: `${units(perf.profit)} profit`, icon: TrendingUp, color: perf.profit >= 0 ? 'text-emerald-300' : 'text-red-300' },
    { label: 'Settled', value: String(perf.settled), sub: `${perf.stake.toFixed(2)}u staked`, icon: Clock, color: 'text-violet-300' },
  ];

  return (
    <div>
      <Topbar title="Performance" />
      <main className="p-6">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-white">Performance intelligence</h2>
          <p className="mt-1 text-slate-400">Every prediction is tracked, settled, and measured by market.</p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label} className="glass rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div className={`text-3xl font-black ${color}`}>{value}</div>
              <div className="mt-1 text-xs text-slate-500">{sub}</div>
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-bold text-slate-200">By Market</h3>
            <span className="text-xs text-slate-500">CLV tracking comes after closing odds capture</span>
          </div>
          {perf.byMarket.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center text-slate-400">
              No prediction records yet. Generate predictions to start building your performance profile.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/70 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Market</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Settled</th>
                    <th className="px-4 py-3">Hit Rate</th>
                    <th className="px-4 py-3">ROI</th>
                    <th className="px-4 py-3">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/30">
                  {perf.byMarket.map((m) => (
                    <tr key={m.market}>
                      <td className="px-4 py-3 font-bold text-slate-200">{m.market}</td>
                      <td className="px-4 py-3 text-slate-400">{m.total}</td>
                      <td className="px-4 py-3 text-slate-400">{m.settled}</td>
                      <td className="px-4 py-3 text-slate-400">{pct(m.hitRate)}</td>
                      <td className={`px-4 py-3 font-bold ${m.roi == null ? 'text-slate-500' : m.roi >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{pct(m.roi)}</td>
                      <td className={`px-4 py-3 font-bold ${m.profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{units(m.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
