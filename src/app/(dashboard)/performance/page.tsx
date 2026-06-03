import { getAuth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/dashboard/topbar';
import { AlertCircle } from 'lucide-react';

export default async function PerformancePage() {
  const { userId } = await getAuth();
  if (!userId) redirect('/sign-in');

  return (
    <div>
      <Topbar title="Performance" />
      <main className="p-6">
        <div className="glass rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-5 w-5 text-amber-400 mt-1 shrink-0" />
            <div>
              <h3 className="font-bold text-slate-200">Performance tracking coming soon.</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Once you start making predictions, Cipher will track your hit rate, ROI, closing line value (CLV), and performance by market and league.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
