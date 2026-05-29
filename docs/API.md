# API Reference — NeuralBet

> Complete documentation for all API endpoints.

---

## Base URL

```
Production:  https://neuralbet-lovat.vercel.app/api
Development: http://localhost:3000/api
```

All endpoints return JSON. All use `GET` method. All are `force-dynamic` (no static caching at the edge).

---

## V5 Endpoints

### `GET /api/v5/fixtures`

Get all fixtures for a given date.

**Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `date` | string | today | Date in `YYYY-MM-DD` format |

**Response**:

```json
{
  "fixtures": [
    {
      "id": 12345,
      "leagueId": 1,
      "leagueName": "Premier League",
      "leagueLogoUrl": "https://...",
      "homeTeam": "Arsenal",
      "awayTeam": "Chelsea",
      "homeTeamId": 100,
      "awayTeamId": 200,
      "homeTeamLogoUrl": "https://...",
      "awayTeamLogoUrl": "https://...",
      "eventDate": "2026-05-29T15:00:00Z",
      "status": "notstarted",
      "homeScore": null,
      "awayScore": null,
      "currentMinute": null,
      "isLocalDerby": true,
      "roundName": "Matchday 38",
      "prediction": {
        "bestPick": {
          "selection": "Over 2.5 Goals",
          "modelProbability": 0.68,
          "edge": 0.12,
          "riskLevel": "LOW"
        },
        "confidence": "high",
        "script": "open_end_to_end"
      }
    }
  ]
}
```

---

### `GET /api/v5/predict`

Get or generate a prediction for a specific fixture.

**Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `fixtureId` | number | ✅ | BSD event ID |

**Caching**: Returns cached prediction if < 6 hours old. Otherwise runs engine fresh.

**Response**:

```json
{
  "fixtureId": 12345,
  "homeTeam": "Arsenal",
  "awayTeam": "Chelsea",
  "expectedGoals": {
    "home": 1.72,
    "away": 1.15,
    "total": 2.87
  },
  "bestPick": {
    "marketKey": "over_25",
    "selection": "Over 2.5 Goals",
    "modelProbability": 0.68,
    "edge": 0.12,
    "finalScore": 0.81,
    "riskLevel": "LOW",
    "advisorStatus": "BET",
    "bookmakerOdds": 1.85,
    "reasons": [
      "High-scoring H2H (3.2 avg goals last 5 meetings)",
      "Both teams in attacking form",
      "Open end-to-end script expected"
    ]
  },
  "backupPicks": [
    {
      "marketKey": "btts_yes",
      "selection": "Both Teams To Score",
      "modelProbability": 0.61,
      "edge": 0.08
    }
  ],
  "noSafePick": false,
  "abstainCode": null,
  "confidence": {
    "model": "high",
    "value": "medium",
    "volatility": "low"
  },
  "reasonCodes": ["h2h_high_scoring", "form_attacking", "script_open"],
  "script": {
    "primary": "open_end_to_end",
    "confidence": 0.82
  },
  "calibratedProbs": {
    "homeWin": 0.52,
    "draw": 0.23,
    "awayWin": 0.25,
    "over15": 0.84,
    "over25": 0.68,
    "over35": 0.38,
    "under25": 0.32,
    "bttsYes": 0.61,
    "bttsNo": 0.39
  },
  "dataCompleteness": 0.87,
  "engineVersion": "5.0.0",
  "updatedAt": "2026-05-29T12:34:56Z"
}
```

**When engine abstains** (`noSafePick: true`):

```json
{
  "fixtureId": 12345,
  "bestPick": null,
  "noSafePick": true,
  "abstainCode": "insufficient_edge",
  "confidence": {
    "model": "low",
    "value": "low",
    "volatility": "high"
  }
}
```

---

### `GET /api/v5/match/[id]`

Get full match detail with prediction, odds, standings, and H2H data.

**Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | number | ✅ (path) | BSD event ID |

**Response**: Extended version of `/predict` response with additional match context:

```json
{
  "fixture": { /* event data */ },
  "prediction": { /* full PredictionResult */ },
  "odds": {
    "homeWin": 1.65,
    "draw": 3.80,
    "awayWin": 5.50,
    "over25": 1.85,
    "under25": 1.95,
    "bttsYes": 1.75,
    "bttsNo": 2.05
  },
  "standings": {
    "home": { "position": 3, "points": 68, "xgd": 22.4 },
    "away": { "position": 7, "points": 54, "xgd": 8.1 }
  },
  "h2h": {
    "meetings": 5,
    "homeWins": 3,
    "draws": 1,
    "awayWins": 1,
    "avgGoals": 3.2
  }
}
```

---

### `GET /api/v5/sync`

Trigger a full data sync from BSD API to Turso.

**Parameters**: None

**What it syncs**:
- Events (fixtures) for the current date range
- Odds for upcoming fixtures
- Standings for active leagues
- Lineups for upcoming fixtures
- Managers for teams with upcoming fixtures
- Referees for upcoming fixtures

**Response**:

```json
{
  "success": true,
  "synced": {
    "events": 47,
    "odds": 47,
    "standings": 240,
    "lineups": 22,
    "managers": 40,
    "referees": 35
  },
  "duration": "4.2s"
}
```

---

### `GET /api/v5/sync-h2h`

Sync head-to-head historical matches for upcoming fixtures.

**Parameters**: None

**Response**:

```json
{
  "success": true,
  "processed": 24,
  "matched": 18,
  "h2hRecords": 156,
  "errors": 0
}
```

---

## Legacy Endpoints

These endpoints are maintained for backward compatibility but route through the V5 engine internally.

### `GET /api/v4/predictions`

Returns V5 predictions formatted as V4 "punter tips".

**Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max tips to return |
| `leagueId` | number | all | Filter by league |

**Response**: Array of punter tips with quality tiers (Gold/Silver/Bronze/Skip).

### `GET /api/our-value-bets`

Returns value bets (model probability > implied probability).

### `GET /api/football`

Legacy fixture endpoint. Redirects to V5 internally.

---

## Error Handling

All endpoints follow this error format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "status": 500
}
```

Common error codes:
- `FIXTURE_NOT_FOUND` — Invalid fixture ID
- `SYNC_FAILED` — BSD API unreachable or rate-limited
- `ENGINE_ERROR` — Prediction engine internal error
- `DB_ERROR` — Turso connection or query failure

---

## Rate Limits

- **BSD API**: Respect their rate limits (typically 100 req/min)
- **NeuralBet API**: No rate limiting on the API itself (add your own for production)
- **Prediction caching**: 6-hour TTL prevents redundant engine runs
