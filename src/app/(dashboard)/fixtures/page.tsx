import { getAuth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/dashboard/topbar';
import { FixturesList } from '@/components/dashboard/fixtures-list';

export default async function FixturesPage() {
  const { userId } = await getAuth();
  if (!userId) redirect('/sign-in');
  return (
    <div>
      <Topbar title="Fixtures" />
      <main className="p-6">
        <FixturesList />
      </main>
    </div>
  );
}
