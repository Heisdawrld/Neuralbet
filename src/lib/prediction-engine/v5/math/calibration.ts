// ═══════════════════════════════════════════════════════════════════════
// Probability calibration — blends raw model probabilities with bookmaker
// odds and applies game-script aware adjustments. Then enforces the
// probability axioms (sum-to-1 for 1X2, complement-to-1 for over/under
// and BTTS, monotonicity over_15 ≥ over_25 ≥ over_35).
//
// CALIBRATION PHILOSOPHY
// ─────────────────────
// Raw Poisson xG estimates are noisy. The single best estimate of the
// "true" probability is a weighted blend of:
//   (a) our model       — captures structural signal (xG, form, H2H, etc.)
//   (b) bookmaker line  — captures sharp money's collective wisdom
//
// We weight HEAVIER on our model (we're trying to beat the market, not
// follow it), but ignore the market entirely only at our peril. The
// blend weights below are tuned per market — 1X2 weights the market
// more (45%) than over/under (35%) than BTTS (40%), because 1X2 lines
// are sharper than goals lines.
//
// L1 — Bookmaker blend
// L2 — Game-script micro-adjustments (open match → +overs, tight → -overs)
// L3 — Identity enforcement (complements, monotonicity, sum=1)
//
// EVERY constant in this file has a name and a comment explaining WHY.
// No magic numbers.
// ═══════════════════════════════════════════════════════════════════════

import type { ScriptOutput } from '../types';

// ─────────────────────────────────────────────────────────────────────
// CALIBRATION CONSTANTS — single source of truth
// Change one of these and the full test suite + backtest re-runs.
// ─────────────────────────────────────────────────────────────────────

/**
 * Weights for blending model probability vs bookmaker implied probability.
 * Higher MODEL_WEIGHT = more trust in our engine. Higher MARKET_WEIGHT =
 * more trust in the bookmaker line. Must sum to 1.0 per market.
 *
 * Rationale:
 *   1X2: market is the sharpest line in football. We blend more from it (0.45).
 *   O/U: lines vary more by book — we trust our model more (0.65 vs 0.35).
 *   BTTS: in between (0.60 vs 0.40).
 */
export const BLEND_WEIGHTS = {
  ONE_X_TWO: { model: 0.55, market: 0.45 },
  OVER_UNDER: { model: 0.65, market: 0.35 },
  BTTS: { model: 0.60, market: 0.40 },
} as const;

/**
 * Script-aware adjustments. Applied AFTER bookmaker blend (so script
 * intelligence isn't washed out by market noise).
 *
 * Each script tilts certain markets a small amount in the direction
 * implied by the script primary. Magnitudes are deliberately small
 * (2-4 percentage points) — the engine's main intelligence lives in
 * xG, not in these last-mile nudges.
 */
export const SCRIPT_NUDGES = {
  dominant_home_pressure: { homeWin: +0.03, awayWin: -0.02 },
  dominant_away_pressure: { awayWin: +0.03, homeWin: -0.02 },
  open_end_to_end:        { bttsYes: +0.04, over25: +0.03, over35: +0.02 },
  tight_low_event:        { bttsNo: +0.04, over25: -0.03, over15: -0.02 },
} as const;

/** Chaotic-script damping: any prob > this threshold gets multiplied by the factor. */
export const CHAOTIC_DAMPEN_THRESHOLD = 0.70;
export const CHAOTIC_DAMPEN_FACTOR = 0.97;

/** Over 1.5 dampening rules — see comments inside applyOver15Sanity(). */
export const OVER15_HARD_CAP = 0.90;
export const OVER15_LOW_OVER25_THRESHOLD = 0.40;
export const OVER15_BASE_SCALE_WHEN_OVER25_LOW = 0.84;
export const OVER15_LIFT_SCALE_WHEN_OVER25_LOW = 0.10;
export const OVER15_TIGHT_SCRIPT_THRESHOLD = 0.72;
export const OVER15_TIGHT_SCRIPT_FACTOR = 0.87;

/** Bounds applied to all final probabilities. */
export const PROB_FLOOR = 0.01;
export const PROB_CEIL = 0.99;

/** When 1X2 sum drifts outside this tolerance, we rescale to 1.0. */
export const ONE_X_TWO_REBALANCE_TOLERANCE = 0.01;

// ─────────────────────────────────────────────────────────────────────
// HELPER — clamp + 4dp round
// ─────────────────────────────────────────────────────────────────────
function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(num, max));
}

function round4(num: number): number {
  return Math.round(num * 10000) / 10000;
}

function snap(value: number, floor = PROB_FLOOR, ceil = PROB_CEIL): number {
  return round4(clamp(value, floor, ceil));
}

// ─────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────

export interface ImpliedOdds {
  impliedHomeProb?: number | null;
  impliedAwayProb?: number | null;
  impliedOver25?: number | null;
  impliedOver15?: number | null;
  impliedBttsYes?: number | null;
}

