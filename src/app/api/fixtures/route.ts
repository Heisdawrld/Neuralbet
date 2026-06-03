import { NextRequest, NextResponse } from 'next/server';
import { listFixtures } from '@/lib/bsd/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = searchParams.get('date_from') || today;
  const dateTo = searchParams.get('date_to') || dateFrom;
  const fixtures = await listFixtures(dateFrom, dateTo);
  return NextResponse.json({ count: fixtures.length, fixtures });
}
