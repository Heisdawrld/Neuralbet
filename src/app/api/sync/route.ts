import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/sync/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('x-sync-secret') === secret || req.nextUrl.searchParams.get('secret') === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await runSync({
    pastDays: Number(body.pastDays ?? 30),
    futureDays: Number(body.futureDays ?? 14),
    oddsLimit: Number(body.oddsLimit ?? 100),
  });
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runSync({
    pastDays: Number(req.nextUrl.searchParams.get('pastDays') ?? 30),
    futureDays: Number(req.nextUrl.searchParams.get('futureDays') ?? 14),
    oddsLimit: Number(req.nextUrl.searchParams.get('oddsLimit') ?? 100),
  });
  return NextResponse.json({ ok: true, result });
}
