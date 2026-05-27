---
Task ID: 1
Agent: Main Agent
Task: Rebuild NeuralBet prediction engine as v4 "The Sniper" — one tip per match

Work Log:
- Analyzed existing v3 engine (8 models, 15+ markets, multiple value bets per match)
- User requested philosophy change: "analyze everything, give just one tip — the best tip — or skip"
- Created v4 types (PunterTipV4, TheTip, TipQuality, MatchAnalysis with H2H/Form/Manager/Gameplay/League/Situation)
- Built v4 engine that: (1) reads all data from Turso, (2) runs 8 statistical models, (3) computes all market probabilities, (4) evaluates every possible bet, (5) ranks by risk-reward score, (6) outputs THE ONE best tip or SKIP
- Fixed gameplay.expectedGoals bug (was using season totals instead of per-match xG)
- Fixed Asian HC over-dominance (penalized candidates without odds by 0.3x)
- Created v4 API route at /api/v4/predictions
- Created TipCard component (clean, surgical, one tip per card with expandable analysis)
- Rebuilt Predictions component to use v4 API with quality filters (Gold/Silver/Bronze/Skip)
- Updated Dashboard to use v4 API and show Gold/Silver tips
- Updated frontend types and API client for v4 data flow

Stage Summary:
- v4 engine live at /api/v4/predictions — tested with 100 matches
- Results: 54 Gold tips, 3 Silver, 5 Bronze, 38 Skipped
- Gold tips all have real odds, real edges (5-29%), and real reasoning
- Skip reasons: "Not enough data" (20x), "No odds available" (14x), "Edge too small" (3x), "Dead rubber" (1x)
- Architecture: BSD API → Turso DB (via sync) → v4 Engine → One Tip per match
