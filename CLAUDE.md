# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication Preferences

**Language**: Communicate with the user in Mongolian (Монгол хэл). Бүх харилцаа, тайлбар, асуулт хариултыг заавал Монгол хэлээр бичнэ.

## Code Comments & Documentation

- Код дотор бичих **comment**, **docblock**-уудыг заавал **Монгол хэлээр** бичнэ
- JSDoc, inline comment, TODO, FIXME бүгдийг Монголоор бичнэ
- Жишээ: `// Хэрэглэгчийн мэдээллийг шалгах`, `/** Чатбот үүсгэх сервис */`

## Teaching Mode

Хэрэглэгч junior developer тул:
- Код бичихдээ **яагаад** тэгж хийснийг товч тайлбарлана (ямар pattern, ямар шалтгаанаар)
- Шинэ ойлголт, pattern гарч ирвэл Монголоор ойлгомжтой тайлбарлана
- Алдаа засахдаа алдааны **шалтгаан**-ыг тайлбарлана (зөвхөн засаад орхихгүй)
- Best practice, anti-pattern-ийн тухай товч дурдана

## Git Commit Guidelines

**IMPORTANT**: When creating git commits, DO NOT include "Co-Authored-By: Claude" or any similar attribution text in commit messages. Keep commit messages clean and professional without AI attribution.

## Build & Development Commands

```bash
# Development
npm run dev              # Start dev server (API + Vite HMR) on port 5000
npm run dev:client       # Start only Vite client dev server

# Build
npm run build            # Build both server and widget for production
npm run build:widget     # Build only the embeddable chat widget

# Type checking
npm run check            # Run TypeScript type checking

# Testing
npm test                 # Run all unit/integration tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run test:unit        # Run only unit tests (tests/unit/)
npm run test:integration # Run only integration tests (tests/integration/)
npm run test:e2e         # Run Playwright E2E tests (requires server running)
npm run test:e2e:ui      # Run E2E tests with Playwright UI
npm run test:e2e:headed  # Run E2E tests in headed browser

# Run a single test file
npx vitest run tests/unit/services/ai.test.ts

# Production
npm run start            # Start production server from dist/
```

## Architecture Overview

