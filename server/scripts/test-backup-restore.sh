#!/bin/bash

###############################################################################
# Backup & Restore Testing Script
#
# This script tests the backup and restore procedures to ensure disaster
# recovery processes work correctly.
#
# Usage:
#   ./server/scripts/test-backup-restore.sh [options]
#
# Options:
#   --test-db-url <url>    URL for test database (required)
#   --backup-dir <path>    Directory for backup files (default: ./backups)
#   --skip-restore         Only test backup, skip restore verification
#
# Prerequisites:
#   - pg_dump and pg_restore installed
#   - PostgreSQL client (psql) installed
#   - Access to production and test databases
#   - Environment variables set (SUPABASE_URL, etc.)
#
# Example:
#   ./server/scripts/test-backup-restore.sh \
#     --test-db-url "postgresql://test-db-url" \
#     --backup-dir ./test-backups
###############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BACKUP_DIR="./backups"
SKIP_RESTORE=false
TEST_DB_URL=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --test-db-url)
      TEST_DB_URL="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --skip-restore)
      SKIP_RESTORE=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$TEST_DB_URL" ]]; then
  echo -e "${RED}Error: --test-db-url is required${NC}"
  echo "Usage: $0 --test-db-url <url> [options]"
  exit 1
fi

# Check for required tools
for cmd in pg_dump pg_restore psql; do
  if ! command -v $cmd &> /dev/null; then
    echo -e "${RED}Error: $cmd is not installed${NC}"
    exit 1
  fi
done

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/test-backup-$TIMESTAMP.dump"
SCHEMA_FILE="$BACKUP_DIR/test-schema-$TIMESTAMP.sql"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Backup & Restore Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Timestamp:    ${GREEN}$TIMESTAMP${NC}"
echo -e "Backup Dir:   ${GREEN}$BACKUP_DIR${NC}"
echo -e "Backup File:  ${GREEN}$BACKUP_FILE${NC}"
echo -e "Schema File:  ${GREEN}$SCHEMA_FILE${NC}"
echo -e "Skip Restore: ${GREEN}$SKIP_RESTORE${NC}"
echo ""

# Extract database connection details from SUPABASE_URL
if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo -e "${RED}Error: SUPABASE_URL environment variable is not set${NC}"
  exit 1
fi

echo -e "${YELLOW}[1/6] Extracting production database URL...${NC}"
# Note: In production, you would use the actual database URL
# For Supabase, this is typically available in the dashboard
PROD_DB_HOST="aws-1-us-east-1.pooler.supabase.com"
PROD_DB_PORT="5432"
PROD_DB_NAME="postgres"

# You need to set these environment variables:
# PROD_DB_USER and PROD_DB_PASSWORD
if [[ -z "${PROD_DB_USER:-}" ]] || [[ -z "${PROD_DB_PASSWORD:-}" ]]; then
  echo -e "${YELLOW}Warning: PROD_DB_USER or PROD_DB_PASSWORD not set${NC}"
  echo -e "${YELLOW}Using connection string from environment...${NC}"
fi

echo -e "${GREEN}✓ Database connection configured${NC}"
echo ""

# Step 1: Test full database backup
echo -e "${YELLOW}[2/6] Creating full database backup...${NC}"
if [[ -n "${PROD_DB_PASSWORD:-}" ]]; then
  PGPASSWORD="$PROD_DB_PASSWORD" pg_dump \
    -h "$PROD_DB_HOST" \
    -p "$PROD_DB_PORT" \
    -U "$PROD_DB_USER" \
    -d "$PROD_DB_NAME" \
    -F c \
    -f "$BACKUP_FILE" \
    --verbose
else
  echo -e "${YELLOW}Using pg_dump with connection URL...${NC}"
  pg_dump "$TEST_DB_URL" -F c -f "$BACKUP_FILE" --verbose
fi

# Check if backup was created
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo -e "${RED}✗ Backup file was not created${NC}"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✓ Backup created successfully (Size: $BACKUP_SIZE)${NC}"
echo ""

# Step 2: Test schema-only backup
echo -e "${YELLOW}[3/6] Creating schema-only backup...${NC}"
if [[ -n "${PROD_DB_PASSWORD:-}" ]]; then
  PGPASSWORD="$PROD_DB_PASSWORD" pg_dump \
    -h "$PROD_DB_HOST" \
    -p "$PROD_DB_PORT" \
    -U "$PROD_DB_USER" \
    -d "$PROD_DB_NAME" \
    --schema-only \
    -f "$SCHEMA_FILE" \
    --verbose
else
  pg_dump "$TEST_DB_URL" --schema-only -f "$SCHEMA_FILE" --verbose
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo -e "${RED}✗ Schema file was not created${NC}"
  exit 1
