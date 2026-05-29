# Engine Deep Dive — V5 Phantom Engine

> Complete technical reference for NeuralBet's prediction engine.

---

## Pipeline Overview

```
FeatureVector (100+ fields)
    │
    ▼
[14-Layer xG Pipeline] → homeXG, awayXG
    │
    ▼
[7 Intelligence Modules] → adjusted xG
    │
    ▼
[Dixon-Coles Poisson] → 10×10 score matrix
    │
    ▼
[Market Probabilities] → 30+ raw probabilities
    │
    ▼
[Calibration] → calibrated probabilities
    │
    ▼
[Market Selection] → best pick or ABSTAIN
    │
    ▼
[Tip Adapter] → Gold / Silver / Bronze / Skip
```

---

## The 14-Layer xG Pipeline

Located in `src/lib/prediction-engine/v5/xg/layers/`. Each layer is a pure function that takes the current xG estimate and adjusts it.

### Layer 01 — Base xG (`01-base.ts`)

Computes base expected goals from team attacking/defensive strength:

```
homeXG = homeAvgScored × (awayAvgConceded / leagueAvg)
awayXG = awayAvgScored × (homeAvgConceded / leagueAvg)
```

Key constants:
- `HOME_ADVANTAGE_FACTOR = 1.08` — home teams score ~8% more
- `LEAGUE_AVG_FALLBACK = 1.30` — used when league data is missing

### Layer 02 — Thin Data Regression (`02-thin-data-regression.ts`)

When a team has fewer than `MIN_MATCHES_FULL_TRUST` matches (default: 8), regresses toward league average. Prevents overreacting to 2-3 results.

```
weight = min(matchesPlayed / MIN_MATCHES_FULL_TRUST, 1.0)
adjustedXG = weight × teamXG + (1 - weight) × leagueAvgXG
```

### Layer 03 — Venue Anchoring (`03-venue-anchoring.ts`)

Blends overall averages with venue-specific splits:

```
homeXG = VENUE_WEIGHT × homeAtHomeGoals + (1 - VENUE_WEIGHT) × homeOverallGoals
```

`VENUE_WEIGHT = 0.35` — venue splits contribute 35% of the signal.

### Layer 04 — Script Adjustments (`04-script-adjustments.ts`)

Adjusts xG based on the match script classification:

| Script | Home xG Multiplier | Away xG Multiplier |
|--------|-------------------|-------------------|
| `dominant_home_pressure` | 1.05–1.12 | 0.90–0.95 |
| `dominant_away_pressure` | 0.90–0.95 | 1.05–1.12 |
| `open_end_to_end` | 1.06–1.10 | 1.06–1.10 |
| `tight_low_event` | 0.88–0.94 | 0.88–0.94 |
| `chaotic_unreliable` | dampened toward 1.15 each | dampened toward 1.15 each |

### Layer 05 — Form Boosts (`05-form-boosts.ts`)

Multi-signal form quality: recent results, trend direction, goal-scoring consistency. Boosts/dampens xG by up to ±15%.

**Bug caught here**: `fv.leagueAvgGoalsPerTeam ?? FALLBACK` — `??` doesn't catch NaN. Fixed by using `safeNum()` everywhere.

### Layer 06 — Odds Anchor (`06-odds-anchor.ts`)

Blends the engine's xG-derived over/under probabilities with the bookmaker's over_2.5 line:

```
blendedOver25 = ENGINE_WEIGHT × engineOver25 + ODDS_WEIGHT × impliedOver25
```

`ODDS_WEIGHT = 0.25` — bookmakers are good at totals; we respect that.

### Layer 07 — H2H Blend (`07-h2h-blend.ts`)

When H2H data is available (≥3 meetings), blends historical goal patterns:

```
h2hInfluence = min(h2hMatches / H2H_FULL_TRUST, 1.0) × H2H_MAX_WEIGHT
totalXG = (1 - h2hInfluence) × modelXG + h2hInfluence × h2hAvgGoals
```

`H2H_MAX_WEIGHT = 0.15` — H2H is a signal, not a oracle.

### Layer 08 — League Goal Rate (`08-league-goal-rate.ts`)

Tilts xG based on the league's scoring character:

- Bundesliga (~3.1 goals/game) → slight upward tilt
- Serie A (~2.5 goals/game) → slight downward tilt
- Caps the adjustment at ±10%

### Layer 09 — Tactical AI (`09-tactical-ai.ts`)

Integrates:
- **Polymarket odds** (prediction market signal)
- **Manager tactical profiles** (attacking vs defensive style)
- **Tactical matchup** (how styles interact)

### Layer 10 — BSD Intelligence (`10-bsd-intelligence.ts`)

Uses xG table data from BSD:
- Team xGF/xGA per game from standings
- Manager historical over_2.5% and BTTS%
- Player performance stats (when available)

### Layer 11 — Deep BSD Signals (`11-deep-bsd-signals.ts`)

Core player impact, referee tendency (cards/penalties/goals per game), and event metadata.

