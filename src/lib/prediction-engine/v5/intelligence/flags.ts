// ═══════════════════════════════════════════════════════════════════════
// Intelligence feature flags — per-module kill switches
//
// Every Phase 2+ intelligence module is gated by a flag in this map.
// Default state: ALL ON in production. Backtest ablation can flip
// individual flags OFF to measure that module's contribution to the
// engine's overall Brier score.
//
// Mechanism:
//   - Modules check `isIntelligenceEnabled('derby')` before applying.
//   - Tests + backtest ablation runs call `setIntelligenceFlags({derby: false})`
//     within a `withIntelligenceFlags(...)` scope, restored automatically.
//
// Process-wide state by design — V5 engine is single-threaded per request
// and the orchestrator + intelligence modules are pure functions otherwise.
// Concurrent backtest runs MUST NOT share a process (use --no-parallel
// in vitest poolOptions or run ablations sequentially).
// ═══════════════════════════════════════════════════════════════════════

export type IntelligenceModule =
  | 'derby'
  | 'manager_debut'      // Phase 2.3
  | 'rest_day'           // Phase 2.4
  | 'late_season'        // Phase 2.5
  | 'weather_style';     // Phase 2.6 — etc.

export type IntelligenceFlags = Partial<Record<IntelligenceModule, boolean>>;

const DEFAULTS: Required<Pick<IntelligenceFlags,
  'derby' | 'manager_debut' | 'rest_day' | 'late_season' | 'weather_style'>> = {
  derby: true,
  manager_debut: true,
  rest_day: true,
  late_season: true,
  weather_style: true,
};

let activeFlags: Record<IntelligenceModule, boolean> = { ...DEFAULTS } as any;

/** True iff the named module is enabled. Defaults to ON. */
export function isIntelligenceEnabled(module: IntelligenceModule): boolean {
  return activeFlags[module] !== false;
}

/** Overwrite the active flag set. Returns the previous state for restoration. */
export function setIntelligenceFlags(flags: IntelligenceFlags): IntelligenceFlags {
  const previous: IntelligenceFlags = { ...activeFlags };
  activeFlags = { ...activeFlags, ...flags };
  return previous;
}

/** Reset every flag to its default (all ON). */
export function resetIntelligenceFlags(): void {
  activeFlags = { ...DEFAULTS } as any;
}

/**
 * Run a function with a temporary flag override, restoring previous state
 * afterwards even if the function throws. The standard way to ablate a
 * single module for a single backtest call.
 *
 * @example
 *   const reportOff = await withIntelligenceFlags({ derby: false },
 *     () => runBacktest({ days: 90, requireDerby: true }));
 *   const reportOn = await runBacktest({ days: 90, requireDerby: true });
 *   const brierDelta = reportOn.overallBrier - reportOff.overallBrier;
 */
export async function withIntelligenceFlags<T>(
  flags: IntelligenceFlags,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous = setIntelligenceFlags(flags);
  try {
    return await fn();
  } finally {
    activeFlags = { ...DEFAULTS, ...previous } as any;
  }
}

/** Inspect the current active flag state (useful for tests). */
export function getActiveFlags(): Readonly<Record<IntelligenceModule, boolean>> {
  return { ...activeFlags };
}
