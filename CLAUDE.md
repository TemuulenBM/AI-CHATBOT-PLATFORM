# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication Preferences

**Language**: Communicate with the user in Mongolian (Монгол хэл).

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
npm run test:coverage    # Run tests with coverage report (60% threshold)
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
- **client/**: React frontend (Vite + TypeScript + Tailwind)
- **shared/**: Shared types and Zod schemas used by both server and client
- **widget/**: Standalone embeddable chat widget built separately
- **supabase/migrations/**: PostgreSQL database migrations

### Path Aliases
- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`

### Backend Architecture (server/)
- **controllers/**: Request handlers for each feature domain (chat, chatbots, feedback, GDPR)
- **routes/**: Express route definitions that wire controllers to endpoints
- **services/**: Business logic and external API integrations (AI, embedding, scraper, Paddle billing)
- **middleware/**: Auth (Clerk), rate limiting, CSRF, security headers, webhook validation
- **jobs/**: BullMQ job queues for async tasks (scraping, embedding generation, data export)
- **utils/**: Shared utilities (Redis, Supabase client, logger, monitoring, errors)

### Frontend Architecture (client/)
- **Routing**: Uses wouter (lightweight React router)
- **State**: Zustand stores + TanStack Query for server state
- **UI Components**: Radix UI primitives with shadcn/ui styling
- **Auth**: Clerk React SDK

### Key External Services
- **Supabase**: PostgreSQL database with pgvector for embeddings
- **Redis (Upstash)**: Caching, rate limiting, job queues
- **OpenAI**: Chat completions and text embeddings
- **Clerk**: Authentication and user management
- **Paddle**: Subscription billing
- **Sentry**: Error tracking and APM

### API Structure
All API routes are prefixed with `/api/`:
- `/api/chatbots` - CRUD operations for chatbots
- `/api/chat/:chatbotId` - Chat with a specific chatbot
- `/api/subscriptions` - Paddle subscription management
- `/api/analytics/*` - Dashboard and widget analytics
- `/api/gdpr/*` - GDPR compliance (data export, deletion, consent)
- `/api/health` - Basic health check
- `/api/health/detailed` - Comprehensive service health check
- `/api/monitoring/*` - Metrics, alerts, uptime status

API docs available at `/api-docs` (Swagger UI) when server is running.

### Database
- Uses Supabase PostgreSQL with pgvector extension
- Migrations in `supabase/migrations/` (numbered sequentially)
- Key tables: users, chatbots, embeddings, knowledge_base, conversations, subscriptions, feedback

### Testing Structure
- **tests/unit/**: Unit tests mirroring server/ structure
- **tests/integration/**: API integration tests
- **tests/e2e/**: Playwright browser tests
- **tests/mocks/**: Shared mock implementations
- **tests/setup.ts**: Global test setup with environment mocks

## Important Notes

- Migration 005 moves the pgvector extension and requires re-running `server/scripts/regenerate-embeddings.ts` after migration
- The widget is built as a standalone JS bundle that can be embedded on external sites
- CSRF protection is required for all state-changing API requests (use `/api/csrf-token`)
- Environment variables are validated at startup via `server/utils/env.ts`
