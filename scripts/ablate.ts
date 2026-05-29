#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════════════
// scripts/ablate.ts — run a backtest ablation to verify an intelligence module
//
// Usage:
//   npx tsx scripts/ablate.ts --module=derby --days=90 --require-derby
//   npx tsx scripts/ablate.ts --module=derby --since=2025-12-01 --markets=over_25,btts_yes,under_25
//   npx tsx scripts/ablate.ts --module=manager_debut --days=90 --json
//
// Exits non-zero when verdict = REGRESSES.
// ═══════════════════════════════════════════════════════════════════════

import { ablateModule, formatComparison } from '../src/lib/prediction-engine/v5/backtest';
import type { IntelligenceModule } from '../src/lib/prediction-engine/v5/intelligence/flags';

interface Argv {
  module?: string;
  days?: number;
  since?: string;
  until?: string;
  markets?: string[];
  requireDerby?: boolean;
  leagueId?: number;
  maxFixtures?: number;
  json?: boolean;
}

function parseArgs(): Argv {
  const out: Argv = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([a-z-]+)(?:=(.+))?$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case 'module': out.module = value; break;
      case 'days': out.days = Number(value); break;
      case 'since': out.since = value; break;
      case 'until': out.until = value; break;
      case 'markets': out.markets = value.split(',').map(s => s.trim()).filter(Boolean); break;
      case 'require-derby': out.requireDerby = true; break;
      case 'league-id': out.leagueId = Number(value); break;
      case 'max-fixtures': out.maxFixtures = Number(value); break;
      case 'json': out.json = true; break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const argv = parseArgs();
  if (!argv.module) {
    console.error('Missing --module. Available: derby, manager_debut, rest_day, late_season, weather_style');
    process.exit(1);
  }

  const result = await ablateModule({
    module: argv.module as IntelligenceModule,
    baseOptions: {
      days: argv.days,
      since: argv.since,
      until: argv.until,
      markets: argv.markets,
      requireDerby: argv.requireDerby,
      leagueId: argv.leagueId,
      maxFixtures: argv.maxFixtures,
    },
  });

  if (argv.json) {
    // Strip the full reports from JSON to keep output small
    const { reportOn, reportOff, ...summary } = result;
    console.log(JSON.stringify({
      ...summary,
      reportOnSamples: reportOn.fixturesScored,
      reportOffSamples: reportOff.fixturesScored,
    }, null, 2));
  } else {
    console.log(formatComparison(result));
  }

  if (result.verdict === 'REGRESSES') {
    console.error(`\n❌ Module ${result.module} regresses overall Brier. CI gate fails.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Ablation failed:', err);
  process.exit(1);
});
