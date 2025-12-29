# Supabase Backup Setup Guide

This guide walks you through enabling and configuring automated backups for your Supabase database.

## Prerequisites

- Supabase Pro plan or higher (PITR requires Pro+)
- Admin access to Supabase dashboard
- Production database running

## Step-by-Step Setup

### 1. Enable Point-in-Time Recovery (PITR)

PITR is the most reliable backup method for production databases.

#### 1.1 Access Database Settings

1. Log in to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings** → **Database**
4. Scroll to **Backups** section

#### 1.2 Enable PITR

1. Click **Enable Point-in-Time Recovery**
2. Review the pricing (typically $0.125/GB/month)
3. Confirm enablement

**Expected Configuration:**
- Retention: 7 days minimum (configurable up to 30 days)
- Recovery granularity: 1-minute intervals
- Storage: Automated S3 backups
- Restore time: 10-30 minutes

### 2. Configure Daily Snapshots

In addition to PITR, enable daily snapshots for long-term retention.

#### 2.1 Enable Daily Backups

1. In the same **Backups** section
2. Enable **Daily Backups**
3. Set retention period: **30 days** (recommended)

#### 2.2 Configure Backup Schedule

- Backups run automatically at 00:00 UTC
- To change timing, contact Supabase support

### 3. Verify Backup Configuration

#### 3.1 Check Backup Status

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Check backup status
supabase db dump --project-ref your-project-ref
```

#### 3.2 Test Backup Creation

1. Navigate to **Settings** → **Database** → **Backups**
2. Click **Create Backup** to trigger manual backup
3. Wait for backup to complete (usually 1-5 minutes)
4. Verify backup appears in the list

### 4. Set Up Backup Alerts

#### 4.1 Configure Email Alerts

1. Go to **Settings** → **Notifications**
2. Enable **Backup Failure Alerts**
3. Add notification emails:
   - DevOps team email
   - On-call engineer email

#### 4.2 Webhook Notifications (Optional)

For Slack/Discord notifications:

1. Navigate to **Settings** → **Webhooks**
2. Click **Create Webhook**
3. Configure:
   - Event: `backup.failed`
   - URL: Your webhook endpoint
   - Secret: Generate secure secret

Example webhook handler:

```typescript
// server/webhooks/backup-notifications.ts
import { Request, Response } from 'express';
import logger from '../utils/logger';

export async function handleBackupWebhook(req: Request, res: Response) {
  const { event, data } = req.body;

  if (event === 'backup.failed') {
    logger.error('Database backup failed', {
      timestamp: data.timestamp,
      error: data.error,
      project: data.project_ref,
    });

    // Send alert to Slack/PagerDuty/etc.
    await sendCriticalAlert({
      title: '🚨 Database Backup Failed',
      message: `Backup failed at ${data.timestamp}`,
      severity: 'critical',
    });
  }

  res.status(200).json({ received: true });
}
```

### 5. Document Backup Configuration

Create a record of your backup settings:

```yaml
# backup-configuration.yml
backup_strategy:
  provider: Supabase
  pitr:
    enabled: true
    retention_days: 7
    granularity: 1_minute
  daily_snapshots:
    enabled: true
    retention_days: 30
    schedule: "0 0 * * *"  # Daily at midnight UTC

  manual_backups:
    frequency: weekly
    storage: s3://your-backup-bucket
    retention_days: 90
    encryption: AES-256

recovery_targets:
  rto: 1_hour
  rpo: 5_minutes

contacts:
  primary: devops@yourcompany.com
  secondary: oncall@yourcompany.com
  supabase_support: support@supabase.com

last_tested: 2025-01-29
next_test_date: 2025-04-29
```

### 6. Configure Offsite Backups (Optional but Recommended)

For additional redundancy, set up weekly exports to external storage.

#### 6.1 Create Backup Export Script

```bash
#!/bin/bash
# backup-to-s3.sh

set -e

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="backup-$TIMESTAMP.dump"
S3_BUCKET="s3://your-backup-bucket/postgres"

# Create backup
pg_dump -h aws-1-us-east-1.pooler.supabase.com \
        -U postgres.wvodufqgnnhajcvhnvoa \
        -d postgres \
        -F c \
        -f "$BACKUP_FILE"

# Encrypt backup
openssl enc -aes-256-cbc \
  -salt \
  -in "$BACKUP_FILE" \
  -out "$BACKUP_FILE.enc" \
  -pass "env:BACKUP_ENCRYPTION_KEY"

# Upload to S3
aws s3 cp "$BACKUP_FILE.enc" "$S3_BUCKET/$BACKUP_FILE.enc"

# Cleanup local files
rm "$BACKUP_FILE" "$BACKUP_FILE.enc"

echo "Backup completed: $S3_BUCKET/$BACKUP_FILE.enc"
```

#### 6.2 Schedule with Cron

```bash
# Add to crontab
crontab -e

# Run every Sunday at 2 AM
0 2 * * 0 /path/to/backup-to-s3.sh >> /var/log/backup.log 2>&1
```

Or use GitHub Actions for automated backups:

```yaml
# .github/workflows/database-backup.yml
name: Database Backup

