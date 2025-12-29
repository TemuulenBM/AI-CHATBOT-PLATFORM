# Database Resilience - Quick Reference

Quick commands and procedures for common database resilience operations.

## Health Checks

### Check Database Connectivity
```bash
psql -h aws-1-us-east-1.pooler.supabase.com \
     -U postgres.wvodufqgnnhajcvhnvoa \
     -d postgres \
     -c "SELECT NOW();"
```

### Application Health Check
```bash
curl https://your-app-url.com/api/health
```

### Check Connection Pool Status
```typescript
import { checkDatabaseHealth } from './server/utils/supabase';
const health = await checkDatabaseHealth();
console.log(health); // { healthy: true, latency: 45 }
```

## Backup Operations

### Create Manual Backup
```bash
pg_dump -h aws-1-us-east-1.pooler.supabase.com \
        -U postgres.wvodufqgnnhajcvhnvoa \
        -d postgres \
        -F c \
        -f backup-$(date +%Y%m%d).dump
```

### Verify Backup
```bash
pg_restore --list backup-20250129.dump
```

### Export Critical Tables
```bash
psql -c "COPY (SELECT * FROM users) TO STDOUT WITH CSV HEADER" > users.csv
psql -c "COPY (SELECT * FROM chatbots) TO STDOUT WITH CSV HEADER" > chatbots.csv
psql -c "COPY (SELECT * FROM subscriptions) TO STDOUT WITH CSV HEADER" > subscriptions.csv
```

## Restore Operations

### Full Database Restore
```bash
pg_restore --clean --if-exists -d postgres backup.dump
```

### Restore Single Table
```bash
pg_restore --table=chatbots -d postgres backup.dump
```

### Point-in-Time Recovery (Supabase Dashboard)
1. Navigate to Settings → Database → Backups
2. Click "Restore to Point in Time"
3. Select timestamp before incident
4. Confirm restoration

## Embedding Regeneration

### After Migration 005

**Re-embed all chatbots:**
```bash
npm run tsx server/scripts/regenerate-embeddings.ts
```

**Re-embed specific chatbot:**
```bash
npm run tsx server/scripts/regenerate-embeddings.ts --chatbot-id=<uuid>
```

**Re-embed knowledge base:**
```bash
npm run tsx server/scripts/regenerate-knowledge-base.ts
```

**Dry run (preview):**
```bash
npm run tsx server/scripts/regenerate-embeddings.ts --dry-run
```

## Connection Pool Configuration

### Environment Variables
```bash
# Production settings
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_CONNECTION_TIMEOUT=10000
DB_IDLE_TIMEOUT=30000
DB_MAX_LIFETIME=1800000
```

### View Current Connections
```sql
SELECT COUNT(*) FROM pg_stat_activity;
```

### Kill Long-Running Queries
```sql
-- Find long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - query_start > interval '5 minutes';

-- Kill specific query
SELECT pg_terminate_backend(pid);
```

## Monitoring

### Database Metrics
```sql
-- Table sizes
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Dead tuples (needs VACUUM)
SELECT
  schemaname,
  tablename,
  n_live_tup,
  n_dead_tup,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY dead_pct DESC;
```

### Data Integrity Checks
```sql
-- Check for orphaned chatbots
SELECT COUNT(*) FROM chatbots c
LEFT JOIN users u ON c.user_id = u.id
WHERE u.id IS NULL;

-- Check for null embeddings
SELECT COUNT(*) FROM embeddings WHERE embedding IS NULL;
SELECT COUNT(*) FROM knowledge_base WHERE enabled = true AND embedding IS NULL;

-- Check subscription consistency
SELECT COUNT(*) FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
WHERE s.user_id IS NULL;
```

## Incident Response

### P0 - Database Outage (RTO: 1 hour)

1. **Verify incident** (2 min)
   ```bash
   psql -c "SELECT 1;"
   ```

2. **Check Supabase status** (1 min)
   - https://status.supabase.com

3. **Initiate PITR** (15-30 min)
   - Dashboard → Backups → Restore

4. **Verify restoration** (5 min)
   ```sql
   SELECT MAX(created_at) FROM users;
   SELECT COUNT(*) FROM chatbots;
   ```

### P1 - Data Corruption

1. **Identify scope** (10 min)
   ```sql
   -- Run integrity checks (see above)
   ```

2. **Stop writes** (immediate)
   ```typescript
   process.env.READ_ONLY_MODE = "true";
   ```

3. **Restore from PITR** (20 min)
   - Select recovery point before corruption

4. **Validate** (10 min)
   ```sql
   -- Verify data integrity
   SELECT * FROM check_referential_integrity();
   ```

### P2 - Slow Queries

1. **Identify slow queries**
   ```sql
   SELECT query, mean_exec_time
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

2. **Add missing indexes**
   ```sql
   CREATE INDEX CONCURRENTLY idx_name ON table(column);
   ```

3. **Optimize query**
   ```sql
   EXPLAIN ANALYZE <slow-query>;
   ```

## Testing

### Run Backup/Restore Test
```bash
./server/scripts/test-backup-restore.sh \
  --test-db-url "postgresql://test-db-url" \
  --backup-dir ./backups
```

### Verify Embeddings After Migration
```sql
SELECT
  'embeddings' as table_name,
  COUNT(*) as total,
  COUNT(embedding) as with_embedding
FROM embeddings
UNION ALL
SELECT
  'knowledge_base',
  COUNT(*),
  COUNT(embedding)
FROM knowledge_base WHERE enabled = true;
```

## Contacts

- **Supabase Support**: support@supabase.com
- **Dashboard**: https://supabase.com/dashboard
- **Status Page**: https://status.supabase.com

## Documentation

- [Full Documentation](./DATABASE_RESILIENCE.md)
- [Backup Setup Guide](./SUPABASE_BACKUP_SETUP.md)
- [Migration 005 Details](../supabase/migrations/005_security_fixes.sql)
