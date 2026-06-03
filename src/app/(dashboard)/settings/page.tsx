import { getAuth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/dashboard/topbar';
import { UpgradeCTA } from '@/components/dashboard/upgrade-cta';

export default async function SettingsPage() {
  const { userId } = await getAuth();
  if (!userId) redirect('/sign-in');

  return (
    <div>
      <Topbar title="Settings" />
      <main className="p-6 max-w-2xl">
        <div className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Plan & Billing</h3>
            <UpgradeCTA />
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Preferences</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-sm text-slate-300">Email predictions daily</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-sm text-slate-300">Notify on high-edge matches</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="rounded" />
                <span className="text-sm text-slate-300">Show odds in bookmaker odds format</span>
              </label>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
