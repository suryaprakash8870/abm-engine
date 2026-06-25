# Deploying to Render

The repo ships a `render.yaml` Blueprint that provisions everything: the Next.js
web app, the BullMQ worker, managed Postgres, and managed Redis (Key-Value).

## One-time setup

1. **Push to GitHub** (Render deploys from a Git repo):
   ```bash
   git add . && git commit -m "deploy: render blueprint" && git push
   ```
2. In Render → **New → Blueprint** → select this repo. Render reads `render.yaml`
   and shows the 4 resources it will create. Click **Apply**.
3. The first deploy will **fail/stall on the web + worker** until you set the
   secret env vars (they are marked `sync: false`, so they are intentionally
   blank). Open each service → **Environment** → fill them in (see below) → the
   service redeploys automatically.

## Secrets to set in the dashboard

Generate the two crypto secrets locally and paste the output:

```bash
# AUTH_SECRET (session HMAC) and ENCRYPTION_KEY (BYO-key AES) — 32 bytes hex each
node -e "console.log('AUTH_SECRET    =', require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY =', require('crypto').randomBytes(32).toString('hex'))"
```

| Var | Value |
|---|---|
| `AUTH_SECRET` | from command above |
| `ENCRYPTION_KEY` | from command above (must match between web + worker) |
| `ICP_LLM` | `anthropic` (recommended for prod) or `ollama` (see LLM note) |
| `ANTHROPIC_API_KEY` | your key, if `ICP_LLM=anthropic` |
| `APOLLO_API_KEY`, `FIRECRAWL_API_KEY`, `THEIRSTACK_API_KEY` | your BYO keys |
| `HUBSPOT_SERVICE_KEY` | HubSpot private-app token |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | for play alerts |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google login |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | analytics |

`DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, and `NEXT_PUBLIC_APP_URL` are wired
**automatically** by the Blueprint — do not set them by hand.

## The Ollama problem (local LLM)

Your dev machine runs Ollama locally. **Render's cloud cannot reach `localhost`.**
Two options:

- **Recommended for prod:** set `ICP_LLM=anthropic` + `ANTHROPIC_API_KEY`. No
  tunnel, always up, no cold starts.
- **Keep Ollama:** expose it with a stable tunnel (e.g. Cloudflare Tunnel — a
  fixed hostname, unlike `ngrok`'s rotating URL) and set `OLLAMA_URL` to that
  hostname. The in-app **Settings → Ollama endpoint** card lets you change this
  URL at runtime without redeploying, which covers a tunnel URL that rotates.

## After deploy — verify

- Web health: `https://<your-web>.onrender.com/api/v1/icp-engine/health` → 200.
- Worker: Render → abm-worker → **Logs** should show `workers started`.
- Update **Google OAuth** authorized redirect URI to
  `https://<your-web>.onrender.com/api/v1/auth/google/callback`.

## Migrations

`npx prisma migrate deploy` runs automatically in the web service's
**preDeployCommand** on every deploy — it applies any new migrations before
traffic shifts. No manual step.
