# NeuralBet — Project State

> Single source of truth across sessions. Updated end of every working session.

## Current Snapshot — 2026-05-29 (Phase 3 COMPLETE — strict TS + CI + 10 bugs fixed + full documentation)

**Status**: V5 engine has **7 live football-intelligence modules**, all flag-gated and ablation-ready. H2H sync wired and populating. Match panel + predictions tab serve V5 via adapters. 24 commits on main since Phase 0.
**Live URL**: https://neuralbet-lovat.vercel.app
**Tests**: **467 passing in 5.39s** (CI-gated)
**Engine canon**: `src/lib/prediction-engine/v5/`
**API surface**: 11 routes
**Lines of test code**: ~2,500 across 25 test files
**Silent bugs caught + fixed**: **10** across the rebuild

## Live intelligence modules

| # | Module | What it does |
|---|---|---|
| 1 | `derby` | Intensity-aware xG dampener + volatility boost + BTTS tilt for local derbies |
| 2 | `manager_debut` | +10/7/5/3% homeWin for first 4 home games under new manager |
| 3 | `rest_day` | Penalises fatigued side -3/-6/-9% xG when rest differential ≥3 days |
| 4 | `weather_style` | Possession teams suffer in rain (-12%), pressing teams in heat (-8%), wind cuts both, compound multiplicatively |
| 5 | `late_season_motivation` | Title/Europe/relegation fights +5-7% xG; dead-rubber teams -5-8% xG; only fires in final 20% of season |
| 6 | `set_piece_specialist` | +5% xG when strict ref + team scores ≥10% above league avg |
| 7 | `lineup_decay` | Decays lineup certainty score by hours-to-kickoff (0-30%); pushes engine toward humility for far-out predictions |

## Live commits on `main` (most recent 8)

| SHA | Title |
|---|---|
| `4461b20` | **Phase 2.7+2.8+2.9**: late-season motivation + set-piece + lineup-decay (3 modules, 39 tests) |
| `6f79894` | **Phase 2.6**: Weather × playing-style intelligence (+ loads managers, fixing silent gap) |
| `76c0548` | **Phase 2.4**: Rest-day asymmetry |
| `2e21dc6` | **Phase 2.5.3 hotfix**: better error capture in bulk H2H sync |
| `82ca88f` | **Phase 2.5.2 hotfix**: clean up bulk H2H sync stats |
| `fe6b41b` | **Phase 2.5.1 hotfix**: .gitignore swallowed sync-h2h.ts |
| `6a1b570` | **Phase 2.5**: H2H sync — populate historical_matches so Layer 7 fires |
| `2bfce31` | **Phase 2.x bugfix#2**: standings robust dedup |

## Engine file map (post Phase 2.9)

```
src/lib/prediction-engine/v5/
├── index.ts                ← orchestrator (~870 LOC)
├── types.ts                ← FeatureVector now has 30+ fields
├── feature-builder.ts      ← Turso → FeatureVector
├── utils.ts                ← impliedProbability (restored after Phase 1.8 deletion)
├── math/poisson + calibration  (+ 56 tests)
├── xg/ 14 layers           (+ 53 tests)
├── script/ 5 categories    (+ 42 tests)
├── markets/ 7 modules      (+ 72 tests)
├── adapters/ punter + value (+ 45 tests)
├── backtest/ + compare     (+ 47 tests)
└── intelligence/
    ├── flags.ts            ← 7 module kill switches
    ├── derby.ts            ← Phase 2.1
    ├── manager-debut.ts    ← Phase 2.3
    ├── rest-day.ts         ← Phase 2.4
    ├── weather-style.ts    ← Phase 2.6
    ├── late-season-motivation.ts ← Phase 2.7
    ├── set-piece-specialist.ts   ← Phase 2.8
    ├── lineup-decay.ts     ← Phase 2.9
    └── __tests__/          ← 107 intelligence tests across 7 modules
```

## V5 orchestrator pipeline (post Phase 2.9)

