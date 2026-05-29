# NeuralBet — Project State

> Single source of truth across sessions. Updated end of every working session.

## Current Snapshot — 2026-05-29 (Phase 1.5 LIVE — engine refactor complete)

**Status**: V5 engine is now FULLY MODULAR + FULLY TESTED. 7 commits live on `main` since Phase 0. Every production smoke test on fixture 9344 returns bit-for-bit identical output. Zero behaviour regression across 4 major extractions.
**Live URL**: https://neuralbet-lovat.vercel.app
**Tests**: **223 passing in 2.27s.** (Was 0 before Phase 1.)
**Engine canon**: `src/lib/prediction-engine/v5/`

## Live commits on `main`

| SHA | Title |
|---|---|
| `b5eecce` | **Phase 1.5**: Extract market decision layer into 7 modules + 72 tests |
| `5ceda17` | **Phase 1.4**: Extract script classifier into 5 named-constant modules + 42 tests |
| `32e8f33` | docs: STATE.md updated post Phase 1.3 |
| `3075c9f` | **Phase 1.3**: Extract 14-layer xG pipeline + 53 tests + 1 silent NaN bug fixed |
| `b69dca4` | **Phase 0**: Consolidation cleanup (skills/, prisma/, orphan components) |
| `0a204e3` | docs |
| `b8cc487` | **Phase 1.2**: Extract calibration + FIX 3 production bugs |
| `4cd89a0` | **Phase 1.1**: Extract Poisson math + 36 tests |

## Cumulative Phase 1 impact

| Metric | Before | After | Δ |
|---|---|---|---|
| `v5/index.ts` LOC | 1,983 | 794 | **−60%** |
| Tests passing | 0 | **223** | +223 |
| Test runtime | n/a | 2.27s | — |
| Engine modules | 1 monolith | **4 namespaces × ~30 files** | structure win |
| Magic numbers in `index.ts` | dozens | 0 | tunability win |
| **Silent production bugs caught + fixed** | — | **4** | trust win |
| Engine output (fixture 9344) | 1.316 / 1.136 | **1.316 / 1.136** | ✅ bit-for-bit identical |

## Engine file map (post Phase 1.5)

```
src/lib/prediction-engine/v5/
├── index.ts                    ← orchestrator (794 LOC, was 1,983)
├── types.ts                    ← FeatureVector + ScriptOutput + MarketCandidate + ManagerProfile
├── feature-builder.ts          ← reads from Turso, builds FeatureVector
├── math/
│   ├── poisson.ts              ← Dixon-Coles + market derivation
│   ├── calibration.ts          ← blend + script nudges + identity enforcement
│   └── __tests__/              ← 56 tests (poisson + calibration)
├── xg/
│   ├── index.ts                ← 14-layer pipeline orchestrator
│   ├── shared.ts               ← safeNum + clamp + globals
│   ├── layers/01-base.ts ... 14-cap.ts
│   └── __tests__/              ← 53 tests (per-layer + integration)
├── script/
│   ├── index.ts                ← classifier orchestrator
│   ├── types.ts                ← ScriptCategory + ScriptInputs
│   ├── categories/dominant-home.ts ... chaotic-unreliable.ts
│   └── __tests__/              ← 42 tests (per-category + classifier)
└── markets/
    ├── index.ts                ← barrel export
    ├── registry.ts             ← MARKET_REGISTRY + MARKET_DEFINITIONS
    ├── build-candidates.ts     ← probs → candidates
    ├── implied-odds.ts         ← edge derivation
    ├── tactical-fit.ts         ← script ↔ market fit map
    ├── score.ts                ← multi-signal scorer + advisor status
    ├── prune.ts                ← weak-candidate filter + smart risk
    ├── rank.ts                 ← headline-quality ordering
    ├── select.ts               ← bestPick OR 8-code abstain
    └── __tests__/              ← 72 tests (registry + build + scoring + decision)
```

## Bugs the test suite has caught + fixed

| # | Bug | Severity | Phase |
|---|---|---|---|
| 1 | Script nudges to complement pairs silently overwritten | High — script intel partially neutralised in prod | 1.2 |
| 2 | `over15` hard cap could be undone by monotonicity raise | Medium | 1.2 |
| 3 | Sanity dampener could violate monotonicity | Medium | 1.2 |
| 4 | Silent NaN propagation in form-boosts | High — NaN xG silently produced | 1.3 |

## Production verification across phases

Same fixture (9344, América de Cali vs Macará), all phases:

| Phase | xG home | xG away | over25 | bttsYes | 1X2 sum |
|---|---|---|---|---|---|
| Pre Phase 1.3 (live baseline) | 1.316 | 1.136 | 0.4754 | 0.5319 | 1.0000 |
| Post Phase 1.3 | 1.316 | 1.136 | 0.4754 | 0.5319 | 1.0000 |
| Post Phase 1.4 | (identical) | (identical) | (identical) | (identical) | 1.0000 |
| Post Phase 1.5 | 1.316 | 1.136 | 0.4754 | 0.5319 | 1.0000 |

**Zero regression across 6 commits + 4 module extractions + 223 tests.**

## Phase 1 remaining (deferred to next session)

### 1.6 — Migrate `/api/match/[id]` from v4 → v5
**First phase that changes user-visible behaviour.** The legacy v4 route still serves the match detail panel — needs to be migrated to v5. Backed by tested engine, safe migration.

### 1.7 — Continuous backtest harness
`npm run backtest` replays N days of historical fixtures, outputs Brier / log-loss / ROI per market. Gates every engine PR. This is the prerequisite for Phase 2 football-intelligence modules.

## Phase 2+ (football intelligence) — unblocked

Now that the engine is modular and tested, intelligence modules become small typed additions:
1. Derby intensity refinement
2. Manager debut bonus (+10% home win first 3 games)
3. Rest-day asymmetry sharpening
4. Late-season motivation
5. Weather × playing style interaction
6. Set-piece specialist boost
7. Lineup confidence decay over time-to-kickoff

Each requires: pure module + tests + backtest result showing Brier improvement. **No module merges without a measurable Brier improvement.**

## Architectural rules locked in
- **Magic numbers are forbidden.** Every coefficient is a named, commented constant.
- **Property-based fuzz is mandatory** for any function with numeric inputs and probability outputs.
- **Pipeline order matters** — document it, test it.
- **NaN guard at every fv access** — `??` is not enough; use `safeNum()`.
- **Refactor invariant: bit-for-bit output match** — proven by production smoke test on every push.
- **"10× better" gate** for Phase 2: measurable Brier improvement on backtest or no merge.

## Session log
| Date | Session focus | Outcome |
|---|---|---|
| 2026-05-29 #1 | Phase 0 — Consolidation | 68% disk reduction |
| 2026-05-29 #2 | Phase 1.1 — Poisson math + tests | 36 tests |
| 2026-05-29 #3 | Phase 1.2 — Calibration + 3 bugs fixed | 56 tests, 3 silent bugs |
| 2026-05-29 #4 | Phase 0 push to prod | Cleanup live |
| 2026-05-29 #5 | Phase 1.3 — 14-layer xG + 1 NaN bug fixed | 109 tests, 4 silent bugs total |
| 2026-05-29 #6 | Phase 1.4 — Script classifier (5 categories) | 151 tests |
| 2026-05-29 #7 | Phase 1.5 — Market decision layer (7 modules) | **223 tests** |
