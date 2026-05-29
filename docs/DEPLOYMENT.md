# Deployment Guide — NeuralBet

> How to deploy NeuralBet to production.

---

## Vercel (Recommended)

### 1. Prerequisites

- GitHub account with the repo forked/cloned
- [Vercel](https://vercel.com) account (free tier works)
- [Turso](https://turso.tech) database (free tier works)
- [BSD API](https://bsportsdata.com) key

### 2. Create Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create neuralbet

# Get connection URL
turso db show neuralbet --url
# → libsql://neuralbet-your-org.turso.io

# Create auth token
turso db tokens create neuralbet
# → your-auth-token
```

### 3. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your NeuralBet repository
3. Add environment variables:

| Variable | Value |
|----------|-------|
| `TURSO_DATABASE_URL` | `libsql://neuralbet-your-org.turso.io` |
| `TURSO_AUTH_TOKEN` | Your Turso token |
| `BSD_API_KEY` | Your BSD API key |
| `BSD_API_BASE_URL` | `https://api.bsportsdata.com/v2` |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL (after first deploy) |

4. Deploy

### 4. Initialize Data

After deployment, trigger the initial sync:

```bash
# Full sync
curl https://your-app.vercel.app/api/v5/sync

# H2H data
curl https://your-app.vercel.app/api/v5/sync-h2h
```

### 5. Set Up Auto-Sync (Optional)

Use Vercel Cron Jobs or an external scheduler to sync data regularly:

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/v5/sync",
      "schedule": "0 */3 * * *"
    }
  ]
}
```

This syncs every 3 hours. Adjust based on your BSD API rate limits.

---

## Self-Hosted

### With Node.js

```bash
git clone https://github.com/Heisdawrld/Neuralbet.git
cd Neuralbet
npm install
cp .env.example .env.local
# Edit .env.local with your credentials

npm run build
npm start -- -p 3000
```

### With Caddy (Reverse Proxy)

A `Caddyfile` is included:

```
yourdomain.com {
  reverse_proxy localhost:3000
}
```

```bash
# Start the app
npm start &

# Start Caddy
caddy run --config Caddyfile
```

### With Docker (Not Included Yet)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DATABASE_URL` | ✅ | Turso libSQL connection URL |
| `TURSO_AUTH_TOKEN` | ✅ | Turso authentication token |
| `BSD_API_KEY` | ✅ | BSD API v2 key |
| `BSD_API_BASE_URL` | ✅ | BSD API base URL |
| `NEXT_PUBLIC_APP_URL` | ❌ | Public URL for OG images/sharing |
| `NEXTAUTH_SECRET` | ❌ | NextAuth secret (if auth enabled) |
| `NEXTAUTH_URL` | ❌ | NextAuth callback URL |

---

## Monitoring

### Health Checks

- `GET /api/v5/fixtures?date=today` — returns fixtures if DB is connected
- Check Vercel function logs for engine errors
- Check Turso dashboard for database health

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Failed to fetch fixtures" | Turso connection failed | Check `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` |
| Empty predictions | No data synced yet | Run `/api/v5/sync` first |
| "BSD API error" | Invalid API key or rate limit | Check `BSD_API_KEY`, wait for rate limit reset |
| Stale predictions | Cache TTL not expired | Wait 6 hours or use `?force=true` |
| Build fails | TypeScript errors | `npm run build` locally to see errors |
