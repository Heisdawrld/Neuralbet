// ═══════════════════════════════════════════════════════════════════════
// Layer 7: Head-to-head goals blend
//
// Some fixtures have characteristic goal patterns over time —
// Roma vs Lazio is historically tight; Bayern vs Dortmund is historically
// open. If we have ≥3 recent H2H meetings, we blend their average
// goal total into our xG estimate.
//
// Weight scales with sample size:
//   3-4 meetings →  15%
//   5-6 meetings →  22%
//   ≥7 meetings →   28%
//
// CRITICAL: the blend preserves the home/away share ratio our pipeline
// has computed up to this point — we only adjust the TOTAL. This keeps
// the team-strength signal intact while letting H2H goal patterns
// reshape the expected match temperature.
// ═══════════════════════════════════════════════════════════════════════

import { safeNum, type XgPair } from '../shared';

export const H2H_MIN_SAMPLE = 3;
export const H2H_WEIGHT_SMALL_SAMPLE = 0.15;  // 3-4 meetings
export const H2H_WEIGHT_MEDIUM_SAMPLE = 0.22; // 5-6 meetings
export const H2H_WEIGHT_LARGE_SAMPLE = 0.28;  // 7+ meetings
export const H2H_SAMPLE_MEDIUM_THRESHOLD = 5;
export const H2H_SAMPLE_LARGE_THRESHOLD = 7;
export const H2H_FALLBACK_HOME_SHARE = 0.55;

export function applyH2HBlend(homeXg: number, awayXg: number, fv: any): XgPair {
  const h2hAvg = safeNum(fv.h2hAvgGoals, 0);
  const h2hCount = safeNum(fv.h2hMatchesAvailable, 0);
  if (h2hAvg <= 0 || h2hCount < H2H_MIN_SAMPLE) return { homeXg, awayXg };

  const weight =
    h2hCount >= H2H_SAMPLE_LARGE_THRESHOLD ? H2H_WEIGHT_LARGE_SAMPLE :
    h2hCount >= H2H_SAMPLE_MEDIUM_THRESHOLD ? H2H_WEIGHT_MEDIUM_SAMPLE :
    H2H_WEIGHT_SMALL_SAMPLE;

  const currentTotal = homeXg + awayXg;
  const blendedTotal = currentTotal * (1 - weight) + h2hAvg * weight;
  const homeShare = currentTotal > 0 ? homeXg / currentTotal : H2H_FALLBACK_HOME_SHARE;
  return {
    homeXg: blendedTotal * homeShare,
    awayXg: blendedTotal * (1 - homeShare),
  };
}
