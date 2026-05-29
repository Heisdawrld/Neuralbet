<p align="center">
  <img src="https://img.shields.io/badge/Engine-V5_Phantom-10b981?style=for-the-badge&labelColor=0a0e1a" alt="Engine V5" />
  <img src="https://img.shields.io/badge/Tests-489_passing-06b6d4?style=for-the-badge&labelColor=0a0e1a" alt="Tests" />
  <img src="https://img.shields.io/badge/Bugs_Caught-10_silent-f59e0b?style=for-the-badge&labelColor=0a0e1a" alt="Bugs" />
  <img src="https://img.shields.io/badge/Intelligence-7_modules-8b5cf6?style=for-the-badge&labelColor=0a0e1a" alt="Modules" />
  <img src="https://img.shields.io/badge/Markets-30+-ef4444?style=for-the-badge&labelColor=0a0e1a" alt="Markets" />
</p>

<h1 align="center">
  ⚡ NeuralBet
</h1>

<p align="center">
  <strong>Statistical football prediction model with a 15-layer xG pipeline (incl. neural net),<br/>7 intelligence modules, and backtest-gated accuracy.</strong>
</p>

<p align="center">
  <a href="https://neuralbet-lovat.vercel.app">Live Demo</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="docs/ENGINE.md">Engine Docs</a> ·
  <a href="docs/API.md">API Reference</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a>
</p>

---

## What is NeuralBet?

NeuralBet is a **production-grade football prediction model** that ingests real-time data from multiple sources — fixtures, odds, standings, xG tables, lineups, managers, referees, H2H history, weather, and prediction markets — and runs it through a calibrated statistical engine to generate actionable betting intelligence across **30+ markets**.

It doesn't guess. It computes probabilities, measures its own accuracy with Brier scores, and refuses to tip when the edge isn't there.

### Key Capabilities

| | Feature | Detail |
|---|---------|--------|
| 🧠 | **15-Layer xG Pipeline** | Base xG → venue anchoring → form boosts → odds blend → H2H → tactical AI → context adjustments → league-aware caps. Each layer isolated, tested, tunable. |
| 🔬 | **7 Intelligence Modules** | Derby intensity, manager debut bonus, rest-day asymmetry, weather × style, late-season motivation, set-piece specialist, lineup decay. All flag-gated with kill switches. |
| 📊 | **30+ Market Coverage** | 1X2, Over/Under (1.5–4.5), BTTS, Double Chance, Draw No Bet, Asian Handicap, Correct Score. Each market scored, pruned, ranked independently. |
| 🎯 | **Kelly Criterion Staking** | Optimal stake sizing based on edge detection. Risk-adjusted: VERY_LOW → VERY_HIGH classification per pick. |
| 📈 | **Backtest & Ablation** | Brier score, log loss, hit rate, ROI, 10-bucket calibration. Per-module ablation: prove each module improves accuracy or revert it. |
| 🛡️ | **Abstain Logic** | Engine walks away when it doesn't have edge. No forced tips. Quality tiers: Gold / Silver / Bronze / Skip. |
| ⚡ | **Real-Time Sync** | BSD API v2 → Turso database pipeline. Fixtures, odds, lineups, standings, managers, referees, H2H — all synced and cached. |

---

## 🖥️ Screenshots

<p align="center">
  <em>Dark cyberpunk interface with glassmorphism cards, live data, and intelligence-surfaced predictions.</em>
</p>

> **Dashboard** — Fixture-centric view with 7-day date strip, league grouping, live match indicators, and prediction confidence bars.

> **Predictions** — Sniper view with Gold/Silver/Bronze tip tiers, expandable intelligence panels, and Kelly-optimal stake recommendations.

