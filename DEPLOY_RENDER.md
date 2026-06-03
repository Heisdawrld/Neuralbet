# Deploy Cipher on Render

Cipher is a standard Next.js app and can run as a Render **Web Service**.

## Recommended Render settings

- **Runtime:** Node
- **Branch:** `main`
- **Build command:**

```bash
npm ci --include=dev && npm run build
```

- **Start command:**

```bash
npm run start
```

- **Health check path:**

```txt
/api/health
```

A `render.yaml` blueprint is included if you prefer Blueprint deploys.

## Required environment variables

Set these in Render → Service → Environment.

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-render-url.onrender.com

TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...

BSD_API_KEY=...
BSD_API_BASE_URL=https://sports.bzzoiro.com/api/v2/

SYNC_SECRET=generate-a-long-random-secret

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...

STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY=price_...
```

## Clerk setup

In Clerk dashboard, add the Render domain to allowed origins/redirects:

- `https://your-render-url.onrender.com`
- sign-in URL: `/sign-in`
- sign-up URL: `/sign-up`
- after sign-in URL: `/dashboard`

## Stripe setup

Create a recurring monthly price for **Cipher Premium — $19/mo**.

Set:

```env
NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY=price_...
```

Create a webhook endpoint pointing to:

```txt
https://your-render-url.onrender.com/api/webhooks/stripe
```

Listen for:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Then set:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

## First sync after deploy

After env vars are set and the service is live, run:

```bash
curl -X POST "https://your-render-url.onrender.com/api/sync" \
  -H "x-sync-secret: YOUR_SYNC_SECRET" \
  -H "content-type: application/json" \
  -d '{"pastDays":30,"futureDays":14,"oddsLimit":100}'
```

Then settle pending predictions after finished results sync:

```bash
curl -X POST "https://your-render-url.onrender.com/api/settle" \
  -H "x-sync-secret: YOUR_SYNC_SECRET"
```

## Suggested Render Cron Jobs

Create two Render Cron Jobs later:

1. **Sync data** — every 30–60 minutes

```bash
curl -X POST "$APP_URL/api/sync" -H "x-sync-secret: $SYNC_SECRET" -H "content-type: application/json" -d '{"pastDays":30,"futureDays":14,"oddsLimit":100}'
```

2. **Settle predictions** — every 2–4 hours

```bash
curl -X POST "$APP_URL/api/settle" -H "x-sync-secret: $SYNC_SECRET"
```

## Smoke tests

```bash
curl https://your-render-url.onrender.com/api/health
curl "https://your-render-url.onrender.com/api/fixtures"
```

`/api/fixtures` requires `BSD_API_KEY` if the database has not been synced yet.
