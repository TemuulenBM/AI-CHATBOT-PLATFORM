# Widget Analytics System

## Overview

Industry-standard analytics implementation for tracking widget usage, user behavior, and performance metrics. Built following best practices from Google Analytics, Mixpanel, and Segment.

## Features

- ✅ **Event Tracking** - Track any custom event with properties
- ✅ **Session Management** - Automatic session tracking with 30-minute timeout
- ✅ **User Identification** - Anonymous and identified user tracking
- ✅ **Traffic Source Attribution** - UTM parameters, referrers, landing pages
- ✅ **Device & Browser Detection** - Automatic parsing of user agents
- ✅ **Performance Metrics** - Response times, load times, errors
- ✅ **Data Retention** - Automatic cleanup with configurable retention
- ✅ **Batch Processing** - Efficient event batching to reduce database load
- ✅ **Privacy Compliant** - GDPR-friendly data handling

---

## Architecture

### 1. Data Storage

**Three-tier storage for optimal performance:**

#### Raw Events (`widget_events`)
- Detailed event stream
- Retention: **90 days**
- Use for: Detailed analysis, debugging, event replay

#### Sessions (`widget_sessions`)
- Session summaries with aggregated metrics
- Retention: **1 year**
- Use for: User behavior analysis, conversion tracking

#### Daily Stats (`widget_daily_stats`)
- Pre-aggregated daily metrics
- Retention: **Indefinite**
- Use for: Fast dashboard queries, historical trends

### 2. Event Batching

Events are batched to reduce database writes:
- **Batch size**: 100 events
- **Flush interval**: 5 seconds
- **Auto-flush**: On process exit

### 3. Session Timeout

- **Timeout**: 30 minutes of inactivity (industry standard)
- **Auto-end**: Sessions automatically closed on timeout
- **Memory tracking**: Active sessions tracked in-memory for performance

---

## Database Schema

### widget_events

```sql
id                 UUID PRIMARY KEY
chatbot_id         UUID (references chatbots)
session_id         TEXT
event_name         TEXT                  -- e.g., 'widget_loaded', 'message_sent'
event_category     TEXT                  -- 'engagement', 'performance', 'error', 'system'
properties         JSONB                 -- Flexible event data
page_url           TEXT
page_title         TEXT
timestamp          TIMESTAMPTZ
client_timestamp   TIMESTAMPTZ
created_at         TIMESTAMPTZ
```

**Indexes:**
- `(chatbot_id, created_at DESC)` - Fast queries by chatbot
- `(session_id, created_at DESC)` - Session timeline
- `(event_name, created_at DESC)` - Event analysis
- GIN index on `properties` - Fast property queries

### widget_sessions

```sql
id                          UUID PRIMARY KEY
chatbot_id                  UUID
session_id                  TEXT UNIQUE
anonymous_id                TEXT               -- Persistent visitor ID
user_id                     TEXT               -- Set via identify()
user_email                  TEXT
user_name                   TEXT
user_metadata               JSONB
started_at                  TIMESTAMPTZ
ended_at                    TIMESTAMPTZ
duration_seconds            INT
referrer                    TEXT
landing_page                TEXT
utm_source/medium/campaign  TEXT
browser_name/version        TEXT
os_name/version             TEXT
device_type                 TEXT               -- desktop, mobile, tablet
screen_width/height         INT
ip_address                  INET
country_code                TEXT
city                        TEXT
messages_sent               INT
messages_received           INT
widget_opened_count         INT
widget_minimized_count      INT
avg_response_time_ms        INT
had_conversation            BOOLEAN
completed_pre_chat_form     BOOLEAN
triggered_by                TEXT
created_at                  TIMESTAMPTZ
updated_at                  TIMESTAMPTZ
```

### widget_daily_stats

```sql
id                             UUID PRIMARY KEY
chatbot_id                     UUID
stat_date                      DATE
total_sessions                 INT
unique_visitors                INT
new_visitors                   INT
returning_visitors             INT
total_conversations            INT
total_messages_sent            INT
total_messages_received        INT
avg_messages_per_session       NUMERIC
avg_session_duration_seconds   INT
widget_loads                   INT
widget_opens                   INT
conversion_rate                NUMERIC         -- % sessions with conversations
avg_response_time_ms           INT
error_count                    INT
top_referrers                  JSONB
top_landing_pages              JSONB
utm_sources                    JSONB
desktop/mobile/tablet_sessions INT
created_at                     TIMESTAMPTZ
updated_at                     TIMESTAMPTZ

UNIQUE (chatbot_id, stat_date)
```

---

## API Endpoints

All endpoints require authentication (`Authorization: Bearer <token>`)

### GET /api/analytics/widget/:chatbotId/summary

Get high-level session summary.

**Query Parameters:**
- `days` (optional) - Number of days to include (default: 30)

**Response:**
```json
{
  "chatbot_id": "uuid",
  "period_days": 30,
  "summary": {
    "total_sessions": 1250,
    "unique_visitors": 892,
    "total_conversations": 567,
    "avg_session_duration_seconds": 145,
    "conversion_rate": 45.36
  }
}
```