> **Match Detail** — Deep-dive into any fixture: full probability matrix, xG breakdown, H2H history, intelligence report, and odds comparison.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 16)                    │
│  Dashboard · Predictions · Value Bets · Live · Leagues · Bank  │
│  Zustand state · React Query · Framer Motion · Tailwind 4      │
└─────────────────────┬───────────────────────────────────────────┘
                      │ /api/v5/*
┌─────────────────────▼───────────────────────────────────────────┐
│                      API LAYER (Next.js Routes)                 │
│  /fixtures · /predict · /match/[id] · /sync · /sync-h2h        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                   V5 PHANTOM ENGINE                             │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Feature     │  │ xG Pipeline  │  │ Intelligence Modules   │ │
│  │ Builder     │→ │ (15 layers)  │→ │ derby · manager-debut  │ │
│  │             │  │              │  │ rest-day · weather      │ │
│  └─────────────┘  └──────┬───────┘  │ late-season · set-piece│ │
│                          │          │ lineup-decay            │ │
│                          ▼          └────────────┬────────────┘ │
│                   ┌──────────────┐               │              │
│                   │ Poisson +    │◄──────────────┘              │
│                   │ Calibration  │                              │
│                   └──────┬───────┘                              │
│                          │                                      │
│                   ┌──────▼───────┐                              │
│                   │ Market       │                              │
│                   │ Selection    │  build → score → prune       │
│                   │ (30+ mkts)   │  → rank → select/abstain    │
│                   └──────┬───────┘                              │
│                          │                                      │
│                   ┌──────▼───────┐  ┌────────────────────────┐ │
│                   │ Tip Adapter  │  │ Backtest + Ablation    │ │
│                   │ Gold/Silver/ │  │ Brier · LogLoss · ROI  │ │
│                   │ Bronze/Skip  │  │ Calibration buckets    │ │
│                   └──────────────┘  └────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                    DATA LAYER (Turso / libSQL)                   │
│  events · odds · standings · lineups · managers · referees      │
│  historical_matches · predictions_v2 · leagues · teams          │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Sync Engine
┌─────────────────────▼───────────────────────────────────────────┐
│                 EXTERNAL DATA SOURCES                            │
│  BSD API v2 · Polymarket · Weather APIs                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A [Turso](https://turso.tech) database (free tier works)
- A [BSD API](https://bsportsdata.com) key

### 1. Clone & Install

```bash
git clone https://github.com/Heisdawrld/Neuralbet.git
cd Neuralbet
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Turso Database
TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# BSD API
BSD_API_KEY=your-bsd-api-key
BSD_API_BASE_URL=https://api.bsportsdata.com/v2

# Optional
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run

```bash
# Development
npm run dev

# Run tests (467 passing)
npm test

# Production build
npm run build
npm start
```

### 4. Sync Data

Once running, trigger an initial data sync:

```bash
# Full sync (fixtures, odds, standings, lineups, managers, referees)
curl http://localhost:3000/api/v5/sync

# H2H historical data
curl http://localhost:3000/api/v5/sync-h2h
```

---

## 🧠 The Engine: How It Works

NeuralBet's V5 Phantom Engine runs a 4-stage pipeline for every fixture:

### Stage 1 — Feature Extraction

Loads 10+ tables in parallel from Turso: events, odds, leagues, teams, standings (home + away), H2H history, managers, lineups, referees. Builds a 100+ field `FeatureVector`.

### Stage 2 — xG Estimation (14 Layers)

Each layer takes the previous xG estimate and adjusts it:

| Layer | Name | What It Does |
|-------|------|--------------|
| 01 | Base xG | Team strength from goals scored/conceded |
| 02 | Thin Data Regression | Regresses small-sample teams toward league average |
| 03 | Venue Anchoring | Blends home-at-home and away-on-road splits |
| 04 | Script Adjustments | Tilts for open/tight/dominant/chaotic match types |
| 05 | Form Boosts | Multi-signal form quality (trend, momentum, consistency) |
| 06 | Odds Anchor | Bookmaker over_2.5 line as a calibration anchor |
| 07 | H2H Blend | Historical head-to-head goal pattern |
| 08 | League Goal Rate | League-character tilt (e.g., Serie A vs Bundesliga) |
| 09 | Tactical AI | Polymarket + manager tactical profile + matchup style |
| 10 | BSD Intelligence | xG table + manager stats + player performance data |
| 11 | Deep BSD Signals | Core player impact + referee tendency + metadata |
| 12 | Context Adjustments | Derby + travel distance + weather + referee strictness |
| 13 | Squad Management | Rotation risk + fatigue + rest days + cup schedule |
| 14 | Cap | League-aware floors and ceilings (prevents runaway xG) |
| 15 | Neural Adjustment | 2-hidden-layer MLP (12→16→8→2) learns residual corrections to statistical xG. 362 parameters, <0.1ms inference, pure TypeScript. |

Every magic number is a named, exported constant. Every layer has unit tests.

### Stage 3 — Intelligence Modules

After xG estimation, 7 football-intelligence modules fire (if their conditions are met):

| Module | Effect | Trigger |
|--------|--------|---------|
| 🔥 Derby | Dampens xG, boosts volatility + BTTS | `is_local_derby = true` |
| 👔 Manager Debut | +10/7/5/3% home win for first 4 home games | New manager ≤ 4 home games |
| 😴 Rest Day | -3/6/9% xG penalty for fatigued side | Rest differential ≥ 3 days |
| 🌧️ Weather × Style | Possession teams suffer in rain (-12%), pressers in heat (-8%) | Weather data available |
| 🏆 Late Season | Title/Europe/relegation fights boost xG; dead rubber dampens | Final 20% of season |
| ⚽ Set Piece | +5% xG when strict ref + team scores high from set pieces | Referee avg yellow > threshold |
| 📉 Lineup Decay | Decays lineup certainty by hours-to-kickoff | Always (0-30% decay range) |

Each module has a **kill switch** (`flags.ts`) and can be individually ablated to measure its Brier-score impact.

### Stage 4 — Market Selection

The engine builds **30+ market candidates** (1X2, Over/Under at multiple thresholds, BTTS, Double Chance, Draw No Bet, Asian Handicap, Correct Score), then:

1. **Scores** each candidate (model probability × edge × tactical fit)
2. **Prunes** candidates below quality thresholds
3. **Ranks** remaining candidates
4. **Selects** the single best pick — or **abstains** if nothing clears the bar

Output is tiered: **Gold** (highest confidence + edge), **Silver**, **Bronze**, or **Skip**.

> 📖 **Deep dive**: [docs/ENGINE.md](docs/ENGINE.md)

---

## 🔬 Backtest & Ablation

NeuralBet includes production-grade measurement infrastructure:

```bash
# Run backtest on last 30 days
npm run backtest

# Run backtest on last 90 days, specific markets
npm run backtest -- --days=90 --markets=over_25,btts_yes

# CI gate: fail if Brier score exceeds threshold
npm run backtest -- --max-brier=0.235

# Ablate a specific intelligence module
npm run ablate -- --module=derby --days=90 --require-derby
```

### Metrics Computed

| Metric | What | Target |
|--------|------|--------|
| **Brier Score** | Probability calibration (0 = perfect, 0.25 = coin flip) | < 0.22 |
| **Log Loss** | Penalizes confident wrong predictions | < 0.60 |
| **Hit Rate** | % of high-probability picks that won | > 55% |
| **ROI** | Return on 1-unit flat stake at bookmaker odds | > 0% |
| **Calibration** | 10-bucket reliability diagram (predicted vs actual) | Monotonic |

> 📖 **Details**: [docs/BACKTEST.md](docs/BACKTEST.md)

---

## 📡 API Reference

All endpoints use `GET` and return JSON. Base path: `/api/v5/`

| Endpoint | Description | Key Params |
|----------|-------------|------------|
| `/api/v5/fixtures` | Get fixtures for a date | `?date=2026-05-29` |
| `/api/v5/predict` | Get/generate prediction for a fixture | `?fixtureId=12345` |
| `/api/v5/match/[id]` | Full match detail with prediction | Path param |
| `/api/v5/sync` | Trigger data sync from BSD API | — |
| `/api/v5/sync-h2h` | Sync H2H historical matches | — |

> 📖 **Full reference**: [docs/API.md](docs/API.md)

---

## 🗂️ Project Structure

```
neuralbet/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/v5/                   # API routes (fixtures, predict, sync, match)
│   │   ├── matches/[id]/             # Match detail page
│   │   ├── page.tsx                  # Main app shell
│   │   └── layout.tsx                # Root layout
│   ├── components/                   # React components
│   │   ├── dashboard-v2.tsx          # Main dashboard
│   │   ├── predictions.tsx           # Predictions tab
│   │   ├── tip-card.tsx              # Tip display card
│   │   ├── premium-fixture-card.tsx  # Fixture card
│   │   ├── value-bets.tsx            # Value bets tab
│   │   ├── live-matches.tsx          # Live matches tab
│   │   ├── bankroll.tsx              # Bankroll tracker
│   │   └── ui/                       # Radix-based UI primitives
│   ├── lib/
│   │   ├── prediction-engine/v5/     # ⚡ THE ENGINE
│   │   │   ├── index.ts              # Orchestrator (927 LOC)
│   │   │   ├── types.ts              # All engine types
│   │   │   ├── feature-builder.ts    # Turso → FeatureVector
│   │   │   ├── xg/                   # 15-layer xG pipeline
│   │   │   │   ├── layers/01-15      # One file per layer
│   │   │   │   ├── shared.ts         # safeNum, clamp, globals
│   │   │   │   └── index.ts          # Orchestrator
│   │   │   ├── intelligence/         # 7 football-intelligence modules
│   │   │   │   ├── flags.ts          # Kill switches
│   │   │   │   ├── derby.ts
│   │   │   │   ├── manager-debut.ts
│   │   │   │   ├── rest-day.ts
│   │   │   │   ├── weather-style.ts
│   │   │   │   ├── late-season-motivation.ts
│   │   │   │   ├── set-piece-specialist.ts
│   │   │   │   └── lineup-decay.ts
│   │   │   ├── math/                 # Poisson + Calibration
│   │   │   ├── script/               # Match script classifier (5 categories)
│   │   │   ├── markets/              # 30+ market registry + selection
│   │   │   ├── adapters/             # Punter tip + value bet adapters
│   │   │   └── backtest/             # Brier scoring + ablation
│   │   ├── db/                       # Turso client, schema, sync engine
│   │   ├── types.ts                  # Frontend types
│   │   ├── api.ts                    # API helpers
│   │   └── store.ts                  # Zustand state
│   └── hooks/                        # Custom React hooks
├── scripts/                          # CLI tools
│   ├── backtest.ts                   # Run backtests
│   └── ablate.ts                     # Module ablation
├── docs/                             # Documentation
│   ├── ARCHITECTURE.md               # System design
│   ├── ENGINE.md                     # Engine deep dive
│   ├── INTELLIGENCE.md               # Intelligence modules
│   ├── BACKTEST.md                   # Backtest guide
│   └── API.md                        # API reference
├── .github/workflows/ci.yml          # CI: test + build + lint
└── package.json
```

---

## 🧪 Testing

489 tests across 25 test files, running in ~5 seconds:

```
 ✓ 36  Poisson distribution tests
 ✓ 20  Calibration tests
 ✓ 40  xG layer tests (per-layer contract pinning)
 ✓ 13  Integration tests (orchestrator + robustness)
 ✓ 42  Script classifier tests
 ✓ 72  Market selection tests
 ✓ 45  Adapter tests (punter tip + value bet)
 ✓ 47  Backtest scorer + outcome tests
 ✓ 107 Intelligence module tests (7 modules)
 ✓ 16  Ablation infrastructure tests
 ✓ 29  Misc (H2H sync, utils, feature builder)
```

Includes **property-based fuzzing** (100 random inputs per layer) and **robustness suites** (NaN, empty, malformed inputs).

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

---

## 🐛 Bugs Caught

The rebuild process systematically caught **10 silent production bugs** that were degrading predictions without any visible errors:

| # | Bug | Impact | Phase |
|---|-----|--------|-------|
| 1 | Script nudges to complement pairs silently overwritten | Wrong market probabilities | 1.2 |
| 2 | `over15` cap undone by monotonicity raise | Impossible probability values | 1.2 |
| 3 | Sanity dampener violated monotonicity | O1.5 < O2.5 possible | 1.2 |
| 4 | NaN propagation via `??` (doesn't catch NaN) | Silent NaN xG in production | 1.3 |
| 5 | Lossy cache in `/api/v5/predict` | Script/confidence lost on cache hit | 2.1.1 |
| 6 | Broken `impliedProbability` import | Bookmaker blend completely dead | 2.x |
| 7 | `.gitignore` rule swallowed `sync-h2h.ts` | H2H route missing on deploy | 2.5.1 |
| 8 | Managers never loaded in prediction context | Manager intelligence always no-op | 2.6 |
| 9 | Two competing `FeatureVector` interfaces | Intelligence module fields silently stripped | 3 |
| 10 | Referee data never queried | Set-piece module always no-op | 3 |

Each bug was found by tests or strict TypeScript, documented, and fixed.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router) |
| **Language** | TypeScript 5 (strict mode) |
| **Database** | [Turso](https://turso.tech) (libSQL — edge SQLite) |
| **Styling** | Tailwind CSS 4 + custom glassmorphism system |
| **Animation** | Framer Motion |
| **State** | Zustand |
| **Data Fetching** | TanStack React Query |
| **UI Primitives** | Radix UI |
| **Charts** | Recharts |
| **Testing** | Vitest 4 + fast-check (property-based) |
| **CI** | GitHub Actions (test → strict build → lint) |
| **Deployment** | Vercel |
| **Data Source** | BSD API v2 + Polymarket |

---

## 🚀 Deployment

### Vercel (Recommended)

1. Fork this repo
2. Connect to [Vercel](https://vercel.com)
3. Add environment variables (see `.env.example`)
4. Deploy — that's it

### Self-Hosted

```bash
npm run build
npm start -- -p 3000
```

A `Caddyfile` is included for reverse proxy setups.

---

## 📍 Roadmap

- [x] V5 Phantom Engine (14-layer xG + Poisson + calibration)
- [x] 7 Intelligence Modules (flag-gated + ablation-ready)
- [x] 30+ Market Coverage with abstain logic
- [x] Backtest + Ablation Infrastructure
- [x] CI Pipeline (test + strict build + lint)
- [x] 467 Tests (unit + integration + property-based)
- [ ] UI Overhaul (Phase 4) — intelligence surfacing, redesigned cards
- [x] Neural Network Layer 15 (pure TS MLP, 362 parameters, <0.1ms inference)
- [ ] Published Backtest Results (Brier scores, calibration curves)
- [x] PWA Support (manifest, app icons, installable)
- [ ] Live In-Play Engine (WebSocket-based re-prediction)
- [ ] Admin Panel (backtest dashboard, sync status, calibration plots)

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

- [BSD API](https://bsportsdata.com) — football data provider
- [Turso](https://turso.tech) — edge database
- [Vercel](https://vercel.com) — deployment platform
- Dixon & Coles (1997) — Poisson model foundation
- Kelly (1956) — optimal stake sizing criterion

---

<p align="center">
  <strong>Built with obsessive precision by <a href="https://github.com/Heisdawrld">@Heisdawrld</a></strong>
</p>
<p align="center">
  <sub>If this engine helps you, star the repo ⭐</sub>
</p>
