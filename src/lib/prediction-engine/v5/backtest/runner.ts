// ═══════════════════════════════════════════════════════════════════════
// Backtest runner — replays V5 against finished historical matches
//
// USAGE (CLI):
//   npx tsx scripts/backtest.ts                  # last 30 days, all markets
//   npx tsx scripts/backtest.ts --days=90        # last 90 days
//   npx tsx scripts/backtest.ts --markets=over_25,btts_yes
//   npx tsx scripts/backtest.ts --since=2026-01-01
//
// USAGE (programmatic):
//   import { runBacktest } from './runner';
//   const report = await runBacktest({ days: 30 });
//
// Output: BacktestReport with per-market Brier / log-loss / hit rate / ROI.
//
// The runner does NOT mutate any production data — purely read-only on
// the events table + cached predictions_v2.
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient } from '@/lib/db/turso-client';
import { runV5Prediction } from '../index';
import {
  marketOutcomesFromScore,
  PROB_KEY_TO_MARKET_KEY,
  type MarketOutcome,
} from './outcomes';
import {
  brierScore, logLoss, hitRate, roi, calibrationBuckets,
  type ScoredPrediction,
} from './scorers';
import { safeNum } from '../xg/shared';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface BacktestOptions {
  /** Look back N days from today. Mutually exclusive with `since`. */
  days?: number;
  /** Start date (inclusive) ISO YYYY-MM-DD. Mutually exclusive with `days`. */
  since?: string;
  /** End date (inclusive) ISO YYYY-MM-DD. Defaults to today. */
  until?: string;
  /** Restrict to a subset of marketKeys. */
  markets?: string[];
  /** Cap on fixtures to score (safety net). Default 1000. */
  maxFixtures?: number;
  /** Threshold for hit rate + ROI computation. Default 0.50. */
  threshold?: number;
  /** Use cached predictions_v2 when available (default true). False = always re-run V5. */
  useCache?: boolean;
  /** Only score fixtures where is_local_derby = 1. */
  requireDerby?: boolean;
  /** Only score fixtures from this league. */
  leagueId?: number;
  /**
   * Free-text label included in the report (helps when comparing two runs:
   * 'derby_on' vs 'derby_off', etc.).
   */
  label?: string;
}

export interface PerMarketScore {
  market: string;
  samples: number;
  brier: number;
  logLoss: number;
  hitRate: number;
  hitRateBeliefs: number;
  hitRateHits: number;
  roi: number | null;
  roiBets: number;
  roiProfit: number;
  roiStaked: number;
}

