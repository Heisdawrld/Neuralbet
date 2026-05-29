// ═══════════════════════════════════════════════════════════════════════
// V5 shared utilities — small numeric helpers used across the engine
//
// HISTORY: this file replaces src/lib/prediction-engine/utils.ts which
// was deleted in Phase 1.8 ("Delete legacy engines"). One symbol from
// that file — impliedProbability — was still imported by v5/feature-
// builder.ts, and Next.js's `ignoreBuildErrors: true` setting masked
// the broken import at build time. At runtime, every call to
// impliedProbability(...) returned `undefined`, which silently killed
// bookmaker-odds blending in calibration for every production
// prediction between Phase 1.8 deploy and Phase 2.x bug-fix.
//
// Lesson: any time a file in src/lib/prediction-engine/ is deleted,
// check that no v5 module imports from `'../<thing>'`. Adding strict
// TS build (ignoreBuildErrors: false) is the proper long-term fix and
// will land in Phase 3 ops hardening.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert decimal odds to implied probability.
 * Returns 0 when odds are unset / non-positive — caller must guard against
 * that signal vs a true 0% probability (we never emit 0 in practice
 * because odds <= 1 means "no quote available", not "outcome impossible").
 */
export function impliedProbability(odds: number | null | undefined): number {
  if (odds == null || !Number.isFinite(odds) || odds <= 1) return 0;
  return 1 / odds;
}
