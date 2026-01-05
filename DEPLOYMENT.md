# ConvoAI Deployment Guide

This guide explains how to deploy ConvoAI with proper environment variable configuration, removing hardcoded URLs from your deployment.

## Table of Contents

- [Environment Variables Overview](#environment-variables-overview)
- [Local Development Setup](#local-development-setup)
- [Production Deployment](#production-deployment)
- [Vercel Frontend Configuration](#vercel-frontend-configuration)
- [Render Backend Configuration](#render-backend-configuration)
- [Security Best Practices](#security-best-practices)

## Environment Variables Overview

ConvoAI uses environment variables for all configuration to ensure security and flexibility across different deployment environments.

### Key Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_URL` | Backend API URL | `https://your-backend.onrender.com` |
| `FRONTEND_URL` | Frontend application URL | `https://your-frontend.vercel.app` |
| `VITE_API_URL` | Frontend env for API URL (must have VITE_ prefix) | `https://your-backend.onrender.com` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `https://backend.com,https://frontend.com` |

### Complete List

See `.env.example` for a complete list of all environment variables with descriptions.

## Local Development Setup

### 1. Copy Environment Template

```bash
cp .env.example .env
```

### 2. Configure Local Variables

Edit `.env` and set the following for local development:

```env
NODE_ENV=development
PORT=5000

# Backend URL (local)
APP_URL=http://localhost:5000

# Frontend URL (local)
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:5000

# Add your API keys
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
REDIS_URL=rediss://your-redis-url
OPENAI_API_KEY=sk-...
CLERK_SECRET_KEY=sk_test_...
```

### 3. Start Development Server

```bash
npm run dev
```

## Production Deployment

### Architecture

ConvoAI uses a split deployment architecture:
- **Backend**: Deployed on Render.com
- **Frontend**: Deployed on Vercel

### Deployment Flow

1. Deploy backend to Render
2. Get backend URL (e.g., `https://your-app.onrender.com`)
3. Configure Vercel with backend URL
4. Deploy frontend to Vercel
5. Update backend ALLOWED_ORIGINS with frontend URL

## Vercel Frontend Configuration

### 1. Update vercel.json

**IMPORTANT**: Vercel does not support environment variables in `vercel.json`. You must manually update the URLs:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-BACKEND-URL/api/:path*"
    },
    {
      "source": "/widget.js",
      "destination": "https://YOUR-BACKEND-URL/widget.js"
    }
  ]
}
```

Replace `YOUR-BACKEND-URL` with your actual Render backend URL.

### 2. Set Vercel Environment Variables

In Vercel dashboard (Settings → Environment Variables):

```env
VITE_API_URL=https://your-backend.onrender.com
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_PADDLE_CLIENT_TOKEN=live_...
VITE_PADDLE_ENVIRONMENT=live
```

### 3. Deploy

```bash
vercel --prod
```

## Render Backend Configuration

### 1. Update render.yaml

The `render.yaml` file is already configured to use environment variables. You just need to set them in the Render dashboard.

### 2. Set Render Environment Variables

In Render dashboard (Environment → Environment Variables):

```env
NODE_ENV=production
PORT=10000

# URLs - Critical for security!
APP_URL=https://your-backend.onrender.com
FRONTEND_URL=https://your-frontend.vercel.app
ALLOWED_ORIGINS=https://your-backend.onrender.com,https://your-frontend.vercel.app

# Database & Cache
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
REDIS_URL=rediss://your-redis-url

# Authentication
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# AI & APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Payments
PADDLE_API_KEY=live_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
PADDLE_ENVIRONMENT=live
PADDLE_STARTER_PRICE_ID=pri_...
PADDLE_GROWTH_PRICE_ID=pri_...
PADDLE_BUSINESS_PRICE_ID=pri_...

# Monitoring
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourdomain.com

# Security
TRUST_PROXY=true
```

### 3. Deploy

Render will auto-deploy when you push to your main branch.

## Security Best Practices

### 1. Never Commit .env Files

Ensure `.env` is in your `.gitignore`:

```gitignore
.env
.env.local
.env.production
```

### 2. Rotate Exposed Keys

If you accidentally commit API keys:
1. Immediately revoke the exposed keys
2. Generate new keys
3. Update environment variables
4. Remove the commit from git history

### 3. Use Different Keys for Environments

Use separate API keys for:
- Development (test/sandbox keys)
- Staging (test/sandbox keys)
- Production (live keys)

### 4. CORS Configuration

Always set `ALLOWED_ORIGINS` to specific domains:

```env
# Good
ALLOWED_ORIGINS=https://yourapp.vercel.app,https://yourdomain.com

# Bad - Never use in production!
ALLOWED_ORIGINS=*
```

### 5. Trust Proxy

Enable `TRUST_PROXY=true` when behind a reverse proxy (Render, Vercel, nginx):

```env
TRUST_PROXY=true
```

This ensures correct client IP detection for rate limiting and logging.

## Verifying Deployment

### 1. Check Backend Health

```bash
curl https://your-backend.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### 2. Check Frontend

Visit your Vercel URL and verify:
- Frontend loads correctly
- API calls work (check Network tab)
- Authentication works
- Widget loads on test page

### 3. Check Widget Embedding

Test the widget on an external site:

```html
<script async
  src="https://your-backend.onrender.com/widget.js"
  data-chatbot-id="your-chatbot-id"
></script>
```

## Troubleshooting

### CORS Errors

If you see CORS errors:
1. Verify `ALLOWED_ORIGINS` includes your frontend URL
2. Check that URLs don't have trailing slashes
3. Ensure protocol matches (https:// not http://)

### Widget Not Loading

1. Check `APP_URL` is set correctly
2. Verify Vercel rewrites point to correct backend URL
3. Check browser console for CSP errors

### Environment Variables Not Working

1. Restart the application after changing env vars
2. For Vite variables, ensure they start with `VITE_`
3. Check Vercel/Render dashboard shows the variables

### Backend URL Changes

If you change your backend URL:
1. Update `vercel.json` rewrites
2. Update `VITE_API_URL` in Vercel
3. Update `ALLOWED_ORIGINS` on backend
4. Redeploy both frontend and backend

## Migration from Hardcoded URLs

If you're migrating from an older version with hardcoded URLs:

### Files Updated

- ✅ `.env.example` - Added all URL environment variables
- ✅ `client/src/pages/widget-demo.tsx` - Uses `VITE_API_URL`
- ✅ `server/middleware/security.ts` - Uses `APP_URL` for CSP
- ✅ `server/config/swagger.ts` - Uses `APP_URL` for API docs
- ✅ `vercel.json` - Documented manual URL replacement
- ✅ `render.yaml` - Uses environment variables

### Migration Steps

1. Update your `.env` file with new variables
2. Update `vercel.json` with your backend URL
3. Deploy backend first, then frontend
4. Verify all services work correctly

## Support

For deployment issues:
- Check logs in Render dashboard
- Check build logs in Vercel dashboard
- Review this guide's troubleshooting section
- Open an issue on GitHub

## Production Checklist

Before going live:

- [ ] All environment variables set in production
- [ ] Using live API keys (not test/sandbox)
- [ ] `NODE_ENV=production`
- [ ] `TRUST_PROXY=true`
- [ ] `ALLOWED_ORIGINS` set to specific domains
- [ ] Vercel rewrites point to production backend
- [ ] SSL/TLS certificates valid
- [ ] Health check endpoint returns 200
- [ ] Sentry configured for error tracking
- [ ] Database backups enabled
- [ ] Redis persistence enabled
