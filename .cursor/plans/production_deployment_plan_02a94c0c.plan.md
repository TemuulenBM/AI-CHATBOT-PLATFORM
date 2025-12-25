---
name: Production Deployment Plan
overview: Deploy ConvoAI to production using Vercel (frontend), Render.com (backend with workers), Supabase (PostgreSQL), and Upstash (Redis), with GitHub Actions CI/CD for automated deployments.
todos:
  - id: supabase-setup
    content: Configure Supabase production project and run all migrations
    status: completed
  - id: upstash-setup
    content: Create Upstash Redis database and get connection URL
    status: completed
  - id: render-setup
    content: Create Render.com web service and configure environment variables
    status: completed
  - id: vercel-config
    content: Update vercel.json for frontend-only deployment with API proxy to Render
    status: completed
  - id: github-actions
    content: Create .github/workflows/ci.yml for CI/CD pipeline
    status: completed
  - id: env-example
    content: Create .env.example file documenting all required environment variables
    status: completed
  - id: stripe-webhook
    content: Configure Stripe webhook endpoint for production URL
    status: completed
---

# Production Deployment Plan

## Architecture Overview

```mermaid
flowchart TB
    subgraph GitHub[GitHub Repository]
        Code[Source Code]
    end
    
    subgraph CI[GitHub Actions]
        Lint[Lint & Type Check]
        Test[Tests]
        BuildCheck[Build Verification]
    end
    
    subgraph Frontend[Vercel - Frontend]
        React[React SPA]
        Static[Static Assets]
    end
    
    subgraph Backend[Render.com - Backend]
        Express[Express Server]
        Workers[BullMQ Workers]
        Cron[Scheduled Jobs]
    end
    
    subgraph Services[External Services]
        Supabase[(Supabase PostgreSQL + pgvector)]
        Upstash[(Upstash Redis)]
        Stripe[Stripe Payments]
        OpenAI[OpenAI API]
        Sentry[Sentry Monitoring]
    end
    
    Code --> CI
    CI -->|Deploy Frontend| Frontend
    CI -->|Deploy Backend| Backend
    
    React -->|API Calls| Express
    Express --> Supabase
    Express --> Upstash
    Workers --> Upstash
    Workers --> Supabase
    Express --> Stripe
    Express --> OpenAI
    Express --> Sentry
```

---

## Phase 1: Supabase Production Setup

Your Supabase project needs to be production-ready with proper schema and security.

### 1.1 Create Production Supabase Project

- Go to [supabase.com](https://supabase.com) and create a new project (or use existing)
- Choose a region closest to your users
- Note your project credentials:
- `SUPABASE_URL` (Project Settings > API > Project URL)
- `SUPABASE_SERVICE_KEY` (Project Settings > API > service_role secret)

### 1.2 Run Database Migrations

Execute migrations in order via Supabase SQL Editor:

1. [`supabase/schema.sql`](supabase/schema.sql) - Core tables and functions
2. [`supabase/migrations/001_analytics_functions.sql`](supabase/migrations/001_analytics_functions.sql)
3. [`supabase/migrations/002_rescraping_columns.sql`](supabase/migrations/002_rescraping_columns.sql)
4. [`supabase/migrations/003_knowledge_base.sql`](supabase/migrations/003_knowledge_base.sql)
5. [`supabase/migrations/004_analytics_enhancement.sql`](supabase/migrations/004_analytics_enhancement.sql)

### 1.3 Enable pgvector Extension

Ensure the vector extension is enabled (already in schema.sql):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Phase 2: Upstash Redis Setup

### 2.1 Create Upstash Redis Database

- Go to [upstash.com](https://upstash.com) and create a Redis database
- Choose region closest to your Render backend
- Enable **TLS** for secure connections
- Copy the `UPSTASH_REDIS_REST_URL` (use the `redis://` format for ioredis)

### 2.2 Get Connection String

Your `REDIS_URL` will look like:

```javascript
rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379
```

Note: Use `rediss://` (with double 's') for TLS connections.---

## Phase 3: Render.com Backend Deployment

### 3.1 Create Render Web Service

- Connect your GitHub repository to Render
- Create a new **Web Service**
- Configure:
- **Name**: `convoai-backend`
- **Region**: Same as Supabase/Upstash
- **Branch**: `main`
- **Runtime**: Node
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`

### 3.2 Set Environment Variables on Render

Add all required environment variables in Render dashboard:| Variable | Description ||----------|-------------|| `NODE_ENV` | `production` || `PORT` | `10000` (Render default) || `SUPABASE_URL` | Your Supabase project URL || `SUPABASE_SERVICE_KEY` | Supabase service role key || `REDIS_URL` | Upstash Redis URL || `OPENAI_API_KEY` | OpenAI API key || `JWT_SECRET` | Secure 32+ char secret (generate with `openssl rand -base64 32`) || `APP_URL` | Your Render backend URL || `STRIPE_SECRET_KEY` | Stripe secret key || `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret || `STRIPE_STARTER_PRICE_ID` | Stripe price ID || `STRIPE_GROWTH_PRICE_ID` | Stripe price ID || `STRIPE_BUSINESS_PRICE_ID` | Stripe price ID || `SENTRY_DSN` | (Optional) Sentry DSN for error tracking || `ANTHROPIC_API_KEY` | (Optional) For Claude models |---

## Phase 4: Vercel Frontend Deployment

### 4.1 Create Vercel Project

- Connect your GitHub repository to Vercel
- Configure:
- **Framework Preset**: Vite
- **Root Directory**: `./` (project root)
- **Build Command**: `npm run build`
- **Output Directory**: `dist/public`

### 4.2 Update Vercel Configuration

Modify [`vercel.json`](vercel.json) to proxy API calls to Render backend:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist/public",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://convoai-backend.onrender.com/api/:path*"
    },
    {
      "source": "/widget.js",
      "destination": "https://convoai-backend.onrender.com/api/widget.js"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/widget.js",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Cache-Control", "value": "public, max-age=3600" }
      ]
    }
  ]
}
```



### 4.3 Set Vercel Environment Variables

- `VITE_API_URL`: Your Render backend URL (e.g., `https://convoai-backend.onrender.com`)

