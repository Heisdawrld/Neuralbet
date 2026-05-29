# NeuralBet — Project State

> Single source of truth across sessions. Updated end of every working session.

## Current Snapshot — 2026-05-29 (Phase 1 in flight — checkpoint after 1.2)

**Status**: Branch `phase-1-engine-intelligence` has 2 clean commits ready for review/merge. Engine math foundation extracted + fully tested. **3 silent production bugs caught and fixed by the new test suite.**
**Live URL**: https://neuralbet-lovat.vercel.app (still on `main` — unchanged)
**Canon engine**: V5 Phantom (`src/lib/prediction-engine/v5/`)
**Tests**: 56 passing in 0.55s. Covers Poisson + DC + market derivation + calibration end-to-end.

## What ships when this branch merges

### Phase 1.1 — Poisson extracted (commit `4cd89a0`)
- New module: `src/lib/prediction-engine/v5/math/poisson.ts` (fully documented)
- 36 tests: numerical sanity, score-matrix invariants, market identities, golden fixtures, 200-run property fuzz
- v5/index.ts: 1,983 → 1,879 LOC

### Phase 1.2 — Calibration extracted + 3 bugs fixed (commit `b8cc487`)
- New module: `src/lib/prediction-engine/v5/math/calibration.ts` (5 named single-purpose functions, every magic number lifted to named constants)
- 20 tests: blend mechanics, script nudges, identity enforcement, robustness, 300-run property fuzz
- v5/index.ts: 1,879 → 1,760 LOC
- ScriptOutput type promoted to types.ts (canonical home)

### Bugs the test suite caught
1. **Script nudges to complement pairs were being silently erased.** `tight_low_event` was setting `bttsNo += 0.04` but `enforceComplements` ran afterwards and overwrote it via `bttsNo = 1 - bttsYes_OLD`. Same for over25, over15, over35 nudges. **The script intelligence was partially neutralised in production.** Fixed by atomic complement updates.
2. **`over15` hard cap could be undone by monotonicity raise** when over25 was ≥ 0.90. Fixed by `effectiveCap = max(0.90, over25)`.
3. **Sanity dampener could violate monotonicity** when over25 was just under 0.40. Fixed by re-running monotonicity after sanity.

## What's in the test suite now

| Module | Tests | What's locked |
|---|---|---|
| poisson.ts | 36 | Factorial · Poisson PMF identities · DC normalisation · DC pulls draws up · over+under=1 · 1X2 sum=1 · monotonic overs · BTTS sum=1 · handicaps partition · all probs in [0,1] · 3 golden fixtures · 200-run fuzz |
| calibration.ts | 20 | Blend weights exact · script nudges direction · complement preservation under nudge · 1X2 rebalance · hard cap respects monotonicity · sanity-monotonicity ordering · sparse input survival · null impliedOdds survival · input immutability · 300-run fuzz |

**Total: 56 tests, 0.55s runtime.** Suitable for pre-commit hook.

## Phase 1 queue (remaining)

### Phase 1.3 — Extract estimateExpectedGoals + its 12 layers (next session)
- Each of the 12 xG adjustment layers becomes its own pure function in `src/lib/prediction-engine/v5/xg/layers/`
- Per-layer unit tests
- Single orchestrator `composeXg.ts` that runs the pipeline
- **This unlocks tunability**: each layer's coefficient becomes a tested, documented, named constant. Backtest harness can ablate layers one-by-one.

### Phase 1.4 — Extract classifyMatchScript
- Same treatment: pure module, tests pinning the classification behaviour on a small fixture corpus

### Phase 1.5 — Extract market scoring + pruning + selection
- These are decision-layer functions. Heavy logic. Need scenario-based tests, not just probability tests.

### Phase 1.6 — Migrate `/api/match/[id]` from v4 → v5
- Per the original Phase 1 plan. Now backed by tested engine = safe migration.

### Phase 1.7 — Backtest harness
- `npm run backtest` replays N days of historical fixtures, outputs Brier/log-loss/ROI per market. Gates every engine PR.

## Phase 2+ (after Phase 1 stable) — Football Intelligence

This is where NeuralBet stops being a statistics engine and starts being a **football intelligence**. Each module is a small typed function with its own backtest justification.

Planned modules (ordered by ROI):
1. **Derby intensity** — when home + away are local rivals, dampen goals 10-15%, raise card market expectation
2. **Manager debut bonus** — new manager → +10% home win rate in first 3 games (well-documented effect)
3. **Rest day asymmetry** — 4+ rest day advantage → +0.15 xG to advantaged side
4. **Late-season motivation** — teams already qualified for Europe rotate (engine should detect via standings + matchday); teams fighting relegation overperform xG
5. **Weather × playing style** — rain on wet pitch dampens passing teams more than direct teams (requires manager team_style + weather data — both available in BSD v2)
6. **Set-piece specialists** — teams with elite dead-ball strikers + strict referees get +0.2 xG boost
7. **Lineup confidence decay** — predicted lineup is less reliable the further from kickoff; engine should factor this into volatility

Each ships as: pure module + unit tests + backtest result showing Brier improvement. **No module merges without a measurable Brier improvement.**

## What you need to do to merge what's already done

```bash
git checkout main
git merge phase-1-engine-intelligence
git push origin main
# Vercel auto-deploys. The fixes go live with zero behaviour change for
# users EXCEPT the 3 bug fixes (script nudges now actually take effect).
```

## Architectural decisions logged this session
- **Magic numbers are forbidden.** Every coefficient is a named, commented constant in a single source-of-truth file per module.
- **Property-based testing is mandatory** for any function with numeric inputs and probability outputs. 200-300 random inputs per release.
- **Pipeline order matters.** Document it. Test it. The 3 bugs caught today were all pipeline-order bugs.
- **"10× better" gate**: every Phase 2 intelligence module must show a measurable Brier-score improvement on the backtest before it ships. No vibes.

## Session log
| Date | Session focus | Outcome |
|---|---|---|
| 2026-05-29 #1 | Phase 0 — Consolidation | 68% disk reduction, canon engine locked in |
| 2026-05-29 #2 | Phase 1.1 — Extract Poisson math + tests | 36 tests, foundation locked |
| 2026-05-29 #3 | Phase 1.2 — Extract calibration + tests + bug fixes | 20 more tests, 3 silent production bugs caught and fixed |