### GET /api/analytics/widget/:chatbotId/trends

Get daily trend data.

**Query Parameters:**
- `days` (optional) - Number of days (default: 30)

**Response:**
```json
{
  "chatbot_id": "uuid",
  "period_days": 30,
  "trends": [
    {
      "stat_date": "2024-01-15",
      "sessions": 42,
      "conversations": 18,
      "messages": 156,
      "conversion_rate": 42.86
    }
  ]
}
```

### GET /api/analytics/widget/:chatbotId/events

Get top events by frequency.

**Query Parameters:**
- `days` (optional) - Number of days (default: 7)
- `limit` (optional) - Max results (default: 10, max: 100)

**Response:**
```json
{
  "chatbot_id": "uuid",
  "period_days": 7,
  "events": [
    {
      "event_name": "widget_opened",
      "event_count": 1523,
      "unique_sessions": 892
    }
  ]
}
```

### GET /api/analytics/widget/:chatbotId/active

Get real-time active sessions count.

**Response:**
```json
{
  "chatbot_id": "uuid",
  "active_sessions": 12,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### GET /api/analytics/widget/:chatbotId/sessions

Get recent sessions with pagination.

**Query Parameters:**
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Results per page (default: 20, max: 100)

**Response:**
```json
{
  "chatbot_id": "uuid",
  "page": 1,
  "limit": 20,
  "total": 1250,
  "sessions": [...]
}
```

### GET /api/analytics/widget/:chatbotId/traffic-sources

Get traffic source breakdown.

**Query Parameters:**
- `days` (optional) - Number of days (default: 30)

**Response:**
```json
{
  "chatbot_id": "uuid",
  "period_days": 30,
  "utm_sources": [
    { "source": "google", "count": 432 },
    { "source": "facebook", "count": 198 }
  ],
  "referrers": [
    { "domain": "google.com", "count": 567 },
    { "domain": "direct", "count": 321 }
  ]
}
```

### GET /api/analytics/widget/:chatbotId/devices

Get device/browser/OS breakdown.

**Query Parameters:**
- `days` (optional) - Number of days (default: 30)

**Response:**
```json
{
  "chatbot_id": "uuid",
  "period_days": 30,
  "devices": [
    { "type": "desktop", "count": 892 },
    { "type": "mobile", "count": 358 }
  ],
  "browsers": [
    { "name": "Chrome", "count": 756 },
    { "name": "Safari", "count": 321 }
  ],
  "operating_systems": [
    { "name": "Windows", "count": 567 },
    { "name": "macOS", "count": 325 }
  ]
}
```

---

## Widget Integration

### Sending Events from Widget

```typescript
// Track custom event
await fetch('/widget/analytics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chatbotId: 'xxx',
    sessionId: 'yyy',
    events: [
      {
        event_name: 'button_clicked',
        event_category: 'engagement',
        properties: {
          button_id: 'send_message',
          button_text: 'Send'
        },
        page_url: window.location.href,
        page_title: document.title,
        client_timestamp: new Date().toISOString()
      }
    ]
  })
});
```

### Standard Events

**Recommended event names:**

| Event Name | Category | Description |
|------------|----------|-------------|
| `widget_loaded` | system | Widget initialized |
| `widget_opened` | engagement | User opened widget |
| `widget_minimized` | engagement | User minimized widget |
| `message_sent` | engagement | User sent message |
| `message_received` | engagement | Bot responded |
| `pre_chat_form_shown` | engagement | Pre-chat form displayed |
| `pre_chat_form_submitted` | engagement | Form completed |
| `feedback_given` | engagement | User rated conversation |
| `widget_error` | error | JavaScript error occurred |
| `api_error` | error | API request failed |
| `slow_response` | performance | Response >3 seconds |

---

## Server-Side Usage

### Track Event

```typescript
import * as widgetAnalytics from './services/widget-analytics';

await widgetAnalytics.trackEvent(chatbotId, sessionId, {
  event_name: 'message_sent',
  event_category: 'engagement',
  properties: {
    message_length: 150,
    has_attachment: false
  }
});
```

### Create/Update Session

```typescript
const { session_id, is_new } = await widgetAnalytics.createOrUpdateSession(
  chatbotId,
  {
    session_id: 'xxx',
    anonymous_id: 'visitor_123',
    referrer: 'https://google.com',
    landing_page: '/pricing',
    utm_source: 'google',
    utm_campaign: 'winter_sale',
    user_agent: req.headers['user-agent'],
    screen_width: 1920,
    screen_height: 1080,
    ip_address: req.ip
  }
);
```

### Identify User

```typescript
await widgetAnalytics.identifySession(sessionId, {
  user_id: 'user_123',
  user_email: 'user@example.com',
  user_name: 'John Doe',
  user_metadata: {
    plan: 'pro',
    signup_date: '2024-01-01'
  }
});
```

### Increment Counters

```typescript
// When user sends message
await widgetAnalytics.incrementSessionMessages(sessionId, 'sent');

// When bot responds
await widgetAnalytics.incrementSessionMessages(sessionId, 'received');

