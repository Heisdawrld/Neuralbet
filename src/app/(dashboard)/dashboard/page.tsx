import { getAuth, getCurrentUser } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/dashboard/topbar';
import { Brain, TrendingUp, Target, Zap } from 'lucide-react';

export default async function DashboardPage() {
  const { userId } = await getAuth();
  if (!userId) redirect('/sign-in');
  const user = await getCurrentUser();

  const stats = [
    { label: 'Predictions Today', value: '0', sub: 'of 1 free', icon: Brain, color: 'text-blue-300' },
    { label: 'Win Rate', value: '—', sub: 'No data yet', icon: Target, color: 'text-emerald-300' },
    { label: 'ROI', value: '—', sub: 'No settled bets', icon: TrendingUp, color: 'text-amber-300' },
    { label: 'Active Tips', value: '0', sub: 'Live now', icon: Zap, color: 'text-violet-300' },
  ];

  return (
    <div>
      <Topbar title="Overview" />
      <main className="p-4 md:p-6">
        {/* Greeting */}
        <div className="mb-8">
          <h2 className="text-2xl font-black text-white">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}.
          </h2>
          <p className="mt-1 text-slate-400">Here&apos;s your intelligence briefing for today.</p>
        </div>

        {/* Upgrade Banner */}
        <div className="glass mb-8 flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-bold text-blue-200">Unlock Cipher Premium</div>
            <div className="mt-1 text-xs text-slate-400">Unlimited predictions, full analyst reports, edge detection and Kelly stake sizing.</div>
          </div>
          <button className="w-full shrink-0 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(59,130,246,.3)] hover:bg-blue-400 sm:w-auto">
            Upgrade — $19/mo
          </button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {stats.map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div className={`text-3xl font-black ${color}`}>{value}</div>
              <div className="mt-1 text-xs text-slate-500">{sub}</div>
            </div>
          ))}
        </div>

        {/* Today's tip slot */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-200">Today&apos;s Cipher Report</h3>
            <span className="text-xs text-slate-500 bg-slate-800 rounded-full px-3 py-1">Free tier: 1/day</span>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center">
            <Brain className="mx-auto h-8 w-8 text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm">Select a fixture to generate your daily Cipher report.</p>
            <a href="/fixtures" className="mt-4 inline-block rounded-xl bg-blue-500/10 border border-blue-400/20 px-5 py-2.5 text-sm font-bold text-blue-200 hover:bg-blue-500/20">
              Browse fixtures →
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
