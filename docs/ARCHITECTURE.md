# Architecture — NeuralBet

> System design reference for contributors and code reviewers.

---

## Overview

NeuralBet is a **monorepo Next.js application** with three logical layers:

1. **Frontend** — React components (Tailwind + Framer Motion + Radix UI)
2. **API Layer** — Next.js route handlers under `/api/v5/`
3. **Engine** — Pure TypeScript prediction engine with no framework dependencies

The engine is designed to be **framework-agnostic** — it takes a fixture ID, reads from Turso, and returns a typed `PredictionResult`. The API layer is just a thin wrapper. The frontend is just a consumer.

---

## Data Flow

```
BSD API v2 ──────►  /api/v5/sync  ──────►  Turso Database
                    /api/v5/sync-h2h         (10+ tables)
                                                  │
User Request ────►  /api/v5/predict  ◄────────────┘
                    /api/v5/fixtures
                    /api/v5/match/[id]
                         │
                         ▼
                  V5 Phantom Engine
                         │
                         ▼
                  PredictionResult JSON
                         │
                    ┌────┴────┐
                    ▼         ▼
                Frontend   Cache (predictions_v2)
```

### Sync Pipeline

The sync engine (`src/lib/db/sync-engine.ts`) pulls data from BSD API v2 and upserts into Turso:

| Table | Source | Sync Frequency |
|-------|--------|----------------|
| `events` | `/events` | Every request (with date filter) |
| `odds` | `/odds` | With events sync |
| `standings` | `/standings` | With events sync |
| `lineups` | `/lineups` | With events sync |
| `managers` | `/managers` | With events sync |
| `referees` | `/referees` | With events sync |
| `leagues` | `/leagues` | On first sync |
| `teams` | `/teams` | On first sync |
| `historical_matches` | `/h2h` | On demand via `/api/v5/sync-h2h` |
| `predictions_v2` | Engine output | On every prediction |

### Caching Strategy

- Predictions are cached in `predictions_v2` with a **6-hour TTL**
- Cache stores the **full JSON blob** (`full_json` column) — no reconstruction loss
- Cache hit = return immediately. Cache miss = run engine + store + return
- H2H data is synced once and reused across predictions

---

## Engine Architecture

The V5 Phantom Engine is the core of NeuralBet. It lives in `src/lib/prediction-engine/v5/` and is structured as a pipeline:

```
preparePredictionContext(fixtureId)
│
├── Load 10 tables in parallel from Turso
├── Build FeatureVector (100+ fields)
├── adjustLineupCertainty()         ← lineup-decay module
└── applyDerbyToVolatility()        ← derby module (pre-step)
│
▼
classifyMatchScript(features)
│
├── Classify into 1 of 5 script types:
│   dominant_home · dominant_away · open_end_to_end
│   tight_low_event · chaotic_unreliable
└── Output: primary, confidence, controlScores, volatility
│
▼
runProbabilityPipeline(features, script)
│
├── estimateExpectedGoals(features)  ← 14-layer xG pipeline
├── applyRestDayToXg()               ← rest-day module
├── applyWeatherStyleToXg()          ← weather module
├── applyMotivationToXg()            ← late-season module
├── applySetPieceToXg()              ← set-piece module
├── buildScoreMatrix()               ← Dixon-Coles Poisson
├── deriveMarketProbabilities()      ← 30+ raw probabilities
├── calibrateProbabilities()         ← Platt-style calibration
├── applyDerbyToProbs()              ← derby module (post-step)
└── applyManagerDebutToProbs()       ← manager-debut module
│
▼
runMarketSelection(calibratedProbs, odds, script, features)
│
├── buildMarketCandidates()          ← 30+ candidates
├── computeImpliedProbabilities()    ← from bookmaker odds
├── scoreMarketCandidates()          ← model prob × edge × fit
├── pruneWeakCandidates()            ← threshold gates
├── rankMarkets()                    ← sort by final score
└── selectBestPickOrAbstain()        ← pick 1 or walk away
│
▼
finalizePredictionResult()
│
├── Assign confidence levels (model / value / volatility)
├── Generate reason codes (human-readable)
├── Save to predictions_v2 cache
└── Return PredictionResult
```

### Key Design Principles

1. **Every function is pure** (except DB reads/writes). Given the same FeatureVector, the engine produces the same result.

2. **Fail-safe, not fail-fast**. Missing data → graceful degradation (use league averages, skip module). Never crash.

3. **NaN-proof**. Every numeric access goes through `safeNum()`. The `??` operator doesn't catch NaN; `safeNum()` does.

4. **Testable at every layer**. Each xG layer, intelligence module, market scorer, and Poisson function has its own test file.

5. **Measurable**. No module ships without ablation infrastructure to prove it improves Brier score.

---

## Database Schema (Turso)

Key tables:

| Table | Primary Key | Purpose |
|-------|-------------|---------|
| `events` | `id` (BSD event ID) | Fixtures with scores, status, metadata |
| `odds` | `event_id` | Bookmaker odds per fixture |
| `standings` | `team_id + league_id + season_id` | League table positions + xG data |
| `lineups` | `event_id + team_id` | Starting 11 + formation |
| `managers` | `team_id` | Manager profile + tactical style |
| `referees` | `event_id` | Referee assignment + stats |
| `historical_matches` | `id` | H2H and form matches |
| `predictions_v2` | `event_id` | Cached engine predictions |
| `leagues` | `id` | League metadata |
| `teams` | `id` | Team metadata |

Schema is auto-initialized via `initializeDatabase()` in `src/lib/db/schema.ts`.

---

## Frontend Architecture

### State Management

- **Zustand** for global UI state (active tab, selected date, match panel, sidebar)
- **React Query** for server state (fixtures, predictions, tips) with auto-refetch

### Component Hierarchy

```
RootLayout (layout.tsx)
└── Providers (React Query + Theme)
    └── AppContent (page.tsx)
        ├── Sidebar (desktop) / BottomNav (mobile)
        └── Content Area
            ├── DashboardV2
            ├── Predictions → TipCard[]
            ├── ValueBets
            ├── LiveMatches
            ├── Leagues
            └── Bankroll
```

### Styling System

- **Tailwind 4** with custom theme tokens (CSS variables)
- **Custom CSS classes** for glassmorphism, glow effects, animations
- **No external CSS** — everything is self-contained
- **Dark-only** — no light mode (intentional, matches brand)

---

## CI Pipeline

`.github/workflows/ci.yml` runs on every push and PR:

```yaml
1. npm test        # 467 tests must pass
2. npm run build   # Strict TypeScript (no ignoreBuildErrors)
3. npm run lint    # ESLint (warn-only, tightening later)
```

The strict build is the most important gate — it caught Bugs #9 and #10 (competing FeatureVector interfaces, missing referee data).

---

## Deployment

### Vercel

- `vercel.json` configures build settings
- All API routes use `force-dynamic` (no static generation for prediction endpoints)
- Environment variables set in Vercel dashboard

### Self-Hosted

- `Caddyfile` included for reverse proxy
- `npm run build && npm start` for standalone
- Requires outbound network access to Turso and BSD API

---

## Security Considerations

- All API keys are in environment variables (never committed)
- `.env.example` documents required variables without values
- No authentication layer yet (public read-only API)
- Turso auth token should be scoped to the specific database
- BSD API key should be rate-limit-aware (the sync engine is respectful)