on:
  schedule:
    - cron: '0 2 * * 0'  # Every Sunday at 2 AM UTC
  workflow_dispatch:  # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install PostgreSQL client
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client

      - name: Create backup
        env:
          PGPASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: |
          pg_dump -h aws-1-us-east-1.pooler.supabase.com \
                  -U postgres.wvodufqgnnhajcvhnvoa \
                  -d postgres \
                  -F c \
                  -f backup.dump

      - name: Upload to S3
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Sync to S3
        run: |
          TIMESTAMP=$(date +%Y%m%d-%H%M%S)
          aws s3 cp backup.dump s3://your-backup-bucket/postgres/backup-$TIMESTAMP.dump
```

### 7. Test Backup Restoration

**Critical**: Test your backups quarterly to ensure they work.

```bash
# Run the automated test script
./server/scripts/test-backup-restore.sh \
  --test-db-url "postgresql://test-database-url" \
  --backup-dir ./backups
```

Document test results:

```markdown
## Backup Test Results

**Date**: 2025-01-29
**Tester**: DevOps Team

### Test 1: Full Backup Creation
- Status: ✅ PASSED
- Duration: 3 minutes
- Backup Size: 245 MB

### Test 2: PITR Recovery
- Status: ✅ PASSED
- Recovery Point: 2025-01-29 14:30:00 UTC
- Recovery Duration: 18 minutes
- Data Loss: 0 records

### Test 3: Selective Table Restore
- Status: ✅ PASSED
- Tables Restored: chatbots, embeddings
- Duration: 5 minutes

### Measured Metrics
- RTO (Actual): 18 minutes ✅ (Target: 60 minutes)
- RPO (Actual): 1 minute ✅ (Target: 5 minutes)

### Next Test Date
2025-04-29
```

## Monitoring Backup Health

### Daily Checks

Add to your monitoring dashboard:

```typescript
// server/monitoring/backup-health.ts
import { supabaseAdmin } from '../utils/supabase';

export async function checkBackupHealth() {
  // Check last backup timestamp
  const lastBackup = await getLastBackupTime();
  const hoursSinceBackup = (Date.now() - lastBackup.getTime()) / (1000 * 60 * 60);

  if (hoursSinceBackup > 25) {
    alertCritical('backup_stale', 'No backup in 25+ hours');
  }

  return {
    healthy: hoursSinceBackup < 25,
    lastBackup,
    hoursSinceBackup,
  };
}
```

### Weekly Reports

Generate weekly backup reports:

```bash
# weekly-backup-report.sh
#!/bin/bash

echo "=== Weekly Backup Report ==="
echo "Period: $(date -d '7 days ago' +%Y-%m-%d) to $(date +%Y-%m-%d)"
echo ""
echo "PITR Status: Enabled"
echo "Retention: 7 days"
echo "Total Backups: $(aws s3 ls s3://your-backup-bucket/postgres/ | wc -l)"
echo "Storage Used: $(aws s3 ls s3://your-backup-bucket/postgres/ --recursive --summarize | grep 'Total Size' | awk '{print $3}')"
echo ""
echo "Last 5 Backups:"
aws s3 ls s3://your-backup-bucket/postgres/ | tail -5
```

## Troubleshooting

### Backup Failed

**Symptom**: Backup job fails in Supabase dashboard

**Solutions**:
1. Check database disk space
2. Verify PITR is enabled on Pro+ plan
3. Check Supabase service status: https://status.supabase.com
4. Contact support with error message

### Slow Backup Performance

**Symptom**: Backups take longer than 10 minutes

**Solutions**:
1. Run `VACUUM FULL` on large tables during maintenance window
2. Consider increasing database resources
3. Use parallel dump: `pg_dump -j 4` (4 parallel workers)

### Cannot Restore Backup

**Symptom**: `pg_restore` fails with errors

**Solutions**:
1. Verify backup file integrity: `pg_restore --list backup.dump`
2. Check PostgreSQL version compatibility
3. Use `--clean --if-exists` flags: `pg_restore --clean --if-exists -d postgres backup.dump`
4. Restore schema first, then data separately

## Compliance & Security

### Encryption

- All Supabase backups are encrypted at rest (AES-256)
- Use SSL/TLS for database connections
- Encrypt manual backups before uploading to S3

### Access Control

- Limit backup access to DevOps team
- Use IAM roles for S3 access (no static credentials)
- Enable MFA for Supabase dashboard access

### Retention Policy

- PITR: 7 days
- Daily snapshots: 30 days
- Weekly exports: 90 days
- Annual archives: 7 years (if required by compliance)

## Cost Estimation

**Supabase PITR** (Pro plan):
- Base: $25/month
- PITR Storage: ~$0.125/GB/month
- Example: 100GB database = $25 + $12.50 = $37.50/month

**S3 Storage** (optional offsite):
- Standard: ~$0.023/GB/month
- Glacier: ~$0.004/GB/month (for long-term archives)
- Example: 100GB × 4 weekly backups = 400GB = $9.20/month (Standard)

**Total Estimated Cost**: ~$50-75/month for comprehensive backup strategy

## References

- [Supabase Backups Documentation](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL Backup & Restore](https://www.postgresql.org/docs/current/backup.html)
- [AWS S3 Backup Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/backup-for-s3.html)