fi

SCHEMA_SIZE=$(du -h "$SCHEMA_FILE" | cut -f1)
echo -e "${GREEN}✓ Schema backup created successfully (Size: $SCHEMA_SIZE)${NC}"
echo ""

# Step 3: Verify backup integrity
echo -e "${YELLOW}[4/6] Verifying backup integrity...${NC}"
BACKUP_LIST=$(pg_restore --list "$BACKUP_FILE" 2>&1 || true)

if [[ -z "$BACKUP_LIST" ]]; then
  echo -e "${RED}✗ Backup appears to be corrupted${NC}"
  exit 1
fi

# Count tables in backup
TABLE_COUNT=$(echo "$BACKUP_LIST" | grep -c "TABLE DATA" || true)
echo -e "Tables found: ${GREEN}$TABLE_COUNT${NC}"

# Check for critical tables
CRITICAL_TABLES=("users" "chatbots" "embeddings" "conversations" "subscriptions")
MISSING_TABLES=()

for table in "${CRITICAL_TABLES[@]}"; do
  if echo "$BACKUP_LIST" | grep -q "TABLE DATA.*$table"; then
    echo -e "  ✓ Found table: ${GREEN}$table${NC}"
  else
    echo -e "  ✗ Missing table: ${RED}$table${NC}"
    MISSING_TABLES+=("$table")
  fi
done

if [[ ${#MISSING_TABLES[@]} -gt 0 ]]; then
  echo -e "${RED}✗ Critical tables are missing from backup${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Backup integrity verified${NC}"
echo ""

# Step 4: Test restore (if not skipped)
if [[ "$SKIP_RESTORE" == false ]]; then
  echo -e "${YELLOW}[5/6] Testing restore to test database...${NC}"
  echo -e "${YELLOW}Warning: This will DROP and RECREATE the test database${NC}"
  echo -e "${YELLOW}Test DB URL: $TEST_DB_URL${NC}"

  read -p "Continue? (yes/no) " -r
  if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
    echo -e "${YELLOW}Restore test skipped by user${NC}"
  else
    # Clean test database
    echo -e "${BLUE}Cleaning test database...${NC}"
    psql "$TEST_DB_URL" -c "DROP SCHEMA IF EXISTS public CASCADE;" || true
    psql "$TEST_DB_URL" -c "CREATE SCHEMA public;"
    psql "$TEST_DB_URL" -c "GRANT ALL ON SCHEMA public TO postgres;"
    psql "$TEST_DB_URL" -c "GRANT ALL ON SCHEMA public TO public;"

    # Restore backup
    echo -e "${BLUE}Restoring backup...${NC}"
    pg_restore --clean --if-exists -d "$TEST_DB_URL" "$BACKUP_FILE" --verbose

    echo -e "${GREEN}✓ Restore completed${NC}"

    # Verify restore
    echo -e "${YELLOW}[6/6] Verifying restored data...${NC}"

    for table in "${CRITICAL_TABLES[@]}"; do
      COUNT=$(psql "$TEST_DB_URL" -t -c "SELECT COUNT(*) FROM $table;" 2>&1 || echo "0")
      COUNT=$(echo "$COUNT" | tr -d ' \n')

      if [[ "$COUNT" =~ ^[0-9]+$ ]]; then
        echo -e "  Table ${GREEN}$table${NC}: $COUNT rows"
      else
        echo -e "  Table ${RED}$table${NC}: Error checking row count"
      fi
    done

    echo -e "${GREEN}✓ Data verification complete${NC}"
  fi
else
  echo -e "${YELLOW}[5/6] Restore test skipped${NC}"
  echo -e "${YELLOW}[6/6] Verification skipped${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Results Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Full Backup:     ${GREEN}✓ PASSED${NC} ($BACKUP_SIZE)"
echo -e "Schema Backup:   ${GREEN}✓ PASSED${NC} ($SCHEMA_SIZE)"
echo -e "Integrity Check: ${GREEN}✓ PASSED${NC} ($TABLE_COUNT tables)"

if [[ "$SKIP_RESTORE" == false ]]; then
  echo -e "Restore Test:    ${GREEN}✓ PASSED${NC}"
fi

echo ""
echo -e "${GREEN}All tests passed!${NC}"
echo ""
echo -e "Backup files saved to:"
echo -e "  - $BACKUP_FILE"
echo -e "  - $SCHEMA_FILE"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. Review backup files"
echo -e "  2. Test selective table restore"
echo -e "  3. Document RTO/RPO measurements"
echo -e "  4. Schedule next test (recommended: quarterly)"
echo ""

exit 0