### Monorepo Structure
- **server/**: Express API backend (Node.js + TypeScript)
- **client/**: React frontend (Vite + TypeScript + Tailwind CSS v4)
- **shared/**: Shared Zod schemas and TypeScript types (`shared/schema.ts`)
- **widget/**: Standalone embeddable chat widget (esbuild, IIFE bundle with SRI hashes)
- **supabase/migrations/**: PostgreSQL database migrations (numbered 001–015)

### Path Aliases
- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`

### Deployment Architecture
- **Frontend**: Vercel (multi-region: iad1, sfo1, lhr1, hnd1, syd1)
- **Backend**: Render.com (Vercel rewrites `/api/*` to Render backend)
- **API_ONLY mode**: Set `API_ONLY=true` to skip static file serving on backend

### Backend Architecture (server/)
- **controllers/**: Request handlers for each feature domain
- **routes/**: Express route definitions that wire controllers to endpoints
- **services/**: Business logic and external API integrations
- **middleware/**: Auth, rate limiting, CSRF, security headers, webhook validation
- **jobs/**: BullMQ job queues for async tasks (scraping, embedding generation, GDPR data export/deletion)
- **utils/**: Redis, Supabase client, logger, monitoring, error classes
- **config/swagger.ts**: OpenAPI 3.0 spec with JSDoc `@openapi` annotations in route files

### AI Service (server/services/ai.ts)
- **Dual provider**: OpenAI (default: gpt-5-mini) and Anthropic (claude-4-5-opus)
- **Context building priority**: Manual Q&A knowledge base (similarity > 0.8) → Scraped embeddings (similarity > 0.6) → Empty context
- **Limits**: 3 context chunks, 4000 chars max context, 20 messages history
- **Streaming**: Supports both streaming and non-streaming responses

### Security Middleware Chain (server/index.ts)
Applied in this order:
1. Trust proxy → CORS → CSP nonce → Helmet → HPP → Mongo sanitization
2. Body parsers (10mb limit, raw body preserved for webhook verification)
3. CSRF token (Double Submit Cookie pattern)
4. Route-specific: Clerk auth → subscription loading → rate limiting

**CSRF exemptions** (no token needed): GET/HEAD/OPTIONS, `/webhooks/*`, `/paddle/webhook`, `/chat/widget`, `/chat/stream`, `/chat/message`, `/feedback`, `/analytics/widget/track`, `/chat/support`, `/support`, `/gdpr/consent`

**Public endpoints** (no auth needed): widget chat, widget config, feedback, widget analytics tracking, GDPR consent

### Rate Limiting (server/middleware/rateLimit.ts)
- `authRateLimit`: 5 req / 15 min (login)
- `apiRateLimit`: 60 req / min
- `chatRateLimit`: Plan-based (Free: 10, Starter: 30, Growth: 100, Business: 200)
- `embeddingRateLimit`: 10 req / hour (chatbot creation)

### Frontend Architecture (client/)
- **Routing**: wouter (lightweight React router)
- **State**: Zustand stores + TanStack Query for server state
- **UI Components**: Radix UI primitives + shadcn/ui styling
- **Auth**: Clerk React SDK — auto-syncs users to Supabase with default 'free' subscription
- **Forms**: react-hook-form + Zod validation via @hookform/resolvers

### Widget Build (widget/)
- Built with esbuild as IIFE bundle (`widget.js`) + async loader (`loader.js`)
- Outputs `manifest.json` with SHA-384 integrity hashes for SRI
- Uses Shadow DOM for CSS isolation on embedded sites
- Has i18n support (`widget/src/i18n/`)

### Background Jobs (server/jobs/)
BullMQ queues backed by Redis:
- Website scraping & embedding generation (frequency-based: daily/weekly/monthly)
- GDPR data export and scheduled account deletion
- Widget analytics cleanup (retention-based)

### Database
- Supabase PostgreSQL with pgvector extension (1536-dimension vectors)
- Key tables: users, chatbots, embeddings, knowledge_base, conversations, subscriptions, feedback, widget_analytics, gdpr_consent
- Connection pooling configured via `DB_POOL_*` env vars

### Environment Variables
Validated at startup via `server/utils/env.ts`. Required vars:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `REDIS_URL`, `OPENAI_API_KEY`, `CLERK_SECRET_KEY`

Optional: `ANTHROPIC_API_KEY`, `PADDLE_*`, `SENTRY_DSN`, `RESEND_API_KEY`, `DB_POOL_*`

In production, missing required vars cause exit. In development, they only warn.

### Testing
- **Vitest**: Unit & integration tests with 30s timeout, `node` environment, globals enabled
- **Playwright**: E2E tests across Chromium, Firefox, WebKit + mobile viewports (Pixel 5, iPhone 12)
- **Test setup** (`tests/setup.ts`): Mocks logger and all external service env vars
- **Coverage**: v8 provider, covers `server/**/*.ts`

## Important Notes

- **Migration 005** moves pgvector from `public` to `extensions` schema. After running it, you MUST regenerate embeddings using `server/scripts/regenerate-embeddings.ts` and `server/scripts/regenerate-knowledge-base.ts`
- The widget CORS policy is permissive (`*`) while API CORS is strict — this is intentional for embedding on external sites
- Webhook endpoints (`/webhooks/*`, `/paddle/webhook`) use raw body + signature verification — do not add body-parsing middleware before them
- API docs: interactive Swagger UI at `/api-docs`, raw OpenAPI spec at `/api-docs.json`
- The build process is two-stage: Vite builds client to `dist/public/`, then esbuild bundles server to `dist/index.cjs` (CommonJS)
