import { NextRequest, NextResponse } from 'next/server';
import { settlePendingPredictions } from '@/lib/performance/records';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('x-sync-secret') === secret || req.nextUrl.searchParams.get('secret') === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await settlePendingPredictions();
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await settlePendingPredictions();
  return NextResponse.json({ ok: true, result });
}
