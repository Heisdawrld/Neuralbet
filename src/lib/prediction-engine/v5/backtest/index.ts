// ═══════════════════════════════════════════════════════════════════════
// Backtest module barrel
// ═══════════════════════════════════════════════════════════════════════

export {
  brierSingle, brierScore,
  logLossSingle, logLoss,
  hitRate, roi, calibrationBuckets,
  type ScoredPrediction,
} from './scorers';

export {
  marketOutcomesFromScore,
  PROB_KEY_TO_MARKET_KEY,
  type MarketOutcome,
} from './outcomes';

export {
  runBacktest, formatReport,
  type BacktestOptions, type BacktestReport, type PerMarketScore,
} from './runner';
