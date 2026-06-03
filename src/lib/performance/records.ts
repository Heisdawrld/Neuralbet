import { db } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import type { CipherPrediction } from '@/lib/cipher/types';
import { profitUnits, settlePick } from './settlement';

export async function savePredictionRecord(params: {
  userId: string;
  prediction: CipherPrediction;
  fixture: { leagueId: number; kickoffAt: string };
}) {
  await ensureSchema();
  const { userId, prediction, fixture } = params;
  const stakeUnits = prediction.stakeFraction > 0 ? Number((prediction.stakeFraction * 100).toFixed(2)) : 1;

  await db().execute({
    sql: `INSERT INTO prediction_records (
      clerk_user_id, fixture_id, league_id, market, selection, probability, fair_odds, bookmaker_odds,
      edge, confidence, risk, stake_fraction, stake_units, analyst_report, features_json, picks_json,
      status, kickoff_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`,
    args: [
      userId,
      prediction.fixtureId,
      fixture.leagueId,
      prediction.market,
      prediction.selection,
      prediction.probability,
      prediction.fairOdds,
      prediction.bookmakerOdds,
      prediction.edge,
      prediction.confidence,
      prediction.risk,
      prediction.stakeFraction,
      stakeUnits,
      prediction.report,
      JSON.stringify(prediction.features),
      JSON.stringify(prediction.picks),
      fixture.kickoffAt,
    ],
  });
}

export async function settlePendingPredictions() {
  await ensureSchema();
  const cx = db();
  const result = await cx.execute(`
    SELECT pr.id, pr.market, pr.selection, pr.bookmaker_odds, pr.stake_units,
           f.home_team, f.away_team, f.home_score, f.away_score, f.status AS fixture_status
    FROM prediction_records pr
    JOIN fixtures f ON f.id = pr.fixture_id
    WHERE pr.status = 'pending'
      AND f.home_score IS NOT NULL
      AND f.away_score IS NOT NULL
      AND f.status IN ('finished', 'FT', 'finished_after_extra_time', 'finished_after_penalties')
    LIMIT 500
  `);

  let settled = 0;
  for (const row of result.rows) {
    const settlement = settlePick(String(row.market), String(row.selection), {
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
      homeScore: Number(row.home_score),
      awayScore: Number(row.away_score),
    });
    if (settlement.status === 'pending') continue;

    const profit = profitUnits(settlement.status, Number(row.stake_units ?? 1), row.bookmaker_odds == null ? null : Number(row.bookmaker_odds));
    await cx.execute({
      sql: `UPDATE prediction_records
            SET status=?, profit_units=?, result_json=?, settled_at=datetime('now')
            WHERE id=?`,
      args: [settlement.status, Number(profit.toFixed(4)), JSON.stringify(settlement), Number(row.id)],
    });
    settled++;
  }

  return { scanned: result.rows.length, settled };
}

export async function getPerformance(userId: string) {
  await ensureSchema();
  const cx = db();
  const rows = await cx.execute({
    sql: `SELECT market, status, stake_units, profit_units, edge, confidence, created_at
          FROM prediction_records
          WHERE clerk_user_id = ?
          ORDER BY created_at DESC`,
    args: [userId],
  });

  const all = rows.rows.map((r) => ({
    market: String(r.market),
    status: String(r.status),
    stake: Number(r.stake_units ?? 0),
    profit: Number(r.profit_units ?? 0),
    edge: r.edge == null ? null : Number(r.edge),
    confidence: String(r.confidence),
  }));
  const settled = all.filter((r) => ['won', 'lost', 'void'].includes(r.status));
  const graded = settled.filter((r) => r.status !== 'void');
  const wins = graded.filter((r) => r.status === 'won').length;
  const stake = graded.reduce((s, r) => s + r.stake, 0);
  const profit = graded.reduce((s, r) => s + r.profit, 0);

  const byMarket = Object.values(all.reduce<Record<string, { market: string; total: number; settled: number; wins: number; stake: number; profit: number }>>((acc, r) => {
    acc[r.market] ??= { market: r.market, total: 0, settled: 0, wins: 0, stake: 0, profit: 0 };
    acc[r.market].total++;
    if (['won', 'lost'].includes(r.status)) {
      acc[r.market].settled++;
      acc[r.market].stake += r.stake;
      acc[r.market].profit += r.profit;
      if (r.status === 'won') acc[r.market].wins++;
    }
    return acc;
  }, {})).map((m) => ({
    ...m,
    hitRate: m.settled ? m.wins / m.settled : null,
    roi: m.stake ? m.profit / m.stake : null,
    profit: Number(m.profit.toFixed(2)),
    stake: Number(m.stake.toFixed(2)),
  }));

  return {
    total: all.length,
    pending: all.filter((r) => r.status === 'pending').length,
    settled: settled.length,
    wins,
    losses: graded.length - wins,
    hitRate: graded.length ? wins / graded.length : null,
    stake: Number(stake.toFixed(2)),
    profit: Number(profit.toFixed(2)),
    roi: stake ? profit / stake : null,
    byMarket,
  };
}