// ─────────────────────────────────────────────────────────────────────
// L1 — Bookmaker blend
// ─────────────────────────────────────────────────────────────────────
function blendBookmaker(
  cal: Record<string, number>,
  impliedOdds: ImpliedOdds | null,
): void {
  if (!impliedOdds) return;
  const { impliedHomeProb, impliedAwayProb, impliedOver25, impliedOver15, impliedBttsYes } = impliedOdds;

  // 1X2 — three-way blend. The implied draw is derived from 1 - home - away
  // (bookmaker overround is absorbed; if home+away >= 1, draw is clamped to 0.01)
  if (impliedHomeProb != null && impliedAwayProb != null && cal.homeWin != null && cal.awayWin != null) {
    const { model, market } = BLEND_WEIGHTS.ONE_X_TWO;
    const impDraw = Math.max(0.01, 1 - impliedHomeProb - impliedAwayProb);
    const oldHome = cal.homeWin;
    const oldDraw = cal.draw ?? (1 - cal.homeWin - cal.awayWin);
    const oldAway = cal.awayWin;
    cal.homeWin = round4(oldHome * model + impliedHomeProb * market);
    cal.draw    = round4(oldDraw * model + impDraw         * market);
    cal.awayWin = round4(oldAway * model + impliedAwayProb * market);
  }

  // Over/Under 2.5 — and propagate to under
  if (impliedOver25 != null && cal.over25 != null) {
    const { model, market } = BLEND_WEIGHTS.OVER_UNDER;
    cal.over25  = round4(cal.over25 * model + impliedOver25 * market);
    cal.under25 = round4(1 - cal.over25);
  }
  if (impliedOver15 != null && cal.over15 != null) {
    const { model, market } = BLEND_WEIGHTS.OVER_UNDER;
    cal.over15  = round4(cal.over15 * model + impliedOver15 * market);
    cal.under15 = round4(1 - cal.over15);
  }

  // BTTS
  if (impliedBttsYes != null && cal.bttsYes != null) {
    const { model, market } = BLEND_WEIGHTS.BTTS;
    cal.bttsYes = round4(cal.bttsYes * model + impliedBttsYes * market);
    cal.bttsNo  = round4(1 - cal.bttsYes);
  }
}

// ─────────────────────────────────────────────────────────────────────
// L2 — Script-aware micro-adjustments
// ─────────────────────────────────────────────────────────────────────
// Maps every probability key to its complement (1 - p). Used so that when
// a script nudge bumps one side, the other side is updated atomically.
const COMPLEMENT_OF: Record<string, string> = {
  over05: 'under05', under05: 'over05',
  over15: 'under15', under15: 'over15',
  over25: 'under25', under25: 'over25',
  over35: 'under35', under35: 'over35',
  bttsYes: 'bttsNo', bttsNo: 'bttsYes',
  homeOver05: 'homeUnder05', homeUnder05: 'homeOver05',
  homeOver15: 'homeUnder15', homeUnder15: 'homeOver15',
  homeOver25: 'homeUnder25', homeUnder25: 'homeOver25',
  awayOver05: 'awayUnder05', awayUnder05: 'awayOver05',
  awayOver15: 'awayUnder15', awayUnder15: 'awayOver15',
  awayOver25: 'awayUnder25', awayUnder25: 'awayOver25',
};

