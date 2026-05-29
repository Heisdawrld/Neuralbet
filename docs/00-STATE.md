# NeuralBet — Project State

> Single source of truth across sessions. Updated end of every working session.

## Current Snapshot — 2026-05-29 (Phase 2.3 LIVE — second intelligence module + ablation infra)

**Status**: V5 only engine. Two intelligence modules live (derby + manager debut). Backtest ablation infrastructure ready. 17 commits on `main` since Phase 0.
**Live URL**: https://neuralbet-lovat.vercel.app
**Tests**: **366 passing in 4.12s**
**Engine canon**: `src/lib/prediction-engine/v5/`
**Ablation CLI**: `npm run ablate -- --module=derby --days=90 --require-derby`

## Live commits on `main` (most recent)

| SHA | Title |
|---|---|
| `419738c` | **Phase 2.3**: Manager debut bonus (intensity-scaled +10%→0% over 4 matches) |
| `49a79e5` | **Phase 2.2**: Intelligence flags + backtest ablation infrastructure |
| `8cdb2d9` | docs |
| `e26765d` | **Phase 2.1.1**: Fix lossy cache in /api/v5/predict (5th silent bug) |
| `f79b4b4` | **Phase 2.1**: Derby intelligence (intensity-aware xG/volatility/BTTS) |
| `12a6fcb` | **Phase 1.8**: Delete legacy engines (v1/v3/v4) + value-bet adapter |

## Two intelligence modules now live

### 2.1 — Derby
- Intensity-aware xG dampener (replaces flat -3% with -8% baseline scaled up to -13.5% for fierce derbies)
- Volatility boost → engine more humble on derbies → more abstains
- BTTS slight tilt UP (matches research)
- Intensity scales with H2H meeting count + chaos signal + venue proximity

### 2.3 — Manager debut
- Pulled from `manager_career.date_from` + `manager_career.matches`
- First 3 home games: +10% → +7% → +5% → +3% to homeWin
- Draw dampened proportionally (the lift comes mostly from converted draws)
- 60-day appointment-window guard
- Probability-preserving — re-normalises 1X2 to exactly 1.0

## Backtest ablation infrastructure (Phase 2.2)

**Mechanism**: every intelligence module has a per-module flag (`derby`, `manager_debut`, `rest_day`, `late_season`, `weather_style`). Default state: all ON.

**Tools**:
- `withIntelligenceFlags({derby: false}, async () => runBacktest(...))` — scoped flag override with try/finally restore
- `ablateModule({module: 'derby', baseOptions: {days: 90, requireDerby: true}})` — runs backtest twice (ON then OFF), diffs Brier per market, classifies verdict as IMPROVES / REGRESSES / NEUTRAL
- `npm run ablate -- --module=derby --days=90 --require-derby` — CLI gate that exits non-zero on REGRESSES

**Backtest runner** extended with `requireDerby`, `leagueId`, `label` filters.

## The 5 silent production bugs caught + fixed (cumulative)

| # | Bug | Severity | Phase |
|---|---|---|---|
| 1 | Script nudges to complement pairs silently overwritten | High | 1.2 |
| 2 | `over15` cap could be undone by monotonicity raise | Medium | 1.2 |
| 3 | Sanity dampener could violate monotonicity | Medium | 1.2 |
| 4 | NaN propagation in form-boosts | High | 1.3 |
| 5 | Lossy cache reconstruction in `/api/v5/predict` | High | 2.1.1 |

## Engine file map (post Phase 2.3)

```
src/lib/prediction-engine/v5/
├── index.ts                    ← orchestrator (~800 LOC)
├── types.ts                    ← FeatureVector now has 4 new debut fields
├── feature-builder.ts          ← reads manager_career for tenure data
├── math/poisson + calibration  (+ 56 tests)
├── xg/ 14 layers               (+ 53 tests)
├── script/ 5 categories        (+ 42 tests)
├── markets/ 7 decision modules (+ 72 tests)
├── adapters/ punter + value    (+ 45 tests)
├── backtest/
│   ├── scorers.ts              ← Brier / log-loss / hit-rate / ROI / calibration
│   ├── outcomes.ts             ← score → market outcome map
│   ├── runner.ts               ← runBacktest (now with fixture-flag filters)
│   └── compare.ts              ← ablateModule + formatComparison
│   (+ 47 tests)
└── intelligence/
    ├── flags.ts                ← per-module kill switches
    ├── derby.ts                ← intensity-aware (Phase 2.1)
    ├── manager-debut.ts        ← debut bonus + tenure decay (Phase 2.3)
    └── __tests__/              ← 47 tests across 3 suites
```

## Phase 2 queue

| Phase | Module | Hypothesis |
|---|---|---|
| **2.4** | Rest-day asymmetry | 4+ day rest advantage → +0.15 xG |
| 2.5 | Late-season motivation | Qualified teams rotate; relegation strugglers overperform xG |
| 2.6 | Weather × playing style | Wet pitch dampens possession teams more |
| 2.7 | Set-piece specialist boost | Elite dead-ball striker + strict ref → +0.2 xG |
| 2.8 | Lineup confidence decay | Predicted lineup less reliable far from kickoff |

## Architectural rules locked in

1. Magic numbers are forbidden — named constants only
2. Property-based fuzz mandatory for numeric → probability functions
3. Pipeline order matters — document it, test it
4. NaN guard at every fv access — `safeNum()`, never `??`
5. Refactor invariant: bit-for-bit output match — production smoke test on every push
6. **Phase 2+ modules require measurable Brier improvement on the backtest** — gate via `npm run ablate`

## Session log

| Date | Session focus | Outcome |
|---|---|---|
| 2026-05-29 #1 | Phase 0 — Consolidation | 68% disk reduction |
| 2026-05-29 #2-5 | Phase 1.1-1.3 — math + xg + tests | 109 tests, 4 silent bugs |
| 2026-05-29 #6 | Phase 1.4 — Script classifier | 151 tests |
| 2026-05-29 #7 | Phase 1.5 — Market decision layer | 223 tests |
| 2026-05-29 #8 | Phase 1.6 — V4 → V5 migration | 254 tests |
| 2026-05-29 #9 | Phase 1.7 — Backtest harness | 300 tests |
| 2026-05-29 #10 | Phase 1.8 — Delete legacy (-8,287 LOC) | 314 tests |
| 2026-05-29 #11 | Phase 2.1 + 2.1.1 — Derby + 5th silent bug fix | 335 tests, 1st intelligence module |
| 2026-05-29 #12 | Phase 2.2 + 2.3 — Ablation infra + manager debut | **366 tests**, 2nd intelligence module live |