---

## Phase 5: GitHub Actions CI/CD

### 5.1 Create CI/CD Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
    - run: npm ci
    - run: npm run check

  build:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
    - run: npm ci
    - run: npm run build
        env:
          NODE_ENV: production
```



### 5.2 Automatic Deployments

- **Vercel**: Automatically deploys on push to `main` (built-in)
- **Render**: Automatically deploys on push to `main` (built-in)
- **GitHub Actions**: Runs CI checks before deploy

---

## Phase 6: Post-Deployment Configuration

### 6.1 Configure Stripe Webhooks

- Go to Stripe Dashboard > Developers > Webhooks
- Add endpoint: `https://convoai-backend.onrender.com/api/subscriptions/webhook`
- Select events: `checkout.session.completed`, `customer.subscription.*`
- Copy signing secret to `STRIPE_WEBHOOK_SECRET`

### 6.2 Configure Custom Domain (Optional)

- **Vercel**: Add custom domain in project settings
- **Render**: Add custom domain for API if needed
- Update `APP_URL` and `VITE_API_URL` accordingly

### 6.3 Set Up Sentry Monitoring (Optional)

- Create project at [sentry.io](https://sentry.io)
- Add `SENTRY_DSN` to Render environment variables

---

## Environment Variables Checklist

### Backend (Render.com)

| Variable | Required | Example ||----------|----------|---------|| `NODE_ENV` | Yes | `production` || `PORT` | No | `10000` || `SUPABASE_URL` | Yes | `https://xxx.supabase.co` || `SUPABASE_SERVICE_KEY` | Yes | `eyJhbGciOiJIUzI1...` || `REDIS_URL` | Yes | `rediss://default:xxx@xxx.upstash.io:6379` || `OPENAI_API_KEY` | Yes | `sk-...` || `JWT_SECRET` | Yes | 32+ random characters || `APP_URL` | Yes | `https://convoai-backend.onrender.com` || `STRIPE_SECRET_KEY` | Yes | `sk_live_...` || `STRIPE_WEBHOOK_SECRET` | Yes | `whsec_...` || `STRIPE_STARTER_PRICE_ID` | Yes | `price_...` || `STRIPE_GROWTH_PRICE_ID` | Yes | `price_...` || `STRIPE_BUSINESS_PRICE_ID` | Yes | `price_...` || `SENTRY_DSN` | No | `https://xxx@sentry.io/xxx` || `ANTHROPIC_API_KEY` | No | `sk-ant-...` |

### Frontend (Vercel)

| Variable | Required | Example ||----------|----------|---------|| `VITE_API_URL` | Yes | `https://convoai-backend.onrender.com` |---

## Files to Create/Modify

1. **Create**: `.github/workflows/ci.yml` - CI/CD pipeline