```
preparePredictionContext(fixtureId)
  → loads 10 tables in parallel (events, odds, leagues, teams, standings ×2, h2h, managers ×2, lineups)
  → adjustLineupCertainty (Phase 2.9 pre-step)
  → derby volatility boost (Phase 2.1 pre-step)
  → classifyMatchScript (extracted module, 5 categories)
  → runProbabilityPipeline:
       estimateExpectedGoals (12-layer xG, in xg/ module)
       → applyRestDayToXg (Phase 2.4)
       → applyWeatherStyleToXg (Phase 2.6)
       → applyMotivationToXg (Phase 2.7)
       → applySetPieceToXg (Phase 2.8)
       → buildScoreMatrix (Dixon-Coles Poisson)
       → calibrateProbabilities (extracted module)
       → applyDerbyToProbs (Phase 2.1 post-step)
       → applyManagerDebutToProbs (Phase 2.3 post-step)
  → runMarketSelection (extracted module: build → score → prune → rank → select)
  → finalizePredictionResult
```

Every step is a tested, named, single-purpose function. Every constant is documented.

## The 8 silent production bugs caught + fixed

| # | Bug | Phase |
|---|---|---|
| 1 | Script nudges to complement pairs silently overwritten | 1.2 |
| 2 | `over15` cap could be undone by monotonicity raise | 1.2 |
| 3 | Sanity dampener could violate monotonicity | 1.2 |
| 4 | NaN propagation in form-boosts | 1.3 |
| 5 | Lossy cache reconstruction in `/api/v5/predict` | 2.1.1 |
| 6 | `impliedProbability` import broken — bookmaker blend silently dead | 2.x bugfix |
| 7 | `.gitignore` `db/` rule swallowed `sync-h2h.ts` | 2.5.1 |
| 8 | Managers never loaded in preparePredictionContext (Phase 2.6 fixed it) | 2.6 |

## Honest caveats

1. **Brier-improvement gates deferred**: All 7 intelligence modules ship with research-backed magnitudes but no measured Brier improvement yet. The ablation infrastructure is ready (`npm run ablate -- --module=X`). Once we have ≥30 days of cached predictions with each module active, we can run real ablations.

2. **`late_season_motivation` won't fire yet** for most fixtures because `eventMatchday` requires `round_number` to be populated AND `leagueTotalMatchdays` requires schema work (not yet done). When it can't compute, it no-ops fail-safe.

3. **`set_piece_specialist` is a PROXY** until BSD player-stats sync lands in Phase 3.

4. **`hoursToKickoff` is computed from kickoff vs now** — works for predictions made fresh, but cached predictions have a stale hoursToKickoff at the time of caching. Not a correctness bug (decay just behaves as it did when cached) but a subtle freshness consideration.

## What's next

**Three legitimate directions**:

1. **Phase 3 — Operations hardening**:
   - Turn off `ignoreBuildErrors: true` (would have prevented Bug #6)
   - Add a real CI step running `npm test` + `npm run build` on every PR
   - Add `npm run ablate` as a CI gate for any change touching `intelligence/`
   - Wire the backtest output into the admin panel (UI)
   - Add BSD player-stats sync (enables real set-piece specialist + per-player impact features)

2. **Phase 4 — UI/UX overhaul**:
   - Now that the engine HAS intelligence, the UI should SHOW intelligence
   - Match panel: redesigned with intelligence-module badges ("derby intensity 0.85", "manager debut", "rain × possession matchup")
   - "Phantom verdict" card on every prediction
   - Live tip cards, calibration plots in admin, etc.

3. **Phase 5 — Live in-play engine**:
   - The BSD WebSocket addon ($3/mo, you previously deferred)
   - In-play re-prediction every 5 seconds during live matches
   - No NGN competitor has this

I'd recommend **Phase 3 then Phase 4** — harden the engine, then make the product show what the engine knows.

## Session log

| Date | Session focus | Outcome |
|---|---|---|
| 2026-05-29 #1-11 | Phases 0 + 1.x | V5 only engine, 314 tests, 4 silent bugs caught |
| 2026-05-29 #12 | Phase 2.1-2.3 | Derby + manager debut + ablation infra (335→366 tests) |
| 2026-05-29 #13 | Phase 2.x bugfix + 2.5 | H2H sync + standings/H2H fixes (381 tests) |
| 2026-05-29 #14 | Phase 2.4 + 2.6 | Rest-day + weather × style (428 tests) |
| 2026-05-29 #15 | Phase 2.7 + 2.8 + 2.9 | Late-season motivation + set-piece + lineup-decay (**467 tests**) |
