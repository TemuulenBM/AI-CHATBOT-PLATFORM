# Production Deployment Guide

This guide covers deploying ConvoAI to production using:
- **Vercel** - Frontend hosting
- **Render.com** - Backend server with workers
- **Supabase** - PostgreSQL database
- **Upstash** - Redis for caching and queues

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Architecture                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   GitHub ──push──> Vercel (React Frontend)                  │
│                         │                                    │
│                         │ API calls (proxied)                │
│                         ▼                                    │
│   GitHub ──push──> Render.com (Express + BullMQ Workers)    │
│                         │                                    │
│            ┌────────────┼────────────┐                       │
│            ▼            ▼            ▼                       │
│       Supabase      Upstash      Stripe                     │
│       (Postgres)    (Redis)      (Payments)                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- GitHub repository with the codebase
- Accounts on: Supabase, Upstash, Render.com, Vercel
- Stripe account (for payments)
- OpenAI API key

---

## Step 1: Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a project
2. Note your credentials from **Project Settings > API**:
   - `SUPABASE_URL` - Project URL
   - `SUPABASE_SERVICE_KEY` - service_role secret (keep this secret!)
3. Run migrations in **SQL Editor** (in this order):
   - `supabase/schema.sql`
   - `supabase/migrations/001_analytics_functions.sql`
   - `supabase/migrations/002_rescraping_columns.sql`
   - `supabase/migrations/003_knowledge_base.sql`
   - `supabase/migrations/004_analytics_enhancement.sql`

---

## Step 2: Upstash Redis Setup

1. Go to [upstash.com](https://upstash.com) and create a Redis database
2. Choose the region closest to your Render backend
3. Enable **TLS** for secure connections
4. Copy the Redis URL (use the `redis://` format):
   ```
   rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379
   ```
   Note: Use `rediss://` (double 's') for TLS

---

## Step 3: Render.com Backend Setup

### Option A: Using render.yaml (Recommended)

1. Connect your GitHub repo to Render
2. Click "New" > "Blueprint"
3. Select your repo - Render will detect `render.yaml`
4. Fill in the environment variables when prompted

### Option B: Manual Setup

1. Go to [render.com](https://render.com) and click **"New"** → **"Web Service"**
   - ⚠️ **Important**: Choose "Web Service" (not Background Worker or Cron Job)
   - Your Express server runs the API + BullMQ workers in the same process
2. Connect your GitHub repository
3. Configure:
   - **Name**: `convoai-backend`
   - **Region**: Same as Supabase/Upstash
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/api/health`

4. Add environment variables:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `SUPABASE_URL` | Your Supabase URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service key |
| `REDIS_URL` | Your Upstash Redis URL (use `rediss://` protocol for TLS) |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `JWT_SECRET` | Generate with `openssl rand -base64 32` |
| `APP_URL` | Your Render URL (e.g., `https://convoai-backend.onrender.com`) |
| `STRIPE_SECRET_KEY` | Your Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Your Stripe webhook secret |
| `STRIPE_STARTER_PRICE_ID` | Stripe price ID |
| `STRIPE_GROWTH_PRICE_ID` | Stripe price ID |
| `STRIPE_BUSINESS_PRICE_ID` | Stripe price ID |

5. Note your Render URL (e.g., `https://convoai-backend.onrender.com`)

---

## Step 4: Vercel Frontend Setup

1. **Update `vercel.json`** - Replace `YOUR-RENDER-APP` with your actual Render app name:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://YOUR-RENDER-APP.onrender.com/api/:path*"
       }
     ]
   }
   ```
   For example, if your Render URL is `https://convoai-backend.onrender.com`, replace all instances of `YOUR-RENDER-APP` with `convoai-backend`.

2. Go to [vercel.com](https://vercel.com) and import your GitHub repo

3. Configure:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/public`

4. Deploy!

---

## Step 5: Stripe Webhook Configuration

1. Go to **Stripe Dashboard > Developers > Webhooks**
2. Click "Add endpoint"
3. Enter URL: `https://YOUR-RENDER-URL.onrender.com/api/subscriptions/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy the **Signing secret** to your Render `STRIPE_WEBHOOK_SECRET` variable

---

## Step 6: Custom Domain (Optional)

### Vercel (Frontend)
1. Go to your project settings > Domains
2. Add your custom domain (e.g., `app.yoursite.com`)

### Render (Backend API)
1. Go to your service settings > Custom Domains
2. Add your API domain (e.g., `api.yoursite.com`)
3. Update `BACKEND_URL` in Vercel to the new domain
4. Update `APP_URL` in Render to the new domain

---

## Environment Variables Reference

### Backend (Render.com)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | No | Default: `10000` |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `REDIS_URL` | Yes | Upstash Redis URL |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `JWT_SECRET` | Yes | 32+ character secret |
| `APP_URL` | Yes | Backend URL |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook secret |
| `STRIPE_*_PRICE_ID` | Yes | Stripe price IDs |
| `ANTHROPIC_API_KEY` | No | Claude API key |
| `SENTRY_DSN` | No | Sentry error tracking |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | Render backend URL |

---

## Troubleshooting

### Cold Starts on Free Tier
Render's free tier spins down after 15 minutes of inactivity. First request may take ~30 seconds.

### Redis Connection Errors
Ensure you're using `rediss://` (with TLS) for Upstash connections.

### CORS Issues
The widget uses CORS headers. If you see CORS errors:
1. Check that `APP_URL` is set correctly
2. Verify the widget domain whitelist in chatbot settings

### Build Failures
1. Check that all environment variables are set
2. Run `npm run build` locally to debug
3. Check the build logs in Vercel/Render dashboards

---

## CI/CD Pipeline

GitHub Actions automatically runs on every push:
1. **Lint & Type Check** - Validates code quality
2. **Build** - Verifies the build succeeds

Vercel and Render both auto-deploy when you push to `main`.

---

## Monitoring

### Health Checks
- Basic: `GET /api/health`
- Detailed: `GET /api/health/detailed`

### Recommended Tools
- **Sentry** - Error tracking (add `SENTRY_DSN`)
- **Upstash Console** - Redis monitoring
- **Supabase Dashboard** - Database metrics
- **Render Dashboard** - Server logs and metrics

