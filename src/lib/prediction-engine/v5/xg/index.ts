// ═══════════════════════════════════════════════════════════════════════
// xG Pipeline orchestrator — the brain of the V5 engine
//
// Pipeline stages (in order). Each stage is a pure function in
// ./layers/NN-<name>.ts with its own constants and unit tests.
//
//   1. computeBaseXg               — team strength × league avg × home adv
//   2. applyThinDataRegression     — regress toward league mean if data sparse
//   3. applyVenueAnchoring         — blend in home-at-home / away-on-road splits
//   4. applyScriptAdjustments      — open/tight/dominant/chaotic tilt
//                                    [base xG snapshot taken HERE]
//   5. applyFormBoosts             — recent-form attack/defence boosts
//   6. applyOddsAnchor             — blend with bookmaker over_2.5 line
//   7. applyH2HBlend               — historical H2H goal pattern
//   8. applyLeagueGoalRateAdjustment — league character tilt
//   9. applyAdvancedTacticalAI     — Polymarket + manager styles + matchup
//  10. applyBsdIntelligenceAdjustments — xG table + manager bias + player stats
//  11. applyDeepBsdSignals         — core player gap + referee chaos + metadata
//  12. applyBsdContextAdjustments  — derby + travel + weather + ref strictness
//  13. applySquadManagementAdjustments — rotation + fatigue + rest + cup distraction
//  14. capXg                       — league-aware floors + ceilings (final brake)
//
// THE INVARIANT: this orchestrator MUST produce bit-for-bit identical
// output to the original v5/index.ts monolithic estimateExpectedGoals.
// The integration test in __tests__/integration.test.ts pins this.
// ═══════════════════════════════════════════════════════════════════════

import type { ScriptOutput } from '../types';

import { computeBaseXg } from './layers/01-base';
import { applyThinDataRegression } from './layers/02-thin-data-regression';
import { applyVenueAnchoring } from './layers/03-venue-anchoring';
import { applyScriptAdjustments } from './layers/04-script-adjustments';
import { applyFormBoosts } from './layers/05-form-boosts';
import { applyOddsAnchor } from './layers/06-odds-anchor';
import { applyH2HBlend } from './layers/07-h2h-blend';
import { applyLeagueGoalRateAdjustment } from './layers/08-league-goal-rate';
import { applyAdvancedTacticalAI } from './layers/09-tactical-ai';
import { applyBsdIntelligenceAdjustments } from './layers/10-bsd-intelligence';
import { applyDeepBsdSignals } from './layers/11-deep-bsd-signals';
import { applyBsdContextAdjustments } from './layers/12-context-adjustments';
import { applySquadManagementAdjustments } from './layers/13-squad-management';
import { capXg, type CappedXg } from './layers/14-cap';

export type { CappedXg };

export function estimateExpectedGoals(fv: any, script: ScriptOutput): CappedXg {
  let { homeXg, awayXg } = computeBaseXg(fv);
  ({ homeXg, awayXg } = applyThinDataRegression(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyVenueAnchoring(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyScriptAdjustments(homeXg, awayXg, script, fv));

  // Snapshot "base" — the L1-L4 pre-form-boost estimate, used by capXg
  // and downstream shift-detection elsewhere in the engine.
  const baseHomeXg = homeXg;
  const baseAwayXg = awayXg;

  ({ homeXg, awayXg } = applyFormBoosts(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyOddsAnchor(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyH2HBlend(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyLeagueGoalRateAdjustment(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyAdvancedTacticalAI(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyBsdIntelligenceAdjustments(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyDeepBsdSignals(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyBsdContextAdjustments(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applySquadManagementAdjustments(homeXg, awayXg, fv));

  return capXg(homeXg, awayXg, baseHomeXg, baseAwayXg, fv);
}

// Re-export every layer so backtest / ablation code can compose them
export { computeBaseXg } from './layers/01-base';
export { applyThinDataRegression } from './layers/02-thin-data-regression';
export { applyVenueAnchoring } from './layers/03-venue-anchoring';
export { applyScriptAdjustments } from './layers/04-script-adjustments';
export { applyFormBoosts, computeFormDerivedBoosts } from './layers/05-form-boosts';
export { applyOddsAnchor, impliedTotalXg } from './layers/06-odds-anchor';
export { applyH2HBlend } from './layers/07-h2h-blend';
export { applyLeagueGoalRateAdjustment } from './layers/08-league-goal-rate';
export { applyAdvancedTacticalAI } from './layers/09-tactical-ai';
export { applyBsdIntelligenceAdjustments } from './layers/10-bsd-intelligence';
export { applyDeepBsdSignals } from './layers/11-deep-bsd-signals';
export { applyBsdContextAdjustments } from './layers/12-context-adjustments';
export { applySquadManagementAdjustments } from './layers/13-squad-management';
export { capXg, getLeagueCapTier } from './layers/14-cap';
