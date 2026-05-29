# NeuralBet — Project State

> Single source of truth across sessions. Updated end of every working session.

## Current Snapshot — 2026-05-29 (Phase 1.3 LIVE on prod)

**Status**: V5 engine math fully extracted, tested, NaN-safe. 4 commits live on `main`. Vercel deployed. Engine output bit-for-bit identical pre/post refactor — proven via production smoke test on fixture 9344.
**Live URL**: https://neuralbet-lovat.vercel.app
**Tests**: **109 passing in 0.99s**. (was: 0 tests before this work began.)
**Engine canonical home**: `src/lib/prediction-engine/v5/` (math + xg + types)

## Live commits on main

| SHA | Title |
|---|---|
| `3075c9f` | Phase 1.3: Extract 14-layer xG pipeline + 53 tests + 1 silent NaN bug fixed |
| `b69dca4` | Phase 0: Consolidation — applied to main |
| `0a204e3` | docs: update STATE.md after Phase 1.2 — checkpoint |
| `b8cc487` | Phase 1.2: Extract calibration + FIX 3 production bugs caught by tests |
| `4cd89a0` | Phase 1.1: Extract Poisson math to tested standalone module |

## Engine file map (post Phase 1.3)

```
src/lib/prediction-engine/v5/
├── index.ts              ← orchestrator (1,423 LOC, was 1,983)
├── types.ts              ← FeatureVector + ScriptOutput + ManagerProfile
├── feature-builder.ts    ← reads from Turso, builds FeatureVector
├── math/
│   ├── poisson.ts        ← Dixon-Coles + market derivation
│   ├── calibration.ts    ← blend + script nudges + identity enforcement
│   └── __tests__/        ← 56 tests
└── xg/
    ├── index.ts          ← 14-layer pipeline orchestrator
    ├── shared.ts         ← safeNum, clamp, round3, globals
    ├── layers/
    │   ├── 01-base.ts                       ← team strength × league × home adv
    │   ├── 02-thin-data-regression.ts
    │   ├── 03-venue-anchoring.ts
    │   ├── 04-script-adjustments.ts
    │   ├── 05-form-boosts.ts                (NaN-safe after Phase 1.3 fix)
    │   ├── 06-odds-anchor.ts
    │   ├── 07-h2h-blend.ts
    │   ├── 08-league-goal-rate.ts
    │   ├── 09-tactical-ai.ts
    │   ├── 10-bsd-intelligence.ts
    │   ├── 11-deep-bsd-signals.ts
    │   ├── 12-context-adjustments.ts
    │   ├── 13-squad-management.ts
    │   └── 14-cap.ts
    └── __tests__/        ← 53 tests (layers + integration)
```

## Bugs caught + fixed by the new test suite (cumulative across phases)

| # | Bug | Severity | Caught in |
|---|---|---|---|
| 1 | Script nudges to complement pairs (bttsNo, over25…) silently overwritten | High — script intel partially neutralised in prod | Phase 1.2 |
| 2 | `over15` hard cap could be undone by monotonicity raise when over25 ≥ 0.90 | Medium — edge case | Phase 1.2 |
| 3 | Sanity dampener could violate monotonicity when over25 < 0.40 | Medium — internal inconsistency surfaces to user | Phase 1.2 |
| 4 | Silent NaN propagation in form-boosts when input has NaN | High — produces NaN xG silently, breaks downstream | Phase 1.3 |

**Total: 4 silent production bugs fixed by writing tests.** This is the value-of-tests argument made concrete.

## Engine output regression test (production verified)

Fixture 9344 (América de Cali vs Macará) returns **bit-for-bit identical** output before and after Phase 1.3:
- xG home/away/total: 1.316 / 1.136 / 2.452
- 1X2: 0.4848 / 0.2611 / 0.2541 (sum = 1.0 exactly)
- Best pick: ABSTAIN (correct: low data quality fixture)

## Phase 1 queue (remaining)

### 1.4 — Extract classifyMatchScript
Currently ~270 LOC inline. Same treatment: pure module + tests pinning classification.

### 1.5 — Extract market scoring + pruning + selection
Decision-layer functions. Heavy logic. Scenario-based tests (not just probability invariants).

### 1.6 — Migrate `/api/match/[id]` from v4 → v5
Backed by tested engine = safe migration.

### 1.7 — Backtest harness
`npm run backtest` replays N days of historical fixtures, outputs Brier / log-loss / ROI per market. **Gates every engine PR.** This is where Phase 2 football-intelligence modules will start earning their place.

## Phase 2+ (football intelligence modules)

Now that the engine is modular and tested, intelligence modules become small typed additions:
1. Derby intensity refinement (uses BSD `is_local_derby`)
2. Manager debut bonus (new manager → +10% home win first 3 games)
3. Rest-day asymmetry sharpening
4. Late-season motivation (qualified-for-Europe rotation)
5. Weather × playing style interaction
6. Set-piece specialist boost (uses BSD player rating top-N)
7. Lineup confidence decay over time-to-kickoff

Each requires: pure module + tests + backtest result showing Brier improvement. **No module merges without a measurable Brier improvement.**

## Architectural rules locked in
- **Magic numbers are forbidden.** Every coefficient is a named, commented constant.
- **Property-based fuzz is mandatory** for any function with numeric inputs and probability outputs.
- **Pipeline order matters** — document it, test it. (We caught 4 pipeline-order bugs this way.)
- **NaN guard at every fv access** — `??` is not enough; use `safeNum()`.
- **Refactor invariant: bit-for-bit output match** — proven by production smoke test on a known fixture.
- **"10× better" gate**: every Phase 2 intelligence module must show a measurable Brier-score improvement on the backtest before it ships. No vibes.

## Session log
| Date | Session focus | Outcome |
|---|---|---|
| 2026-05-29 #1 | Phase 0 — Consolidation | 68% disk reduction, canon engine locked in |
| 2026-05-29 #2 | Phase 1.1 — Extract Poisson math | 36 tests, foundation locked |
| 2026-05-29 #3 | Phase 1.2 — Extract calibration + 3 bugs fixed | 20 more tests, 3 silent bugs fixed |
| 2026-05-29 #4 | Phase 0 deferred merge + push to prod | All phase 0 deletions live |
| 2026-05-29 #5 | Phase 1.3 — Extract 14-layer xG pipeline + 1 silent NaN bug fixed | 53 more tests, prod identical output verified |