// When widget opened
await widgetAnalytics.incrementSessionInteraction(sessionId, 'opened');
```

---

## Data Retention & Cleanup

### Automatic Cleanup Job

Runs daily at 2 AM UTC:

1. **Delete old events** (>90 days)
2. **Delete old sessions** (>1 year)
3. **Generate daily statistics** (aggregates yesterday's data)

### Manual Cleanup

```typescript
import { triggerCleanup } from './jobs/widget-analytics-cleanup';

// Trigger cleanup manually
const job = await triggerCleanup();
```

### Retention Policies

| Data Type | Retention | Reason |
|-----------|-----------|--------|
| Raw events | 90 days | Detailed analysis, debugging |
| Sessions | 1 year | Compliance, user analysis |
| Daily stats | Indefinite | Small footprint, historical trends |

---

## Performance Considerations

### Event Batching

Events are batched to reduce database writes:
- **Write frequency**: Max every 5 seconds OR every 100 events
- **Memory overhead**: ~10KB per 100 events
- **Database impact**: 20x fewer writes vs. real-time

### Query Optimization

**Use daily stats for dashboards:**
```typescript
// ❌ Slow: Query raw sessions
const sessions = await supabase
  .from('widget_sessions')
  .select('*')
  .eq('chatbot_id', id)
  .gte('created_at', '30 days ago');

// ✅ Fast: Query pre-aggregated stats
const stats = await supabase
  .from('widget_daily_stats')
  .select('*')
  .eq('chatbot_id', id)
  .gte('stat_date', '30 days ago');
```

### Indexes

All common query patterns are indexed:
- Chatbot + date range queries
- Session lookups
- Event name filtering
- JSONB property searches (GIN index)

---

## Privacy & GDPR Compliance

### Data Collection

**Collected automatically:**
- Session IDs (random, not personally identifiable)
- Anonymous IDs (persistent cookie, can be disabled)
- User agent, screen size, IP address
- Page URLs, referrers

**Collected on request:**
- User ID, email, name (via `identify()`)
- Custom metadata

### User Rights

**Right to be forgotten:**
```sql
-- Delete all data for a user
DELETE FROM widget_events WHERE session_id IN (
  SELECT session_id FROM widget_sessions WHERE user_id = 'xxx'
);
DELETE FROM widget_sessions WHERE user_id = 'xxx';
```

**Data export:**
```sql
-- Export user's data
SELECT * FROM widget_sessions WHERE user_id = 'xxx';
SELECT * FROM widget_events WHERE session_id IN (
  SELECT session_id FROM widget_sessions WHERE user_id = 'xxx'
);
```

### IP Address Handling

IP addresses are stored for:
- Geolocation (country/city)
- Fraud detection
- Security analysis

**To anonymize IPs:**
```sql
UPDATE widget_sessions SET ip_address = NULL WHERE created_at < NOW() - INTERVAL '30 days';
```

---

## Troubleshooting

### Events not appearing

1. **Check batch status**: Events are batched (5s delay)
2. **Check Redis connection**: Batching requires Redis
3. **Check database permissions**: Ensure INSERT permissions
4. **Check logs**: Search for "Failed to flush event batch"

### Session not tracking

1. **Verify session_id**: Must be unique and persistent
2. **Check timeout**: Sessions timeout after 30 minutes
3. **Check database**: Look for errors in `widget_sessions` table

### High database load

1. **Verify batching enabled**: Check event flush logs
2. **Use daily stats**: Query `widget_daily_stats` instead of raw data
3. **Add indexes**: Check slow query log
4. **Increase batch size**: Modify `MAX_BATCH_SIZE` constant

---

## Migration Guide

### Run Migration

```bash
# Apply database schema
psql $DATABASE_URL -f supabase/migrations/010b_widget_analytics.sql
```

### Verify Tables

```sql
-- Check tables exist
\dt widget_*

-- Check indexes
\di widget_*

-- Check functions
\df get_widget_*
```

### Test Analytics

```bash
# Start server (initializes cleanup job)
npm run dev

# Check logs for:
# - "Analytics cleanup job scheduled"
# - Event batching activity
```

---

## Best Practices

### Event Naming

- Use **snake_case**: `button_clicked`, not `buttonClicked`
- Be **specific**: `checkout_completed`, not `action`
- Use **past tense**: `page_viewed`, not `page_view`
- Namespace **categories**: `engagement`, `error`, `performance`

### Properties

- **Keep small**: <1KB per event ideal
- **Use consistent types**: Don't mix strings and numbers
- **Avoid PII**: No emails, phone numbers in properties
- **Index frequently queried fields**: Use dedicated columns

### Performance

- **Batch events**: Send 10-50 events at once
- **Debounce rapid events**: Don't track every keystroke
- **Use daily stats**: Query aggregates, not raw events
- **Set appropriate retention**: Don't keep data forever

---

## Support

For issues or questions:
- Check logs: `server/utils/logger.ts`
- Review code: `server/services/widget-analytics.ts`
- Database schema: `supabase/migrations/010b_widget_analytics.sql`
- API routes: `server/routes/widget-analytics.ts`