function applyScriptNudges(cal: Record<string, number>, primary: string): void {
  const nudges = SCRIPT_NUDGES[primary as keyof typeof SCRIPT_NUDGES];
  if (nudges) {
    for (const [key, delta] of Object.entries(nudges)) {
      if (cal[key] == null) continue;
      cal[key] = snap(cal[key] + delta);
      // If this key has a complement (e.g. bttsYes/bttsNo, over25/under25),
      // keep the complement in sync. Otherwise it gets overwritten later by
      // enforceComplements() and the nudge is lost.
      const comp = COMPLEMENT_OF[key];
      if (comp && cal[comp] != null) cal[comp] = snap(1 - cal[key]);
    }
    return;
  }

  // Chaotic match → dampen any overconfident probability
  if (primary === 'chaotic_unreliable') {
    for (const key of Object.keys(cal)) {
      if (typeof cal[key] === 'number' && cal[key] > CHAOTIC_DAMPEN_THRESHOLD) {
        cal[key] = round4(cal[key] * CHAOTIC_DAMPEN_FACTOR);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// L3 — Identity enforcement
// ─────────────────────────────────────────────────────────────────────

const COMPLEMENT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['over05', 'under05'], ['over15', 'under15'], ['over25', 'under25'], ['over35', 'under35'],
  ['bttsYes', 'bttsNo'],
  ['homeOver05', 'homeUnder05'], ['homeOver15', 'homeUnder15'], ['homeOver25', 'homeUnder25'],
  ['awayOver05', 'awayUnder05'], ['awayOver15', 'awayUnder15'], ['awayOver25', 'awayUnder25'],
];

function enforceComplements(cal: Record<string, number>): void {
  for (const [overKey, underKey] of COMPLEMENT_PAIRS) {
    if (cal[overKey] != null) cal[underKey] = round4(1 - cal[overKey]);
  }
}

/**
 * Over 1.5 sanity. Reality: when over25 is genuinely low, over15 is also
 * usually low — markets rarely price a fixture with high over15 and low over25.
 * We hard-cap over15 at 0.90, dampen further if over25 is below 0.40,
 * and dampen extra if the script is "tight low event".
 */
function applyOver15Sanity(cal: Record<string, number>, primary: string): void {
  if (cal.over15 == null) return;
  // Hard cap, but never below over25 (over15 is logically ≥ over25 — if there's
  // a 92% chance of 3+ goals, there's at least a 92% chance of 2+ goals).
  const effectiveCap = cal.over25 != null ? Math.max(OVER15_HARD_CAP, cal.over25) : OVER15_HARD_CAP;
  if (cal.over15 > effectiveCap) cal.over15 = effectiveCap;
  if (cal.over25 != null && cal.over25 < OVER15_LOW_OVER25_THRESHOLD) {
    const scaler = OVER15_BASE_SCALE_WHEN_OVER25_LOW
                 + (cal.over25 / OVER15_LOW_OVER25_THRESHOLD) * OVER15_LIFT_SCALE_WHEN_OVER25_LOW;
    cal.over15 = round4(cal.over15 * scaler);
  }
  if (primary === 'tight_low_event' && cal.over15 > OVER15_TIGHT_SCRIPT_THRESHOLD) {
    cal.over15 = round4(cal.over15 * OVER15_TIGHT_SCRIPT_FACTOR);
  }
  cal.under15 = round4(1 - cal.over15);
}

/** Enforce: over_15 ≥ over_25 ≥ over_35. If violated, lift the larger line up. */
function enforceOverMonotonicity(cal: Record<string, number>): void {
  if (cal.over25 != null && cal.over15 != null && cal.over15 < cal.over25) {
    cal.over15 = cal.over25;
    cal.under15 = round4(1 - cal.over15);
  }
  if (cal.over35 != null && cal.over25 != null && cal.over25 < cal.over35) {
    cal.over25 = cal.over35;
    cal.under25 = round4(1 - cal.over25);
  }
}

/** If 1X2 has drifted from sum=1 (after nudges), rescale proportionally. */
function rebalance1X2(cal: Record<string, number>): void {
  if (cal.homeWin == null || cal.draw == null || cal.awayWin == null) return;
  const sum = cal.homeWin + cal.draw + cal.awayWin;
  if (Math.abs(sum - 1.0) > ONE_X_TWO_REBALANCE_TOLERANCE) {
    const scale = 1.0 / sum;
    cal.homeWin = snap(cal.homeWin * scale);
    cal.draw    = snap(cal.draw    * scale);
    cal.awayWin = snap(cal.awayWin * scale);
  }
}

function finalClamp(cal: Record<string, number>): void {
  for (const key of Object.keys(cal)) {
    if (typeof cal[key] === 'number') cal[key] = round4(clamp(cal[key], 0, 1));
  }
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────

/**
 * Apply all calibration layers to a raw probability map.
 *
 * Pipeline order matters:
 *   1. Bookmaker blend — best done first, while raw probs are pristine
 *   2. Script nudges    — applied on top of blended probs
 *   3. Complements      — enforce after every nudge
 *   4. Over15 sanity    — special domain rules
 *   5. Monotonicity     — repair any ordering violations
 *   6. 1X2 rebalance    — fix any drift from sum=1
 *   7. Final clamp      — last line of defense
 *
 * @param rawProbs    — Raw market probabilities (typically from deriveMarketProbabilities)
 * @param script      — Classified match script (open/tight/dominant/chaotic)
 * @param impliedOdds — Bookmaker-implied probabilities. Pass null to skip blending.
 * @returns A new probability map with all axioms enforced.
 */
export function calibrateProbabilities(
  rawProbs: Record<string, number>,
  script: ScriptOutput,
  impliedOdds: ImpliedOdds | null,
): Record<string, number> {
  const cal: Record<string, number> = { ...rawProbs };
  const primary = script.primary || '';

  blendBookmaker(cal, impliedOdds);
  applyScriptNudges(cal, primary);
  enforceComplements(cal);
  enforceOverMonotonicity(cal);   // raise over15 if needed (cap step below may lower again)
  applyOver15Sanity(cal, primary);
  enforceOverMonotonicity(cal);   // second pass: sanity may have lowered over15 below over25 (e.g. over25 dampener); re-enforce ordering by raising over15 back up to over25
  rebalance1X2(cal);
  finalClamp(cal);

  return cal;
}
