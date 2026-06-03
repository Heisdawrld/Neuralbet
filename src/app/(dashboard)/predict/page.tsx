import { getAuth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Topbar } from '@/components/dashboard/topbar';
import { PredictCard } from '@/components/dashboard/predict-card';

export default async function PredictPage({
  searchParams,
}: {
  searchParams: Promise<{ fixtureId?: string }>;
}) {
  const { userId } = await getAuth();
  if (!userId) redirect('/sign-in');

  const params = await searchParams;
  const fixtureId = params.fixtureId;

  return (
    <div>
      <Topbar title="Predict" />
      <main className="p-6">
        {!fixtureId ? (
          <div className="glass rounded-2xl p-8 text-center text-slate-400">
            <p className="font-medium">Select a fixture to see Cipher&apos;s prediction.</p>
            <p className="mt-1 text-sm text-slate-500">Go to Fixtures tab to choose a match.</p>
          </div>
        ) : (
          <Suspense fallback={<div className="glass h-96 animate-pulse rounded-2xl" />}>
            <PredictCard fixtureId={Number(fixtureId)} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
