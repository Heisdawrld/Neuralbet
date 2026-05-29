# NeuralBet — Project State

> Single source of truth across sessions. Updated end of every working session.

## Current Snapshot — 2026-05-29 (Phase 2.1 LIVE — first football-intelligence module)

**Status**: V5 only engine. Derby intelligence module wired + live. 14 commits on `main` since Phase 0.
**Live URL**: https://neuralbet-lovat.vercel.app
**Tests**: **335 passing in 3.01s**
**Engine canon**: `src/lib/prediction-engine/v5/`
**Backtest harness**: `npm run backtest` (deferred Brier-improvement proof until enough cached data)

## Live commits on `main` (most recent 6)

| SHA | Title |
|---|---|
| `e26765d` | **Phase 2.1.1**: Fix lossy cache in /api/v5/predict (BUG #5 caught in prod) |
| `f79b4b4` | **Phase 2.1**: Derby intelligence — intensity-aware xG/volatility/BTTS |
| `12a6fcb` | **Phase 1.8**: Delete legacy engines (v1, v3, v4) + 14 tests for value-bet adapter |
| `387a70a` | docs |
| `8e701d5` | **Phase 1.7**: Backtest harness (Brier/log-loss/hit-rate/ROI/calibration) |
| `91107c5` | **Phase 1.6**: Migrate /api/match/[id] + /api/v4/predictions from V4 → V5 |

## Cumulative impact since start

| Metric | Pre Phase 1 | Now |
|---|---|---|
| `v5/index.ts` LOC | 1,983 | 798 |
| Engines wired | v1 + v3 + v4 + v5 | **V5 only** |
| `prediction-engine/` total LOC | 13,654 | ~6,000 |
| API routes | 14 | 10 |
| **Tests** | 0 | **335** |
| Test runtime | n/a | 3.01s |
| **Silent bugs caught + fixed** | — | **5** |
| Live fixture-9456 xG | n/a | 1.35 / 1.16 |

## Phase 2.1 — first real intelligence module

**Module**: `src/lib/prediction-engine/v5/intelligence/derby.ts` (256 LOC + 21 tests)

**What it does** (numerical impact on Premier League derby with intensity ≈ 0.85):
- xG dampened **~12%** (was a flat -3%)
- matchChaosScore raised by **+0.10** (engine more humble → more abstains)
- bttsYes tilted up **+2.5%** (matches research data)

**Intensity scales** with:
- `h2hMatchesAvailable` (40% weight, saturates at 10)
- `matchChaosScore` (30% weight)
- proximity from `travelDistanceKm` (30% weight)

**Honest caveat (per the 10× rule)**: ships behind no flag — backtest-proof of Brier improvement is deferred until enough finished derby fixtures are cached in `predictions_v2`. Phase 2.2 will add derby-flag filtering to the backtest runner so we can ablate this module specifically and confirm/revert.

## The 5 silent production bugs the testing/observability work has caught and fixed

| # | Bug | Phase | How detected |
|---|---|---|---|
| 1 | Script nudges to complement pairs silently overwritten | 1.2 | Unit test on calibration |
| 2 | `over15` cap could be undone by monotonicity raise | 1.2 | Unit test on calibration |
| 3 | Sanity dampener could violate monotonicity | 1.2 | Unit test on calibration |
| 4 | NaN propagation in form-boosts | 1.3 | Integration test on xG orchestrator |
| 5 | Lossy cache reconstruction in `/api/v5/predict` | 2.1.1 | Production smoke test after Phase 2.1 |

## Engine file map (post Phase 2.1.1)

```
src/lib/prediction-engine/v5/
├── index.ts                ← orchestrator (798 LOC)
├── types.ts                ← FeatureVector + ScriptOutput + MarketCandidate + ManagerProfile
├── feature-builder.ts
├── math/                   ← Poisson + calibration (+ 56 tests)
├── xg/                     ← 14-layer xG pipeline (+ 53 tests)
├── script/                 ← script classifier (+ 42 tests)
├── markets/                ← decision layer (+ 72 tests)
├── adapters/               ← V5 → PunterTipV4 + ValueBet (+ 45 tests)
├── backtest/               ← Brier/log-loss/hit-rate/ROI/calibration (+ 42 tests)
└── intelligence/
    ├── derby.ts            ← intensity-aware derby refinement (+ 21 tests)
    └── __tests__/
```

## Phase 2 queue (each gated by backtest Brier improvement)

| Module | Hypothesis |
|---|---|
| 2.2 — Backtest runner: derby-flag ablation + first real backtest report | (infra for the gate) |
| 2.3 — Manager debut bonus | New manager → +10% home win rate first 3 games |
| 2.4 — Rest-day asymmetry | 4+ day advantage → +0.15 xG to advantaged side |
| 2.5 — Late-season motivation | Qualified teams rotate; relegation strugglers overperform xG |
| 2.6 — Weather × playing style | Wet pitch dampens possession teams more than direct |
| 2.7 — Set-piece specialist boost | Elite dead-ball striker + strict ref → +0.2 xG |
| 2.8 — Lineup confidence decay | Predicted lineup less reliable far from kickoff |

## Architectural rules locked in

1. Magic numbers are forbidden — every coefficient is a named, commented constant
2. Property-based fuzz is mandatory for numeric → probability functions
3. Pipeline order matters — document it, test it
4. NaN guard at every fv access — `??` is not enough; use `safeNum()`
5. Refactor invariant: bit-for-bit output match — proven by production smoke test
6. **Phase 2+ modules require a measurable Brier improvement on the backtest** — no module merges without it

## Session log

| Date | Session focus | Outcome |
|---|---|---|
| 2026-05-29 #1 | Phase 0 — Consolidation | 68% disk reduction |
| 2026-05-29 #2-5 | Phase 1.1-1.3 — math + xg modules + tests + 4 silent bugs | 109 tests, fully tested foundation |
| 2026-05-29 #6 | Phase 1.4 — Script classifier | 151 tests |
| 2026-05-29 #7 | Phase 1.5 — Market decision layer | 223 tests |
| 2026-05-29 #8 | Phase 1.6 — V4 → V5 migration | 254 tests, match panel on V5 |
| 2026-05-29 #9 | Phase 1.7 — Backtest harness | 300 tests, Phase 2 unblocked |
| 2026-05-29 #10 | Phase 1.8 — Delete legacy engines (-8,287 LOC) | 314 tests |
| 2026-05-29 #11 | Phase 2.1 — Derby intelligence + Phase 2.1.1 cache bug fix (#5) | **335 tests**, first intelligence module live |
