# Backtest & Ablation Guide — NeuralBet

> How to measure, validate, and improve the engine's accuracy.

---

## Overview

NeuralBet includes a production-grade backtesting system that replays the V5 engine against finished matches and measures prediction quality. This is how we prove the engine works — not with anecdotes, but with calibrated metrics.

---

## Running a Backtest

```bash
# Basic: last 30 days, all markets
npm run backtest

# Extended window
npm run backtest -- --days=90

# Specific markets only
npm run backtest -- --markets=over_25,btts_yes,home_win

# Specific date range
npm run backtest -- --since=2026-01-01

# Force fresh predictions (bypass cache)
npm run backtest -- --no-cache

# CI gate: fail if Brier exceeds threshold
npm run backtest -- --max-brier=0.235

# Machine-readable output
npm run backtest -- --json
```

---

## Metrics

### Brier Score

The primary accuracy metric. Measures calibration — how close predicted probabilities are to actual outcomes.

```
Brier = (1/N) × Σ (predicted_probability - actual_outcome)²
```

| Score | Meaning |
|-------|---------|
| 0.000 | Perfect predictions |
| 0.100 | Excellent |
| 0.180 | Good |
| 0.220 | Decent |
| 0.250 | Coin flip (no skill) |
| > 0.250 | Worse than guessing |

**Target**: < 0.220 across all markets.

### Log Loss

Penalizes confident wrong predictions more heavily than Brier:

```
LogLoss = -(1/N) × Σ [y × log(p) + (1-y) × log(1-p)]
```

| Score | Meaning |
|-------|---------|
| 0.000 | Perfect |
| 0.400 | Good |
| 0.600 | Decent |
| 0.693 | Coin flip |
| > 0.693 | Worse than guessing |

### Hit Rate

Percentage of the engine's high-probability picks that actually won:

```
HitRate = correct_predictions / total_predictions
```

Measured only for predictions where model probability > 55%.

### ROI (Return on Investment)

Simulated return on 1-unit flat stake at bookmaker odds:

```
ROI = (total_returns - total_staked) / total_staked × 100%
```

Positive ROI = profitable. Most tipsters are negative.

### Calibration Buckets

10-bucket reliability diagram:

```
Bucket 0-10%:  Predicted avg: 0.06  |  Actual rate: 0.05  ✅
Bucket 10-20%: Predicted avg: 0.15  |  Actual rate: 0.14  ✅
Bucket 20-30%: Predicted avg: 0.25  |  Actual rate: 0.28  ⚠️ slight under-prediction
...
Bucket 90-100%: Predicted avg: 0.93 |  Actual rate: 0.91  ✅
```

Perfect calibration = predicted avg equals actual rate in every bucket. The diagonal on a reliability diagram.

---

## Ablation Testing

Ablation isolates the impact of a single intelligence module by running the backtest twice — once with the module ON, once with it OFF — and comparing Brier scores.

```bash
# Ablate the derby module (only on derby fixtures)
npm run ablate -- --module=derby --days=90 --require-derby

# Ablate weather module (all fixtures)
npm run ablate -- --module=weather_style --days=60

# Ablate with specific league
npm run ablate -- --module=rest_day --days=90 --leagueId=1
```

### Output

```
╔══════════════════════════════════════════╗
║         MODULE ABLATION: derby          ║
╠══════════════════════════════════════════╣
║ Fixtures scored:    47                   ║
║ Window:             90 days              ║
║                                          ║
║ Brier (module ON):  0.2147              ║
║ Brier (module OFF): 0.2183              ║
║ Delta:             -0.0036              ║
║                                          ║
║ Verdict:  ✅ IMPROVES                    ║
╚══════════════════════════════════════════╝
```

### Verdict Thresholds

| Delta | Verdict | Action |
|-------|---------|--------|
| < -0.001 | `IMPROVES` | Keep the module |
| -0.001 to +0.001 | `NEUTRAL` | Keep (no harm) or review cost |
| > +0.001 | `REGRESSES` | Revert the module |

### CI Integration

```bash
# In CI: exit non-zero if module regresses
npm run ablate -- --module=derby --days=90
# Exit code: 0 = IMPROVES/NEUTRAL, 1 = REGRESSES
```

---

## Market Outcome Mapping

The backtest system maps final scores to outcomes for every market:

```typescript
marketOutcomesFromScore(homeScore: 2, awayScore: 1)
// →
{
  home_win: 1,      // ✅ home won
  draw: 0,
  away_win: 0,
  over_15: 1,       // ✅ 3 goals > 1.5
  over_25: 1,       // ✅ 3 goals > 2.5
  over_35: 0,       // ❌ 3 goals < 3.5
  btts_yes: 1,      // ✅ both scored
  btts_no: 0,
  // ... 30+ markets
}
```

Invariants enforced in tests:
- `over_K + under_K = 1` for every K
- `btts_yes + btts_no = 1`
- `home_win + draw + away_win = 1`
- All outcomes are 0 or 1

---

## Interpreting Results

### Good Signs

- Brier < 0.22 overall
- Calibration buckets are monotonic (higher predicted prob → higher actual rate)
- ROI > 0% on Gold-tier tips
- Hit rate > 55% on high-confidence picks

### Warning Signs

- Brier > 0.25 (worse than coin flip)
- Calibration shows systematic bias (e.g., always over-predicts BTTS)
- ROI deeply negative
- Hit rate < 50% on high-confidence picks

### What to Do About It

1. **High Brier on specific market**: Add market-specific calibration layer
2. **Systematic over-prediction**: Check if a layer is too aggressive (reduce its constant)
3. **Under-prediction in high-scoring leagues**: Check Layer 08 (league goal rate) constants
4. **Module ablation shows REGRESSES**: Disable the module, investigate the logic

---

## Backtest Infrastructure

### Files

```
src/lib/prediction-engine/v5/backtest/
├── scorers.ts     — brierScore, logLoss, hitRate, roi, calibrationBuckets
├── outcomes.ts    — marketOutcomesFromScore (30+ markets)
├── runner.ts      — runBacktest(opts) — replays engine on finished matches
├── compare.ts     — ablateModule(opts) — ON vs OFF comparison
└── index.ts       — barrel export
```

### Tests

```
__tests__/
├── scorers.test.ts   — 21 tests: every metric, edge cases, property-based fuzz
├── outcomes.test.ts  — 21 tests: every market × dozens of scorelines
└── compare.test.ts   — 5 tests: verdict classification, output format
```
