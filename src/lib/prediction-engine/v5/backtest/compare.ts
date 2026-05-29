// ═══════════════════════════════════════════════════════════════════════
// Backtest ablation — run TWO backtests and diff them
//
// The standard way to verify a Phase 2+ intelligence module: run the
// engine with the module ON, then with the module OFF, on the same
// fixture window. Compare overall Brier + per-market Brier.
//
// USAGE
//   import { ablateModule } from './compare';
//   const result = await ablateModule({
//     module: 'derby',
//     baseOptions: { days: 90, requireDerby: true, useCache: false },
//   });
//   console.log(formatComparison(result));
//
// Returns rich diff: overall Brier delta, per-market Brier deltas,
// fixturesScored counts (should match between the two), winner label.
// ═══════════════════════════════════════════════════════════════════════

import { runBacktest, type BacktestOptions, type BacktestReport } from './runner';
import { withIntelligenceFlags, type IntelligenceModule } from '../intelligence/flags';

export interface AblationOptions {
  /** Which intelligence module to toggle. */
  module: IntelligenceModule;
  /** Backtest options shared between the two runs. */
  baseOptions: Omit<BacktestOptions, 'label'>;
}

export interface MarketDelta {
  market: string;
  samplesOn: number;
  samplesOff: number;
  brierOn: number;
  brierOff: number;
  brierDelta: number;          // negative = module IMPROVED Brier
  hitRateOn: number;
  hitRateOff: number;
  roiOn: number | null;
  roiOff: number | null;
}

export interface AblationResult {
  module: IntelligenceModule;
  fixturesScored: number;       // should match between on/off
  overall: {
    brierOn: number;
    brierOff: number;
    brierDelta: number;          // negative = module improves
    logLossOn: number;
    logLossOff: number;
    logLossDelta: number;
  };
  perMarket: MarketDelta[];
  verdict: 'IMPROVES' | 'REGRESSES' | 'NEUTRAL';
  /** Magnitude of the verdict for the lead overall metric. */
  verdictMagnitude: number;
  reportOn: BacktestReport;
  reportOff: BacktestReport;
  runMs: number;
}

/** "Material" delta threshold for IMPROVES / REGRESSES classification.
 *  Below this, verdict = NEUTRAL (not enough signal to trust the change). */
export const VERDICT_NEUTRAL_THRESHOLD = 0.001; // 0.1 Brier points

/**
 * Run the backtest with the named module ON, then with it OFF, on the
 * same fixture window. Always disables the cache (otherwise the OFF run
 * would just serve cached ON predictions).
 */
export async function ablateModule(opts: AblationOptions): Promise<AblationResult> {
  const startedAt = Date.now();

  // ON run (default state — all intelligence modules ON)
  const reportOn = await runBacktest({
    ...opts.baseOptions,
    useCache: false, // must regenerate to see the diff
    label: `${opts.module}_on`,
  });

  // OFF run — flip the named module's flag
  const reportOff = await withIntelligenceFlags(
    { [opts.module]: false },
    () => runBacktest({
      ...opts.baseOptions,
      useCache: false,
      label: `${opts.module}_off`,
    }),
  );

  // Diff overall metrics
  const brierDelta = reportOn.overallBrier - reportOff.overallBrier;
  const logLossDelta = reportOn.overallLogLoss - reportOff.overallLogLoss;

  // Diff per-market — join by market name
  const offByMarket = new Map(reportOff.perMarket.map((m) => [m.market, m]));
  const perMarket: MarketDelta[] = reportOn.perMarket
    .filter((onM) => offByMarket.has(onM.market))
    .map((onM) => {
      const offM = offByMarket.get(onM.market)!;
      return {
        market: onM.market,
        samplesOn: onM.samples,
        samplesOff: offM.samples,
        brierOn: onM.brier,
        brierOff: offM.brier,
        brierDelta: onM.brier - offM.brier,
        hitRateOn: onM.hitRate,
        hitRateOff: offM.hitRate,
        roiOn: onM.roi,
        roiOff: offM.roi,
      };
    })
    .sort((a, b) => a.brierDelta - b.brierDelta);

  let verdict: AblationResult['verdict'];
  if (brierDelta < -VERDICT_NEUTRAL_THRESHOLD) verdict = 'IMPROVES';
  else if (brierDelta > VERDICT_NEUTRAL_THRESHOLD) verdict = 'REGRESSES';
  else verdict = 'NEUTRAL';

  return {
    module: opts.module,
    fixturesScored: Math.min(reportOn.fixturesScored, reportOff.fixturesScored),
    overall: {
      brierOn: reportOn.overallBrier,
      brierOff: reportOff.overallBrier,
      brierDelta,
      logLossOn: reportOn.overallLogLoss,
      logLossOff: reportOff.overallLogLoss,
      logLossDelta,
    },
    perMarket,
    verdict,
    verdictMagnitude: Math.abs(brierDelta),
    reportOn,
    reportOff,
    runMs: Date.now() - startedAt,
  };
}

/** Pretty-printed comparison report. */
export function formatComparison(result: AblationResult): string {
  const lines: string[] = [];
  const verdictEmoji = result.verdict === 'IMPROVES' ? '✅'
                     : result.verdict === 'REGRESSES' ? '❌'
                     : '➖';
  const sign = result.overall.brierDelta < 0 ? '' : '+';
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push(`  Ablation: ${result.module}`);
  lines.push(`  Fixtures scored: ${result.fixturesScored}`);
  lines.push(`  ${verdictEmoji} Verdict: ${result.verdict}`);
  lines.push(`     Overall Brier:    ${result.overall.brierOff.toFixed(4)} → ${result.overall.brierOn.toFixed(4)}   (Δ ${sign}${result.overall.brierDelta.toFixed(4)})`);
  lines.push(`     Overall LogLoss:  ${result.overall.logLossOff.toFixed(4)} → ${result.overall.logLossOn.toFixed(4)}   (Δ ${result.overall.logLossDelta >= 0 ? '+' : ''}${result.overall.logLossDelta.toFixed(4)})`);
  lines.push(`  Run time: ${(result.runMs / 1000).toFixed(1)}s`);
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('  Market                       N      Brier OFF → ON    Δ');
  lines.push('  ─────────────────────────  ─────  ─────────────────  ─────────');
  for (const m of result.perMarket) {
    const market = m.market.padEnd(25);
    const n = String(m.samplesOn).padStart(5);
    const off = m.brierOff.toFixed(4).padStart(8);
    const on = m.brierOn.toFixed(4).padStart(8);
    const dSign = m.brierDelta < 0 ? '' : '+';
    const delta = `${dSign}${m.brierDelta.toFixed(4)}`.padStart(9);
    const dIcon = m.brierDelta < -VERDICT_NEUTRAL_THRESHOLD ? ' ✅'
                : m.brierDelta > VERDICT_NEUTRAL_THRESHOLD ? ' ❌'
                : '   ';
    lines.push(`  ${market}  ${n}  ${off} → ${on}  ${delta}${dIcon}`);
  }
  lines.push('═══════════════════════════════════════════════════════════════════════');
  if (result.verdict === 'IMPROVES') {
    lines.push(`  KEEP THE MODULE. Brier improved by ${result.overall.brierDelta.toFixed(4)}.`);
  } else if (result.verdict === 'REGRESSES') {
    lines.push(`  REVERT THE MODULE. Brier regressed by +${result.overall.brierDelta.toFixed(4)}.`);
  } else {
    lines.push(`  NEUTRAL — module impact below noise threshold (${VERDICT_NEUTRAL_THRESHOLD}). Investigate or expand sample size.`);
  }
  return lines.join('\n');
}