export interface BacktestReport {
  options: Required<Pick<BacktestOptions, 'threshold' | 'useCache'>> & {
    from: string; to: string; markets: string[] | 'all'; maxFixtures: number;
    requireDerby?: boolean;
    leagueId?: number;
    label?: string;
  };
  fixturesScored: number;
  fixturesSkipped: number;
  overallBrier: number;
  overallLogLoss: number;
  perMarket: PerMarketScore[];
  /** Reliability-diagram buckets across all markets pooled. */
  calibration: ReturnType<typeof calibrationBuckets>;
  runMs: number;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function parseJSON<T>(val: unknown, fallback: T): T {
  if (!val) return fallback;
  if (typeof val === 'object') return val as T;
  try { return JSON.parse(String(val)) as T; } catch { return fallback; }
}

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface CachedPrediction {
  calibratedProbs: Record<string, number>;
  bestPickMarketKey: string | null;
  bestPickProb: number | null;
  bestPickOdds: number | null;
}

async function loadCachedPrediction(fixtureId: number): Promise<CachedPrediction | null> {
  const db = getTursoClient();
  const r = await db.execute({
    sql: `SELECT calibrated_probs_json, best_pick_json
          FROM predictions_v2
          WHERE event_id = ? AND engine_version LIKE '5%'
          ORDER BY updated_at DESC LIMIT 1`,
    args: [fixtureId],
  });
  if (!r.rows.length) return null;
  const row = r.rows[0];
  const calibratedProbs = parseJSON<Record<string, number>>(row.calibrated_probs_json, {});
  const bestPick = parseJSON<any>(row.best_pick_json, null);
  return {
    calibratedProbs,
    bestPickMarketKey: bestPick?.marketKey ?? null,
    bestPickProb: bestPick?.modelProbability != null ? Number(bestPick.modelProbability) : null,
    bestPickOdds: bestPick?.bookmakerOdds != null ? Number(bestPick.bookmakerOdds) : null,
  };
}

async function getOrComputePrediction(
  fixtureId: number, useCache: boolean,
): Promise<CachedPrediction | null> {
  if (useCache) {
    const cached = await loadCachedPrediction(fixtureId);
    if (cached) return cached;
  }
  // Cache miss (or useCache=false) — re-run V5
  try {
    const v5 = await runV5Prediction(fixtureId);
    return {
      calibratedProbs: v5.calibratedProbs || {},
      bestPickMarketKey: v5.bestPick?.marketKey ?? null,
      bestPickProb: v5.bestPick?.modelProbability ?? null,
      bestPickOdds: v5.bestPick?.bookmakerOdds ?? null,
    };
  } catch (err) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

export async function runBacktest(opts: BacktestOptions = {}): Promise<BacktestReport> {
  const startedAt = Date.now();
  const threshold = opts.threshold ?? 0.50;
  const useCache = opts.useCache !== false; // default true
  const maxFixtures = opts.maxFixtures ?? 1000;
  const until = opts.until ?? dayString(new Date());
  let since: string;
  if (opts.since) {
    since = opts.since;
  } else {
    const d = new Date();
    d.setDate(d.getDate() - (opts.days ?? 30));
    since = dayString(d);
  }
  const marketFilter = opts.markets && opts.markets.length > 0 ? new Set(opts.markets) : null;

  const db = getTursoClient();

  // Build WHERE clauses dynamically based on optional filters.
  const whereClauses = [
    `status = 'finished'`,
    `home_score IS NOT NULL`, `away_score IS NOT NULL`,
    `event_date >= ?`, `event_date <= ?`,
  ];
  const args: any[] = [`${since}T00:00:00Z`, `${until}T23:59:59Z`];
  if (opts.requireDerby) whereClauses.push(`is_local_derby = 1`);
  if (opts.leagueId) { whereClauses.push(`league_id = ?`); args.push(opts.leagueId); }

  const fixtures = await db.execute({
    sql: `SELECT id, home_score, away_score, event_date
          FROM events
          WHERE ${whereClauses.join(' AND ')}
          ORDER BY event_date DESC
          LIMIT ?`,
    args: [...args, maxFixtures],
  });

  // Bucket samples per market
  const perMarketSamples: Record<string, ScoredPrediction[]> = {};
  const pooledSamples: ScoredPrediction[] = [];

  let fixturesScored = 0;
  let fixturesSkipped = 0;

  for (const row of fixtures.rows) {
    const fixtureId = Number(row.id);
    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
      fixturesSkipped++;
      continue;
    }

    const pred = await getOrComputePrediction(fixtureId, useCache);
    if (!pred || Object.keys(pred.calibratedProbs).length === 0) {
      fixturesSkipped++;
      continue;
    }

    const outcomes = marketOutcomesFromScore(homeScore, awayScore);

    // Score every market where we have BOTH a predicted probability AND an outcome
    for (const [probKey, prob] of Object.entries(pred.calibratedProbs)) {
      const marketKey = PROB_KEY_TO_MARKET_KEY[probKey];
      if (!marketKey) continue;
      if (marketFilter && !marketFilter.has(marketKey)) continue;
      const outcome = outcomes[marketKey];
      if (outcome === undefined) continue;
      const sample: ScoredPrediction = {
        predictedProb: safeNum(prob, 0),
        actualOutcome: outcome,
        decimalOdds:
          pred.bestPickMarketKey === marketKey ? pred.bestPickOdds ?? null : null,
      };
      (perMarketSamples[marketKey] ||= []).push(sample);
      pooledSamples.push(sample);
    }

    fixturesScored++;
  }

  // Compute per-market scores
  const perMarket: PerMarketScore[] = Object.entries(perMarketSamples)
    .map(([market, samples]) => {
      const hr = hitRate(samples, threshold);
      const r = roi(samples, threshold);
      return {
        market,
        samples: samples.length,
        brier: brierScore(samples),
        logLoss: logLoss(samples),
        hitRate: hr.rate,
        hitRateBeliefs: hr.beliefs,
        hitRateHits: hr.hits,
        roi: r.bets === 0 ? null : r.roi,
        roiBets: r.bets,
        roiProfit: r.profit,
        roiStaked: r.staked,
      };
    })
    .sort((a, b) => a.brier - b.brier);

  return {
    options: {
      from: since, to: until,
      markets: opts.markets ?? 'all',
      maxFixtures, threshold, useCache,
      requireDerby: opts.requireDerby,
      leagueId: opts.leagueId,
      label: opts.label,
    },
    fixturesScored, fixturesSkipped,
    overallBrier: brierScore(pooledSamples),
    overallLogLoss: logLoss(pooledSamples),
    perMarket,
    calibration: calibrationBuckets(pooledSamples, 10),
    runMs: Date.now() - startedAt,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Pretty-print a backtest report as a human-readable table.
 */
export function formatReport(report: BacktestReport): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push(`  NeuralBet V5 — Backtest Report`);
  lines.push(`  Window: ${report.options.from} → ${report.options.to}`);
  lines.push(`  Fixtures scored: ${report.fixturesScored} (skipped: ${report.fixturesSkipped})`);
  lines.push(`  Overall Brier:  ${report.overallBrier.toFixed(4)}   (lower = better; 0.25 = coin flip)`);
  lines.push(`  Overall LogLoss: ${report.overallLogLoss.toFixed(4)}   (lower = better; 0.693 = coin flip)`);
  lines.push(`  Run time: ${(report.runMs / 1000).toFixed(2)}s`);
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('  Market                       N      Brier    LogLoss   Hit%    ROI');
  lines.push('  ─────────────────────────  ─────  ────────  ────────  ──────  ────────');
  for (const m of report.perMarket) {
    const market = m.market.padEnd(25);
    const n = String(m.samples).padStart(5);
    const brier = m.brier.toFixed(4).padStart(8);
    const ll = m.logLoss.toFixed(4).padStart(8);
    const hr = Number.isFinite(m.hitRate)
      ? `${(m.hitRate * 100).toFixed(1)}%`.padStart(6) : '   n/a';
    const r = m.roi != null
      ? `${(m.roi * 100 >= 0 ? '+' : '')}${(m.roi * 100).toFixed(2)}%`.padStart(8) : '     n/a';
    lines.push(`  ${market}  ${n}  ${brier}  ${ll}  ${hr}  ${r}`);
  }
  lines.push('');
  lines.push('  Calibration (pooled, 10 buckets):');
  lines.push('  Bucket       N     Predicted Avg   Actual Rate   Δ');
  lines.push('  ─────────  ─────  ──────────────  ────────────  ────────');
  for (const b of report.calibration) {
    if (b.count === 0) continue;
    const bucket = `[${b.binStart.toFixed(1)},${b.binEnd.toFixed(1)})`.padEnd(9);
    const n = String(b.count).padStart(5);
    const pred = b.predictedAvgProb.toFixed(3).padStart(14);
    const act = Number.isFinite(b.actualRate) ? b.actualRate.toFixed(3).padStart(12) : '     n/a   ';
    const delta = (b.predictedAvgProb - b.actualRate).toFixed(3).padStart(8);
    lines.push(`  ${bucket}  ${n}  ${pred}  ${act}  ${delta}`);
  }
  lines.push('═══════════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}
