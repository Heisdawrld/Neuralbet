// ═══════════════════════════════════════════════════════════════════════
// Markets module barrel — exports everything for the orchestrator + tests
// ═══════════════════════════════════════════════════════════════════════

export { MARKET_REGISTRY, MARKET_DEFINITIONS, isHeadlineEligibleMarket } from './registry';
export type { MarketConfig, MarketDefinition } from './registry';

export { buildMarketCandidates } from './build-candidates';
export { computeImpliedProbabilities, lookupOdds, ODDS_MAP } from './implied-odds';

export { getTacticalFit, SCRIPT_MARKET_FIT } from './tactical-fit';
export { scoreMarketCandidates, BAD_MARKET_PENALTY, computeAdvisorStatus } from './score';
export { pruneWeakCandidates, MARKET_MIN_PROB } from './prune';
export { rankMarkets, COMFORT_PENALTY, SPECIFICITY_BONUS } from './rank';
export {
  selectBestPickOrAbstain,
  computeRiskLevel,
  computeEdgeLabel,
  phantomScoreOf,
  isPricedCandidate,
  isHeadlineQualityCandidate,
} from './select';
export type { SelectionResult } from './select';
