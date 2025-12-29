# Database Resilience & Disaster Recovery

This document covers database backup strategy, disaster recovery procedures, and operational guidelines for maintaining database resilience in the ConvoAI platform.

## Table of Contents

- [Backup Strategy](#backup-strategy)
- [Disaster Recovery Plan](#disaster-recovery-plan)
- [Connection Pool Configuration](#connection-pool-configuration)
- [Migration 005 - Embedding Re-generation](#migration-005---embedding-re-generation)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Incident Response](#incident-response)

---

## Backup Strategy

### Automated Backups (Supabase)

Supabase provides automated backups with Point-in-Time Recovery (PITR) for production databases.

#### Enabling Automated Backups

1. **Access Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/[your-project-id]
   - Go to **Settings** → **Database**

2. **Enable Point-in-Time Recovery (PITR)**
   - Location: Database Settings → Backups
   - Enable PITR (available on Pro plan and above)
   - Configuration:
     - **Retention Period**: 7 days (recommended minimum)
     - **Backup Frequency**: Continuous (automatic)
     - **Recovery Granularity**: 1-minute intervals

3. **Verify Backup Status**
   ```bash
   # Check via Supabase CLI (install if needed: npm install -g supabase)
   supabase db dump --db-url "postgresql://..." --file backup-verification.sql
   ```

#### Manual Backup Procedure

For additional safety, create manual backups before major migrations:

```bash
# 1. Export full database schema and data
pg_dump -h aws-1-us-east-1.pooler.supabase.com \
        -U postgres.wvodufqgnnhajcvhnvoa \
        -d postgres \
        -F c \
        -f backup-$(date +%Y%m%d-%H%M%S).dump

# 2. Export schema only (for version control)
pg_dump -h aws-1-us-east-1.pooler.supabase.com \
        -U postgres.wvodufqgnnhajcvhnvoa \
        -d postgres \
        --schema-only \
        -f schema-$(date +%Y%m%d-%H%M%S).sql

# 3. Verify backup integrity
pg_restore --list backup-$(date +%Y%m%d-%H%M%S).dump
```

#### Backup Storage Strategy

**Primary Storage** (Supabase):
- Location: Supabase-managed S3 storage
- Retention: 7 days (PITR)
- Daily snapshots: 30 days

**Secondary Storage** (Manual backups):
- Location: Secure cloud storage (AWS S3, Google Cloud Storage, or similar)
- Retention: 90 days
- Frequency: Weekly + before major changes
- Encryption: AES-256 at rest

**Critical Data Exports**:
```bash
# Export critical tables for offline backup
psql -h aws-1-us-east-1.pooler.supabase.com \
     -U postgres.wvodufqgnnhajcvhnvoa \
     -d postgres \
     -c "COPY (SELECT * FROM users) TO STDOUT WITH CSV HEADER" > users-backup.csv

psql -c "COPY (SELECT * FROM chatbots) TO STDOUT WITH CSV HEADER" > chatbots-backup.csv
psql -c "COPY (SELECT * FROM subscriptions) TO STDOUT WITH CSV HEADER" > subscriptions-backup.csv
```

---

## Disaster Recovery Plan

### Recovery Time Objective (RTO) and Recovery Point Objective (RPO)

**Current Targets:**
- **RTO**: 1 hour (maximum acceptable downtime)
- **RPO**: 5 minutes (maximum acceptable data loss)

**Actual Performance (with PITR enabled):**
- **RTO**: 15-30 minutes
- **RPO**: 1 minute (PITR granularity)

### Disaster Scenarios & Response

#### Scenario 1: Complete Database Loss

**Symptoms**: Application cannot connect to database, all queries fail

**Response Procedure**:

1. **Verify Incident** (5 minutes)
   ```bash
   # Check database connectivity
   psql -h aws-1-us-east-1.pooler.supabase.com \
        -U postgres.wvodufqgnnhajcvhnvoa \
        -d postgres \
        -c "SELECT 1;"
   ```

2. **Contact Supabase Support** (5 minutes)
   - Email: support@supabase.com
   - Dashboard: Create support ticket
   - Priority: Critical/Urgent

3. **Initiate Point-in-Time Recovery** (10-20 minutes)
   - Navigate to Supabase Dashboard → Database → Backups
   - Select PITR recovery point (most recent timestamp before failure)
   - Click "Restore to Point in Time"
   - Confirm recovery operation

4. **Verify Restoration** (5 minutes)
   ```sql
   -- Check latest data
   SELECT MAX(created_at) FROM users;
   SELECT MAX(created_at) FROM chatbots;
   SELECT MAX(created_at) FROM conversations;

   -- Verify record counts
   SELECT
     (SELECT COUNT(*) FROM users) as users,
     (SELECT COUNT(*) FROM chatbots) as chatbots,
     (SELECT COUNT(*) FROM conversations) as conversations;
   ```

5. **Re-run Health Checks**
   ```bash
   curl https://your-app-url.com/api/health
   ```

#### Scenario 2: Data Corruption

**Symptoms**: Incorrect data, missing records, invalid foreign keys

**Response Procedure**:

1. **Identify Corruption Scope** (10 minutes)
   ```sql
   -- Check for orphaned records
   SELECT COUNT(*) FROM chatbots c
   LEFT JOIN users u ON c.user_id = u.id
   WHERE u.id IS NULL;

   -- Check for invalid embeddings
   SELECT COUNT(*) FROM embeddings
   WHERE embedding IS NULL OR array_length(embedding, 1) != 1536;
   ```

2. **Determine Recovery Point** (5 minutes)
   - Review application logs to identify when corruption occurred
   - Select PITR timestamp just before corruption

3. **Perform Selective Recovery** (20-30 minutes)
   - Option A: Full database PITR restore
   - Option B: Restore specific tables from manual backup:
   ```bash
   # Restore single table from dump
   pg_restore -h aws-1-us-east-1.pooler.supabase.com \
              -U postgres.wvodufqgnnhajcvhnvoa \
              -d postgres \
              --table=chatbots \
              backup-20250129.dump
   ```

4. **Validate Data Integrity**
   ```sql
   -- Run integrity checks
   SELECT * FROM check_referential_integrity();

   -- Verify embeddings
   SELECT chatbot_id, COUNT(*)
   FROM embeddings
   GROUP BY chatbot_id
   HAVING COUNT(*) > 0;
   ```

#### Scenario 3: Accidental Data Deletion

**Symptoms**: User reports missing data, chatbot deleted, etc.

**Response Procedure**:

1. **Stop Further Operations** (Immediate)
   - If mass deletion detected, temporarily disable write operations:
   ```typescript
   // Emergency read-only mode (implement in application)
   process.env.READ_ONLY_MODE = "true";
   ```

2. **Identify Deletion Time** (5 minutes)
   - Check audit logs (if available)
   - Review application logs

3. **Point-in-Time Recovery** (15-20 minutes)
   - Use PITR to restore to moment before deletion
   - Alternative: Query from manual backup and re-insert:
   ```sql
   -- Restore deleted records from backup
   INSERT INTO chatbots (id, user_id, name, website_url, ...)
   SELECT id, user_id, name, website_url, ...
   FROM backup_chatbots
   WHERE id IN ('deleted-id-1', 'deleted-id-2');
   ```

---

## Connection Pool Configuration

### Configuration Parameters

The application uses connection pooling to ensure database resilience under load.

**Environment Variables**:

```bash
# Maximum number of connections in pool (default: 20)
DB_POOL_MAX=20

# Minimum number of idle connections (default: 2)
DB_POOL_MIN=2

# Connection timeout in milliseconds (default: 10000)
DB_CONNECTION_TIMEOUT=10000

# Idle connection timeout in milliseconds (default: 30000)
DB_IDLE_TIMEOUT=30000

# Maximum connection lifetime in milliseconds (default: 1800000 - 30 minutes)
DB_MAX_LIFETIME=1800000
```

### Recommended Settings by Environment

**Development**:
```bash
DB_POOL_MAX=5
DB_POOL_MIN=1
DB_CONNECTION_TIMEOUT=5000
DB_IDLE_TIMEOUT=60000
DB_MAX_LIFETIME=300000
```

**Staging**:
```bash
DB_POOL_MAX=10
DB_POOL_MIN=2
DB_CONNECTION_TIMEOUT=10000
DB_IDLE_TIMEOUT=30000
DB_MAX_LIFETIME=1800000
```

**Production**:
```bash
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_CONNECTION_TIMEOUT=10000
DB_IDLE_TIMEOUT=30000
DB_MAX_LIFETIME=1800000
```

**High-Traffic Production**:
```bash
DB_POOL_MAX=50
DB_POOL_MIN=10
DB_CONNECTION_TIMEOUT=15000
DB_IDLE_TIMEOUT=20000
DB_MAX_LIFETIME=900000
```

### Monitoring Connection Pool Health

```typescript
// Check database health programmatically
import { checkDatabaseHealth } from './server/utils/supabase';

const health = await checkDatabaseHealth();
console.log(health); // { healthy: true, latency: 45 }
```

### Supabase Connection Limits

**Free Tier**: 60 concurrent connections
**Pro Tier**: 200 concurrent connections
**Enterprise**: Custom limits

**Best Practice**: Set `DB_POOL_MAX` to 60-70% of your plan's connection limit to allow headroom for admin operations and other services.

---

## Migration 005 - Embedding Re-generation

**CRITICAL**: Migration 005 (security fixes) drops and recreates the `embedding` column in both `embeddings` and `knowledge_base` tables due to moving the `vector` extension from the `public` schema to the `extensions` schema.

### Impact

- **All embeddings in `embeddings` table will be lost**
- **All embeddings in `knowledge_base` table will be lost**
- **Chatbots will need to be re-scraped and re-embedded**
- **Knowledge base entries will need to be re-embedded**

### Pre-Migration Checklist

Before running migration 005:

1. **Create Full Database Backup**
   ```bash
   pg_dump -h aws-1-us-east-1.pooler.supabase.com \
           -U postgres.wvodufqgnnhajcvhnvoa \
           -d postgres \
           -F c \
           -f pre-migration-005-backup.dump
   ```

2. **Export Embedding Metadata**
   ```sql
   -- Save mapping of what needs to be re-embedded
   COPY (
     SELECT chatbot_id, COUNT(*) as embedding_count
     FROM embeddings
     GROUP BY chatbot_id
   ) TO '/tmp/embeddings-inventory.csv' WITH CSV HEADER;

   COPY (
     SELECT chatbot_id, COUNT(*) as kb_count
     FROM knowledge_base
     WHERE embedding IS NOT NULL
     GROUP BY chatbot_id
   ) TO '/tmp/knowledge-base-inventory.csv' WITH CSV HEADER;
   ```

3. **Notify Users** (if applicable)
   - Inform users of planned maintenance
   - Expected downtime: 1-2 hours (depending on data volume)

### Re-generation Procedure

After running migration 005, re-generate all embeddings:

#### Step 1: Re-embed Website Content

```typescript
// server/scripts/regenerate-embeddings.ts
import { supabaseAdmin } from './utils/supabase';
import { generateEmbedding } from './services/embedding';
import logger from './utils/logger';

async function regenerateAllEmbeddings() {
  // Get all chatbots with status 'ready'
  const { data: chatbots, error } = await supabaseAdmin
    .from('chatbots')
    .select('id, name')
    .eq('status', 'ready');

  if (error || !chatbots) {
    logger.error('Failed to fetch chatbots', { error });
    return;
  }

  logger.info(`Re-embedding ${chatbots.length} chatbots`);

  for (const chatbot of chatbots) {
    try {
      // Set status to 'embedding'
      await supabaseAdmin
        .from('chatbots')
        .update({ status: 'embedding' })
        .eq('id', chatbot.id);

      // Get all embeddings (content still exists, just embedding vector is NULL)
      const { data: embeddings } = await supabaseAdmin
        .from('embeddings')
        .select('id, content')
        .eq('chatbot_id', chatbot.id);

      if (!embeddings) continue;

      logger.info(`Re-embedding ${embeddings.length} chunks for chatbot ${chatbot.name}`);

      // Re-generate embeddings in batches of 10
      for (let i = 0; i < embeddings.length; i += 10) {
        const batch = embeddings.slice(i, i + 10);

        await Promise.all(
          batch.map(async (emb) => {
            const embedding = await generateEmbedding(emb.content);

            await supabaseAdmin
              .from('embeddings')
              .update({ embedding })
              .eq('id', emb.id);
          })
        );

        logger.info(`Progress: ${Math.min(i + 10, embeddings.length)}/${embeddings.length}`);
      }

      // Set status back to 'ready'
      await supabaseAdmin
        .from('chatbots')
        .update({ status: 'ready' })
        .eq('id', chatbot.id);

      logger.info(`✓ Completed chatbot ${chatbot.name}`);
    } catch (error) {
      logger.error(`Failed to re-embed chatbot ${chatbot.name}`, { error });
    }
  }

  logger.info('All chatbots re-embedded successfully');
}

// Run the script
regenerateAllEmbeddings().catch(console.error);
```

#### Step 2: Re-embed Knowledge Base

```typescript
// server/scripts/regenerate-knowledge-base.ts
import { supabaseAdmin } from './utils/supabase';
import { generateEmbedding } from './services/embedding';
import logger from './utils/logger';

async function regenerateKnowledgeBaseEmbeddings() {
  // Get all knowledge base entries with enabled=true
  const { data: kbEntries, error } = await supabaseAdmin
    .from('knowledge_base')
    .select('id, question, answer, chatbot_id')
    .eq('enabled', true);

  if (error || !kbEntries) {
    logger.error('Failed to fetch knowledge base entries', { error });
    return;
  }

  logger.info(`Re-embedding ${kbEntries.length} knowledge base entries`);

  for (const entry of kbEntries) {
    try {
      // Combine question and answer for embedding
      const content = `${entry.question}\n${entry.answer}`;
      const embedding = await generateEmbedding(content);

      await supabaseAdmin
        .from('knowledge_base')
        .update({ embedding })
        .eq('id', entry.id);

      logger.info(`✓ Re-embedded KB entry ${entry.id}`);
    } catch (error) {
      logger.error(`Failed to re-embed KB entry ${entry.id}`, { error });
    }
  }

  logger.info('All knowledge base entries re-embedded successfully');
}

// Run the script
regenerateKnowledgeBaseEmbeddings().catch(console.error);
```

#### Step 3: Run Scripts

```bash
# Install dependencies if needed
npm install

# Run embedding regeneration
npm run tsx server/scripts/regenerate-embeddings.ts
npm run tsx server/scripts/regenerate-knowledge-base.ts
```

### Verification

```sql
-- Verify all embeddings are regenerated
SELECT
  'embeddings' as table_name,
  COUNT(*) as total,
  COUNT(embedding) as with_embedding,
  COUNT(*) FILTER (WHERE embedding IS NULL) as missing
FROM embeddings

UNION ALL

SELECT
  'knowledge_base' as table_name,
  COUNT(*) as total,
  COUNT(embedding) as with_embedding,
  COUNT(*) FILTER (WHERE embedding IS NULL AND enabled = true) as missing
FROM knowledge_base;
```

---

## Monitoring & Health Checks

### Automated Health Monitoring

The application includes automated database health checks:

```typescript
import { checkDatabaseHealth } from './server/utils/supabase';
import { registerUptimeCheck } from './server/utils/monitoring';

// Health check runs every 2 minutes
registerUptimeCheck(
  'database',
  async () => {
    const result = await checkDatabaseHealth();
    return result.healthy;
  },
  120000
);
```

### Manual Health Checks

```sql
-- 1. Check database responsiveness
SELECT NOW();

-- 2. Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 3. Check connection count
SELECT COUNT(*) FROM pg_stat_activity;

-- 4. Check for long-running queries
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - pg_stat_activity.query_start > interval '5 minutes'
ORDER BY duration DESC;

-- 5. Check for table bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  n_live_tup,
  n_dead_tup,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY dead_pct DESC;
```

### Metrics Dashboard

Access real-time metrics:

```bash
# GET /api/monitoring/metrics
curl https://your-app-url.com/api/monitoring/metrics
```

Response includes:
- Database latency
- Connection pool status
- Query performance metrics
- Error rates

---

## Incident Response

### Severity Levels

**P0 - Critical** (RTO: 1 hour)
- Complete database outage
- Data corruption affecting > 10% of data
- Security breach

**P1 - High** (RTO: 4 hours)
- Degraded database performance (> 2s query times)
- Backup failure
- Connection pool exhaustion

**P2 - Medium** (RTO: 1 day)
- Slow queries affecting specific features
- Missing indexes
- Minor data inconsistencies

**P3 - Low** (RTO: 1 week)
- Optimization opportunities
- Schema improvements
- Documentation updates

### Escalation Contacts

1. **Database Administrator**: [Your DBA contact]
2. **DevOps Lead**: [Your DevOps contact]
3. **Supabase Support**: support@supabase.com
4. **On-call Engineer**: [Pager duty / on-call rotation]

### Post-Incident Review

After resolving any P0 or P1 incident:

1. Document what happened
2. Identify root cause
3. Implement preventive measures
4. Update runbooks
5. Conduct team retrospective

---

## Testing Disaster Recovery

**Frequency**: Quarterly

**Test Procedure**:

1. Create test restoration in separate database
2. Perform PITR recovery
3. Verify data integrity
4. Measure actual RTO/RPO
5. Document any issues
6. Update procedures based on findings

**Next Scheduled Test**: [Set date 3 months from now]

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-01-29 | Initial documentation created | Claude AI |
| | Connection pooling implemented | |
| | Health checks added | |
| | Migration 005 procedure documented | |

---

## Additional Resources

- [Supabase Backup Documentation](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL PITR Recovery](https://www.postgresql.org/docs/current/continuous-archiving.html)
- [Database Connection Pooling Best Practices](https://www.postgresql.org/docs/current/runtime-config-connection.html)
