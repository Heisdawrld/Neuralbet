'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import Link from 'next/link';
import { Brain, Calendar } from 'lucide-react';

type Fixture = {
  id: number;
  league_name?: string;
  home_team: string;
  away_team: string;
  event_date: string;
  status: string;
};

function useFixtures(date: string) {
  return useQuery({
    queryKey: ['fixtures', date],
    queryFn: async (): Promise<{ count: number; fixtures: Fixture[] }> => {
      const res = await fetch(`/api/fixtures?date_from=${date}&date_to=${date}`);
      if (!res.ok) throw new Error('Failed to fetch fixtures');
      return res.json();
    },
  });
}

export function FixturesList() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading, error } = useFixtures(today);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass h-20 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-slate-400">
        <p className="font-medium">Could not load fixtures.</p>
        <p className="mt-1 text-sm text-slate-500">Check your BSD API key in Vercel environment variables.</p>
      </div>
    );
  }

  const fixtures = data?.fixtures ?? [];

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-sm text-slate-400">
        <Calendar className="h-4 w-4" />
        <span>{format(new Date(), 'EEEE, d MMMM yyyy')}</span>
        <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs">{fixtures.length} matches</span>
      </div>
      {fixtures.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400">No fixtures found for today.</div>
      ) : (
        <div className="space-y-3">
          {fixtures.map((f) => (
            <div key={f.id} className="glass flex items-center justify-between rounded-2xl px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xs text-slate-500">{f.league_name || 'League'}</div>
                  <div className="mt-1 text-sm text-slate-400">{f.event_date?.slice(11, 16) || '—'}</div>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <div className="font-bold text-slate-100">{f.home_team} <span className="text-slate-500 font-normal">vs</span> {f.away_team}</div>
                  <div className="mt-0.5 text-xs text-slate-500 capitalize">{f.status}</div>
                </div>
              </div>
              <Link
                href={`/predict?fixtureId=${f.id}`}
                className="flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-400/20 px-4 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-500/20"
              >
                <Brain className="h-3.5 w-3.5" />
                Predict
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