### Layer 12 — Context Adjustments (`12-context-adjustments.ts`)

Derby flags, travel distance (long away trips), weather conditions, referee strictness. Each adjustment is capped and documented.

### Layer 13 — Squad Management (`13-squad-management.ts`)

- Rotation risk (cup schedule, midweek games)
- Fatigue (minutes played recently)
- Rest days (differential between teams)
- Cup competition context (already qualified/eliminated)

### Layer 14 — Cap (`14-cap.ts`)

League-aware floors and ceilings prevent runaway xG estimates:

| League Tier | Min Total xG | Max Total xG |
|-------------|-------------|-------------|
| Top 5 | 1.4 | 5.0 |
| Mid tier | 1.2 | 4.5 |
| Lower | 1.0 | 4.0 |

---

## Intelligence Modules

Located in `src/lib/prediction-engine/v5/intelligence/`. All are flag-gated via `flags.ts`.

### How Flag Gating Works

```typescript
import { isIntelligenceEnabled } from './flags';

export function applyDerbyToProbs(probs, context) {
  if (!isIntelligenceEnabled('derby')) return probs;
  // ... apply derby adjustments
}
```

To disable a module:
```typescript
import { setIntelligenceFlags } from './flags';
setIntelligenceFlags({ derby: false });
```

For testing (auto-restores):
```typescript
import { withIntelligenceFlags } from './flags';
const result = await withIntelligenceFlags({ derby: false }, async () => {
  return runBacktest(options);
});
```

### Module Details

See [INTELLIGENCE.md](INTELLIGENCE.md) for detailed documentation of each module.

---

## Match Script Classifier

Located in `src/lib/prediction-engine/v5/script/`. Classifies each fixture into one of 5 archetypes:

| Script | When | Effect |
|--------|------|--------|
| `dominant_home_pressure` | Home team far superior in form + standings + xG | Boost home, dampen away |
| `dominant_away_pressure` | Away team far superior (rare) | Boost away, dampen home |
| `open_end_to_end` | Both teams attacking, weak defenses | Boost total goals |
| `tight_low_event` | Both teams defensive, low-scoring histories | Dampen total goals |
| `chaotic_unreliable` | Data contradicts itself, low confidence | Dampen everything, hedge |

Each category lives in its own file under `script/categories/` with named constants.

---

## Poisson Model

Located in `src/lib/prediction-engine/v5/math/poisson.ts`.

Uses Dixon-Coles adjusted Poisson distribution:
1. Build a 10×10 score matrix (0-0 through 9-9)
2. Each cell = P(homeScore=i, awayScore=j) with low-score correlation correction
3. Derive all market probabilities by summing relevant cells

Example:
```
P(Over 2.5) = Σ P(i,j) where i+j > 2
P(BTTS) = Σ P(i,j) where i>0 AND j>0
P(Correct Score 1-1) = P(1,1)
```

---

## Market Selection

Located in `src/lib/prediction-engine/v5/markets/`. 7 modules:

1. **registry.ts** — Defines 30+ markets with metadata
2. **build-candidates.ts** — Creates MarketCandidate for each market
3. **implied-odds.ts** — Converts bookmaker odds to probabilities
4. **score.ts** — Scores each candidate: `modelProb × edge × tacticalFit`
5. **prune.ts** — Removes candidates below quality thresholds
6. **rank.ts** — Sorts by final score
7. **select.ts** — Picks the single best or returns ABSTAIN

### Abstain Logic

The engine refuses to tip when:
- No candidate exceeds `MIN_SELECTION_SCORE`
- The best candidate's edge is below `MIN_EDGE_THRESHOLD`
- Data completeness is below `MIN_DATA_COMPLETENESS`
- The match script is `chaotic_unreliable` with high volatility

This is a feature, not a bug. Most fixtures don't have enough edge to justify a tip.

---

## Tip Quality Tiers

The `punter-tip` adapter converts engine output to quality tiers:

| Tier | Criteria | Stake Recommendation |
|------|----------|---------------------|
| 🥇 **Gold** | Score ≥ 0.75, edge ≥ 8%, model prob ≥ 65%, non-chaotic script | 3-5% bankroll |
| 🥈 **Silver** | Score ≥ 0.55, edge ≥ 4%, model prob ≥ 55% | 2-3% bankroll |
| 🥉 **Bronze** | Score ≥ 0.35, edge ≥ 2%, model prob ≥ 45% | 1-2% bankroll |
| ⏭️ **Skip** | Below all thresholds, or engine abstains | No bet |

---

## Testing Philosophy

Every module has tests. Test types:

1. **Unit tests** — Each xG layer, each intelligence module, each market scorer
2. **Contract pinning** — Given known inputs, outputs must match exactly
3. **Property-based fuzzing** — 100 random inputs, verify axioms hold (e.g., probabilities sum to 1)
4. **Robustness** — NaN inputs, empty arrays, missing fields → no crash
5. **Integration** — Full pipeline end-to-end with mock data
