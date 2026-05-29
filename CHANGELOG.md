# Changelog

All notable changes to NeuralBet are documented here.

---

## [Unreleased]

### Phase 4 — UI Overhaul
- Coming next: intelligence surfacing, redesigned cards, match detail page

---

## [0.3.0] — 2026-05-29

### Phase 3 — Ops Hardening

#### Changed
- `next.config.ts`: `ignoreBuildErrors: true → false` — TypeScript errors now block the build
- `vitest.config.ts`: migrated to Vitest 4 API (`poolOptions → fileParallelism`)
- `src/lib/types.ts`: extended `OddsData` with `under15/under25/under35/bttsNo`
- `src/lib/api.ts`: standings mapper aligned with `StandingData` (added `xgf, xga, xgd, live`)

#### Added
- `.github/workflows/ci.yml` — CI pipeline: `npm test` → `npm run build` (strict) → `npm run lint`

#### Fixed
- **BUG #9**: Two competing `FeatureVector` interfaces — intelligence module fields silently stripped at runtime
- **BUG #10**: Referee data never loaded in `preparePredictionContext` — set-piece module always no-op
- `predictions.tsx`: `tips.count → tipsData?.count` — was reading `.count` off an array

---

## [0.2.0] — 2026-05-29

### Phase 2 — Football Intelligence Modules

#### Added — Intelligence Modules
- **Derby** (2.1): Intensity-aware xG dampener + volatility boost + BTTS tilt for local derbies
- **Manager Debut** (2.3): +10/7/5/3% home win boost for first 4 home games under new manager
- **Rest Day** (2.4): -3/6/9% xG penalty when rest differential ≥ 3 days
- **Weather × Style** (2.6): Possession teams suffer in rain (-12%), pressing teams in heat (-8%)
- **Late-Season Motivation** (2.7): Title/Europe/relegation fights boost xG; dead-rubber dampens
- **Set-Piece Specialist** (2.8): +5% xG when strict referee + team scores from set pieces
- **Lineup Decay** (2.9): Decays lineup certainty by hours-to-kickoff (0-30% range)

#### Added — Infrastructure
- `intelligence/flags.ts` — Per-module kill switches with `withIntelligenceFlags()` scoping
- `backtest/compare.ts` — Module ablation: runs backtest ON vs OFF, diffs Brier score
- `scripts/ablate.ts` — CLI: `npm run ablate -- --module=X --days=90`
- H2H sync pipeline (`/api/v5/sync-h2h`) — populates `historical_matches` for Layer 7

#### Added — Tests
- 107 intelligence module tests across 7 modules
- 16 ablation infrastructure tests
- 29 H2H sync + utility tests
- **Total: 467 tests passing**

#### Fixed
- **BUG #5**: Lossy cache in `/api/v5/predict` — script/confidence dropped on cache hit
- **BUG #6**: `impliedProbability` import broken — bookmaker blend silently dead
- **BUG #7**: `.gitignore` rule swallowed `sync-h2h.ts` — broken build on Vercel
- **BUG #8**: Managers never loaded in `preparePredictionContext`

---

## [0.1.0] — 2026-05-29

### Phase 1 — Engine Extraction & Testing

#### Added — Engine Modules
- **Poisson** (1.1): Dixon-Coles adjusted Poisson distribution, extracted to `math/poisson.ts`
- **Calibration** (1.2): Probability calibration with bookmaker odds blending, extracted to `math/calibration.ts`
- **14-Layer xG Pipeline** (1.3): 560-line monolith split into 14 individually tested layers
- **Script Classifier** (1.4): 5 match-type categories, each in own file with named constants
- **Market Selection** (1.5): 7 modules (build → score → prune → rank → select), 30+ markets
- **V5 Adapters** (1.6): Migrated `/api/match/[id]` and `/api/v4/predictions` from V4 → V5
- **Backtest Harness** (1.7): Brier score, log loss, hit rate, ROI, calibration buckets
- **Legacy Cleanup** (1.8): Deleted V1, V3, V4 engines + orphan routes

#### Added — Tests
- 36 Poisson distribution tests
- 20 calibration tests
- 53 xG layer tests (per-layer contract pinning + property-based fuzz)
- 42 script classifier tests
- 72 market selection tests
- 45 adapter tests
- 47 backtest scorer + outcome tests
- **Total: 315 tests passing**

#### Fixed
- **BUG #1**: Script nudges to complement pairs silently overwritten
- **BUG #2**: `over15` cap undone by monotonicity raise
- **BUG #3**: Sanity dampener violated monotonicity
- **BUG #4**: NaN propagation in form-boosts layer (`??` doesn't catch NaN)

#### Changed
- `index.ts`: 1,983 → 927 LOC (engine orchestrator)
- All magic numbers lifted to named, exported constants

---

## [0.0.1] — 2026-05-27

### V4 — Punter Brain Sniper Engine

#### Added
- V4 prediction engine with 8 statistical models
- Full market probabilities (1X2, O/U, BTTS, DC, DNB, Asian HC, Correct Score)
- Punter brain with Kelly Criterion and risk assessment
- Turso database integration with sync engine
- BSD API → Turso sync pipeline
- Dark cyberpunk glassmorphism UI with Framer Motion animations
- Match detail panel
- Fixtures dashboard
- `.env.example` for setup

---

## Version History Summary

| Version | Date | Tests | Bugs Fixed | Key Milestone |
|---------|------|-------|------------|---------------|
| 0.3.0 | 2026-05-29 | 467 | 10 total | Strict TS + CI gate |
| 0.2.0 | 2026-05-29 | 467 | 8 total | 7 intelligence modules |
| 0.1.0 | 2026-05-29 | 315 | 4 total | Engine fully tested |
| 0.0.1 | 2026-05-27 | 0 | 0 | V4 initial release |
