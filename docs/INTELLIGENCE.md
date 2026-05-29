# Intelligence Modules — NeuralBet

> Detailed documentation for all 7 football-intelligence modules.

---

## Overview

Intelligence modules are **domain-specific adjustments** that fire after the base xG pipeline. Each module captures a football insight that pure statistics miss.

All modules are:
- **Flag-gated** — can be enabled/disabled at runtime via `flags.ts`
- **Ablation-ready** — can be measured for Brier-score impact via `npm run ablate`
- **Fail-safe** — if input data is missing, the module no-ops (identity function)
- **Tested** — 107 tests across all 7 modules

---

## Module 1: Derby Intelligence

**File**: `intelligence/derby.ts`
**Flag**: `derby`
**Tests**: `__tests__/derby.test.ts`

### What It Does

Local derbies are statistically different from regular fixtures:
- Lower goal totals (tension dampens attacking play)
- Higher volatility (emotional, unpredictable)
- Higher BTTS rate (both teams motivated, open play in bursts)

### How It Works

1. **Pre-step** (`applyDerbyToVolatility`): Boosts the feature vector's volatility score when `is_local_derby = true`
2. **Post-step** (`applyDerbyToProbs`): After Poisson/calibration:
   - Dampens total xG by up to 8% (derbies are tighter)
   - Flattens 1X2 probabilities toward 33/33/33 (upsets more likely)
   - Boosts BTTS probability by up to 5%

### Key Constants

```
DERBY_XG_DAMPEN = 0.92        // -8% total xG
DERBY_FLATTEN_FACTOR = 0.12   // Pull 12% toward equal odds
DERBY_BTTS_BOOST = 0.05       // +5% BTTS
```

### Research Basis

- Pollard & Pollard (2005): Home advantage is significantly reduced in derbies
- FiveThirtyEight analysis: Derby goal totals are 0.3 lower than baseline

---

## Module 2: Manager Debut Bonus

**File**: `intelligence/manager-debut.ts`
**Flag**: `manager_debut`
**Tests**: `__tests__/manager-debut.test.ts`

### What It Does

New managers get a "bounce" effect in their first few home games — increased motivation, tactical surprise, crowd energy.

### How It Works

Checks `homeManagerMatchesAtClub` and `awayManagerMatchesAtClub`. If a manager has ≤4 home games at the club:

| Home Game # | Home Win Boost |
|-------------|---------------|
| 1st | +10% |
| 2nd | +7% |
| 3rd | +5% |
| 4th | +3% |
| 5th+ | No effect |

Applied as a multiplicative boost to `homeWin` probability, with corresponding dampening of `draw` and `awayWin`.

### Research Basis

- Audas, Dobson & Goddard (2002): New manager effect is +10% win rate in first 3 home games
- The Athletic (2023): Analysis of 500+ managerial changes confirms the bounce

---

## Module 3: Rest Day Asymmetry

**File**: `intelligence/rest-day.ts`
**Flag**: `rest_day`
**Tests**: `__tests__/rest-day.test.ts`

### What It Does

When one team has significantly more rest days than the other, the fatigued team's xG is penalized.

### How It Works

Computes `restDifferential = abs(homeRestDays - awayRestDays)`:

| Differential | xG Penalty (fatigued team) |
|-------------|---------------------------|
| 3 days | -3% |
| 4 days | -6% |
| 5+ days | -9% |
| < 3 days | No effect |

Applied to the fatigued team's xG only. The rested team is not boosted (asymmetric — fatigue hurts more than rest helps).

### Research Basis

- Lago-Peñas (2009): Teams with 2+ fewer rest days concede 15% more goals
- UEFA studies: Champions League midweek → weekend league performance drop

---

## Module 4: Weather × Playing Style

**File**: `intelligence/weather-style.ts`
**Flag**: `weather_style`
**Tests**: `__tests__/weather-style.test.ts`

### What It Does

