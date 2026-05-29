#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════════════
// scripts/backtest.ts — CLI front-end for the V5 backtest harness
//
// Usage:
//   npx tsx scripts/backtest.ts                  # last 30 days, all markets
//   npx tsx scripts/backtest.ts --days=90
//   npx tsx scripts/backtest.ts --markets=over_25,btts_yes,home_win
//   npx tsx scripts/backtest.ts --since=2026-01-01 --until=2026-03-01
//   npx tsx scripts/backtest.ts --no-cache       # re-run V5 from scratch
//   npx tsx scripts/backtest.ts --threshold=0.65 # only bets with model prob ≥ 65%
//   npx tsx scripts/backtest.ts --json           # output JSON instead of table
//
// Exits non-zero when overall Brier exceeds --max-brier (default: no gate).
// Use in CI like:  npx tsx scripts/backtest.ts --max-brier=0.21
// ═══════════════════════════════════════════════════════════════════════

import { runBacktest, formatReport, type BacktestOptions } from '../src/lib/prediction-engine/v5/backtest';

interface Argv {
  days?: number;
  since?: string;
  until?: string;
  markets?: string[];
  maxFixtures?: number;
  threshold?: number;
  useCache?: boolean;
  json?: boolean;
  maxBrier?: number;
}

function parseArgs(): Argv {
  const out: Argv = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([a-z-]+)(?:=(.+))?$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case 'days': out.days = Number(value); break;
      case 'since': out.since = value; break;
      case 'until': out.until = value; break;
      case 'markets': out.markets = value.split(',').map(s => s.trim()).filter(Boolean); break;
      case 'max-fixtures': out.maxFixtures = Number(value); break;
      case 'threshold': out.threshold = Number(value); break;
      case 'no-cache': out.useCache = false; break;
      case 'json': out.json = true; break;
      case 'max-brier': out.maxBrier = Number(value); break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const argv = parseArgs();
  const opts: BacktestOptions = {
    days: argv.days,
    since: argv.since,
    until: argv.until,
    markets: argv.markets,
    maxFixtures: argv.maxFixtures,
    threshold: argv.threshold,
    useCache: argv.useCache,
  };

  if (!argv.json) {
    console.log(`Running backtest with options:`, opts);
  }

  const report = await runBacktest(opts);

  if (argv.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }

  if (argv.maxBrier != null && Number.isFinite(report.overallBrier)
      && report.overallBrier > argv.maxBrier) {
    console.error(`\n❌ Brier ${report.overallBrier.toFixed(4)} exceeds threshold ${argv.maxBrier}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
