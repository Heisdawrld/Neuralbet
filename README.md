# ◈ Cipher

**Decode football before kickoff.**

Cipher is a football intelligence platform built around one idea: a profitable betting product must reason like a real analyst, not just output probabilities.

## Product

- Free tier: fixture discovery, limited daily insight, basic probabilities
- Premium: full analyst reports, edge detection, stake sizing, advanced market intelligence, performance tracking
- Built for all available leagues through BSD API v2

## Intelligence philosophy

Cipher combines:

- team memory: recent form, momentum, attack/defence trend, fatigue
- fixture context: kickoff timing, schedule pressure, league state
- market context: bookmaker implied probability and edge detection
- risk controls: confidence tier, risk tier, Kelly-informed stake cap
- analyst narrative: every pick must explain itself

## Stack

- Next.js 15 + React 19
- TypeScript strict
- Tailwind CSS v4
- Turso/libSQL
- BSD Sports API v2
- Clerk auth
- Stripe subscriptions
- Vitest

## Environment

Copy `.env.example` to `.env.local`.

```env
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...
BSD_API_KEY=...
BSD_API_BASE_URL=https://sports.bzzoiro.com/api/v2/
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
STRIPE_SECRET_KEY=...
```

## Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## Status

This is the fresh Cipher rebuild. Old NeuralBet code was intentionally wiped.