Weather interacts differently with playing styles:
- **Possession teams** suffer in heavy rain (ball doesn't stick, passing breaks down)
- **Pressing teams** suffer in extreme heat (high-intensity pressing becomes unsustainable)
- **Wind** affects both teams but penalizes long-ball strategies more

### How It Works

Uses `weatherCode`, `weatherWindSpeedKmh`, `weatherTemperatureC` from the feature vector, combined with manager tactical style data.

| Condition | Style Affected | xG Impact |
|-----------|---------------|-----------|
| Heavy rain (code 500-599) | Possession-based | -12% |
| Extreme heat (>32°C) | High-pressing | -8% |
| Strong wind (>40 km/h) | Long-ball | -6% |
| Snow/ice (code 600-699) | Both | -10% |

Effects compound multiplicatively when multiple conditions apply.

### Research Basis

- Gómez et al. (2013): Rain reduces passing accuracy by 4-7%
- Nassis et al. (2015): Heat above 30°C reduces high-intensity sprints by 15%

---

## Module 5: Late-Season Motivation

**File**: `intelligence/late-season-motivation.ts`
**Flag**: `late_season`
**Tests**: `__tests__/late-season-motivation.test.ts`

### What It Does

In the final 20% of a season, team motivation varies dramatically:
- **Title races**: Both contenders get an xG boost
- **European qualification battles**: Moderate boost
- **Relegation fights**: Significant boost (survival instinct)
- **Dead rubbers**: Teams with nothing to play for get dampened

### How It Works

Only fires when `eventMatchday / leagueTotalMatchdays > 0.80`.

| Situation | xG Adjustment |
|-----------|--------------|
| Title contender (top 2, ≤6 pts from 1st) | +7% |
| Europe race (3rd-7th, ≤4 pts from cutoff) | +5% |
| Relegation fight (bottom 3, ≤4 pts from safety) | +7% |
| Dead rubber (mid-table, >10 pts from any prize) | -5% to -8% |

### Current Limitation

Requires `eventMatchday` and `leagueTotalMatchdays` to be populated. Some leagues don't provide round numbers → module no-ops fail-safe.

---

## Module 6: Set-Piece Specialist

**File**: `intelligence/set-piece-specialist.ts`
**Flag**: `set_piece`
**Tests**: `__tests__/set-piece-specialist.test.ts`

### What It Does

When a strict referee is assigned to a match featuring a team that scores heavily from set pieces, xG is boosted.

### How It Works

Conditions (all must be true):
1. Referee's avg yellows per match > `STRICT_REFEREE_THRESHOLD` (3.5)
2. Team's set-piece goal % > league average + `SET_PIECE_EDGE_THRESHOLD`

When both conditions met: **+5% xG** for the set-piece-strong team.

### Current Limitation

Uses referee yellow-card rate as a proxy for "strict ref = more fouls = more set pieces". True set-piece conversion rates require BSD player-stats sync (planned for future phase).

---

## Module 7: Lineup Decay

**File**: `intelligence/lineup-decay.ts`
**Flag**: `lineup_decay`
**Tests**: `__tests__/lineup-decay.test.ts`

### What It Does

Lineup data becomes less certain the further out from kick-off a prediction is made. This module decays the lineup certainty score based on hours to kick-off, pushing the engine toward humility for early predictions.

### How It Works

```
decayFactor = clamp(hoursToKickoff / MAX_DECAY_HOURS, 0, 1)
adjustedCertainty = baseCertainty × (1 - decayFactor × MAX_DECAY_RATE)
```

| Hours to Kick-off | Certainty Decay |
|-------------------|----------------|
| 0-1 hours | 0% (lineup likely confirmed) |
| 6 hours | ~10% |
| 24 hours | ~20% |
| 48+ hours | ~30% (maximum) |

### Effect on Engine

Lower lineup certainty → engine is less confident in predictions that depend on specific player matchups → slightly dampened final scores → more likely to abstain or downgrade tip quality.

---

## Adding a New Module

1. Create `intelligence/your-module.ts` with the adjustment function
2. Add a flag to `flags.ts` (default: ON)
3. Gate the function: `if (!isIntelligenceEnabled('your_module')) return input;`
4. Write tests in `__tests__/your-module.test.ts`
5. Wire into the pipeline in `index.ts` (at the appropriate stage)
6. Run ablation: `npm run ablate -- --module=your_module --days=90`
7. If Brier score improves → ship. If it regresses → revert.

---

## Ablation: Proving Modules Work

Every module can be individually ablated:

```bash
# Test if derby module improves predictions
npm run ablate -- --module=derby --days=90 --require-derby

# Test weather module on all fixtures
npm run ablate -- --module=weather_style --days=60

# Output:
# Module: derby
# Baseline Brier:  0.2183
# With Module:     0.2147
# Delta:          -0.0036 (IMPROVES)
# Verdict:         ✅ KEEP
```

The ablation system:
1. Runs the backtest with the module **ON** (default)
2. Runs the backtest with the module **OFF** (via `withIntelligenceFlags`)
3. Compares Brier scores
4. Verdict: `IMPROVES` (delta < -0.001) / `REGRESSES` (delta > 0.001) / `NEUTRAL`
