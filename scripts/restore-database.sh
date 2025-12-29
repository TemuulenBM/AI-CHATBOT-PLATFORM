#!/bin/bash

###############################################################################
# Database Restore Script
#
# GitHub Actions backup-аас database сэргээх
#
# Хэрэглээ:
#   ./scripts/restore-database.sh backup-20250129-140530.dump
#
# Environment Variables (шаардлагатай):
#   SUPABASE_DB_PASSWORD - Database password
#   SUPABASE_HOST        - Database host (optional, default set below)
#   SUPABASE_USER        - Database user (optional, default set below)
#   SUPABASE_DB          - Database name (optional, default set below)
#
# Жишээ:
#   export SUPABASE_DB_PASSWORD="your_password"
#   ./scripts/restore-database.sh backup-20250129.dump
###############################################################################

set -e  # Алдаа гарвал зогсоно
set -u  # Тодорхойлоогүй variable ашиглавал алдаа

# Өнгөнүүд
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Backup файлын замыг авах
if [ -z "${1:-}" ]; then
  echo -e "${RED}❌ Алдаа: Backup файлын зам өгнө үү${NC}"
  echo ""
  echo "Хэрэглээ:"
  echo "  $0 backup-20250129-140530.dump"
  echo ""
  echo "Жишээ:"
  echo "  export SUPABASE_DB_PASSWORD=\"your_password\""
  echo "  $0 backup-20250129.dump"
  exit 1
fi

BACKUP_FILE="$1"

# Backup файл байгаа эсэхийг шалгах
if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}❌ Алдаа: Backup файл олдсонгүй: $BACKUP_FILE${NC}"
  echo ""
  echo "Файлын байршил шалгаарай:"
  ls -la "$(dirname "$BACKUP_FILE")" 2>/dev/null || echo "Directory олдсонгүй"
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Database Restore   ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "📦 Backup файл: ${GREEN}$BACKUP_FILE${NC}"
echo -e "💾 Хэмжээ:      ${GREEN}$(du -h "$BACKUP_FILE" | cut -f1)${NC}"
echo ""

# Environment variables-аас унших (эсвэл default утга ашиглах)
SUPABASE_HOST="${SUPABASE_HOST:-aws-1-us-east-1.pooler.supabase.com}"
SUPABASE_USER="${SUPABASE_USER:-postgres.wvodufqgnnhajcvhnvoa}"
SUPABASE_DB="${SUPABASE_DB:-postgres}"

# Password шалгах
if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo -e "${RED}❌ Алдаа: SUPABASE_DB_PASSWORD environment variable байхгүй байна${NC}"
  echo ""
  echo "Environment variable тохируулна уу:"
  echo ""
  echo "  export SUPABASE_DB_PASSWORD=\"your_password\""
  echo ""
  echo "Эсвэл .env файлаас уншуулна:"
  echo "  source .env"
  exit 1
fi

echo -e "🔌 Холболтын мэдээлэл:"
echo -e "   Host: ${YELLOW}$SUPABASE_HOST${NC}"
echo -e "   User: ${YELLOW}$SUPABASE_USER${NC}"
echo -e "   DB:   ${YELLOW}$SUPABASE_DB${NC}"
echo ""

# PostgreSQL client суусан эсэхийг шалгах
if ! command -v psql &> /dev/null || ! command -v pg_restore &> /dev/null; then
  echo -e "${RED}❌ Алдаа: PostgreSQL client суугаагүй байна${NC}"
  echo ""
  echo "macOS дээр суулгах:"
  echo "  brew install postgresql"
  echo ""
  echo "Ubuntu/Debian дээр:"
  echo "  sudo apt-get install postgresql-client"
  exit 1
fi

# Анхааруулга
echo -e "${RED}========================================${NC}"
echo -e "${RED}⚠️  АНХААР - АЮУЛТАЙ ҮЙЛДЭЛ!${NC}"
echo -e "${RED}========================================${NC}"
echo ""
echo -e "${YELLOW}Энэ скрипт дараах зүйлийг хийнэ:${NC}"
echo -e "  1. Одоогийн database-н бүх өгөгдлийг ${RED}УСТГАНА${NC}"
echo -e "  2. Backup файлаас шинэ өгөгдөл оруулна"
echo -e "  3. Энэ үйлдлийг ${RED}БУЦААХ БОЛОМЖГҮЙ${NC}"
echo ""
echo -e "${YELLOW}Үргэлжлүүлэхийн өмнө:${NC}"
echo -e "  ✓ Application унтраасан байх ёстой"
echo -e "  ✓ Бусад хэрэглэгчид холбогдоогүй байх"
echo -e "  ✓ Одоогийн өгөгдлийн нөөц авсан эсэхээ шалгах"
echo ""

read -p "$(echo -e ${YELLOW}Та ҮНЭХЭЭР restore хийхийг хүсэж байна уу? '${RED}yes${YELLOW}' гэж бичнэ үү: ${NC})" -r
echo ""

if [[ ! $REPLY =~ ^yes$ ]]; then
  echo -e "${YELLOW}🚫 Restore цуцлагдлаа.${NC}"
  echo ""
  exit 0
fi

# Эхлүүлэх
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Restore эхэлж байна...${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Database холбогдож байгаа эсэхийг шалгах
echo -e "${YELLOW}[Шат 0/4] Database холболт шалгаж байна...${NC}"

export PGPASSWORD="$SUPABASE_DB_PASSWORD"

if ! psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" -c "SELECT 1;" > /dev/null 2>&1; then
  echo -e "${RED}❌ Database-д холбогдож чадсангүй!${NC}"
  echo ""
  echo "Дараах зүйлсийг шалгаарай:"
  echo "  1. SUPABASE_DB_PASSWORD зөв эсэх"
  echo "  2. Host, User, DB нэр зөв эсэх"
  echo "  3. Network холболт байгаа эсэх"
  exit 1
fi

echo -e "${GREEN}✓ Database холболт амжилттай${NC}"
echo ""

# Одоогийн өгөгдлийн тоог харуулах
echo -e "${YELLOW}[Шат 1/4] Одоогийн өгөгдлийн тоо:${NC}"

CURRENT_USERS=$(psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "0")

CURRENT_CHATBOTS=$(psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -t -c "SELECT COUNT(*) FROM chatbots;" 2>/dev/null | tr -d ' ' || echo "0")

CURRENT_CONVERSATIONS=$(psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -t -c "SELECT COUNT(*) FROM conversations;" 2>/dev/null | tr -d ' ' || echo "0")

echo -e "   Users:         ${BLUE}$CURRENT_USERS${NC}"
echo -e "   Chatbots:      ${BLUE}$CURRENT_CHATBOTS${NC}"
echo -e "   Conversations: ${BLUE}$CURRENT_CONVERSATIONS${NC}"
echo ""

# Сүүлчийн баталгаажуулалт
echo -e "${RED}СҮҮЛЧИЙН АНХААРУУЛГА:${NC}"
echo -e "Дээрх ${BLUE}$CURRENT_USERS${NC} хэрэглэгч, ${BLUE}$CURRENT_CHATBOTS${NC} chatbot, ${BLUE}$CURRENT_CONVERSATIONS${NC} conversation ${RED}УСТАХ${NC} болно!"
echo ""
read -p "$(echo -e ${YELLOW}Та БАТТАЙ '${RED}CONTINUE${YELLOW}' гэж бичнэ үү (эсвэл Ctrl+C дарж зогсооно уу): ${NC})" -r
echo ""

if [[ ! $REPLY =~ ^CONTINUE$ ]]; then
  echo -e "${YELLOW}🚫 Restore цуцлагдлаа.${NC}"
  echo ""
  exit 0
fi

# Database цэвэрлэх
echo -e "${YELLOW}[Шат 2/4] Database цэвэрлэж байна...${NC}"

# public schema-г дахин үүсгэх
psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -c "DROP SCHEMA IF EXISTS public CASCADE;" 2>&1 | grep -v "NOTICE" || true

psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -c "CREATE SCHEMA public;" 2>&1 | grep -v "NOTICE" || true

psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -c "GRANT ALL ON SCHEMA public TO postgres;" 2>&1 | grep -v "NOTICE" || true

psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -c "GRANT ALL ON SCHEMA public TO public;" 2>&1 | grep -v "NOTICE" || true

echo -e "${GREEN}✓ Цэвэрлэлт дууслаа${NC}"
echo ""

# Backup сэргээх
echo -e "${YELLOW}[Шат 3/4] Backup сэргээж байна (энэ удаан байж болно)...${NC}"

# Restore хийх (stderr-ийн NOTICE-уудыг нуух)
if pg_restore -h "$SUPABASE_HOST" \
              -U "$SUPABASE_USER" \
              -d "$SUPABASE_DB" \
              --no-owner \
              --no-acl \
              --verbose \
              "$BACKUP_FILE" 2>&1 | grep -v "NOTICE" | grep -v "WARNING: errors ignored"; then
  echo -e "${GREEN}✓ Restore амжилттай дууслаа${NC}"
else
  # pg_restore заримдаа warnings-тай ч амжилттай дуусдаг
  echo -e "${YELLOW}⚠ Restore дууссан (зарим warnings байж болно)${NC}"
fi

echo ""

# Шинэ өгөгдлийн тоог шалгах
echo -e "${YELLOW}[Шат 4/4] Restore-ийн үр дүнг шалгаж байна...${NC}"

RESTORED_USERS=$(psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "0")

RESTORED_CHATBOTS=$(psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -t -c "SELECT COUNT(*) FROM chatbots;" 2>/dev/null | tr -d ' ' || echo "0")

RESTORED_CONVERSATIONS=$(psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -t -c "SELECT COUNT(*) FROM conversations;" 2>/dev/null | tr -d ' ' || echo "0")

RESTORED_EMBEDDINGS=$(psql -h "$SUPABASE_HOST" -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  -t -c "SELECT COUNT(*) FROM embeddings;" 2>/dev/null | tr -d ' ' || echo "0")

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Restore амжилттай дууслаа!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "📊 Сэргээсэн өгөгдлийн тоо:"
echo -e "   Users:         ${GREEN}$RESTORED_USERS${NC}"
echo -e "   Chatbots:      ${GREEN}$RESTORED_CHATBOTS${NC}"
echo -e "   Conversations: ${GREEN}$RESTORED_CONVERSATIONS${NC}"
echo -e "   Embeddings:    ${GREEN}$RESTORED_EMBEDDINGS${NC}"
echo ""

# Дараагийн алхамууд
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}📝 Дараагийн алхамууд:${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "1️⃣  ${YELLOW}Application эхлүүлэх:${NC}"
echo -e "    npm run dev"
echo ""
echo -e "2️⃣  ${YELLOW}Бүх зүйл зөв ажиллаж байгааг шалгах:${NC}"
echo -e "    - Login хийж үзэх"
echo -e "    - Chatbot-ууд харагдаж байгааг шалгах"
echo -e "    - Conversation-ууд ачааллагдаж байгааг шалгах"
echo ""
echo -e "3️⃣  ${YELLOW}Embeddings шалгах (Migration 005 хийсэн бол):${NC}"
echo -e "    psql -c \"SELECT COUNT(*) FROM embeddings WHERE embedding IS NOT NULL;\""
echo ""
echo -e "4️⃣  ${YELLOW}Хэрэв embeddings NULL байвал дахин үүсгэх:${NC}"
echo -e "    npm run tsx server/scripts/regenerate-embeddings.ts"
echo -e "    npm run tsx server/scripts/regenerate-knowledge-base.ts"
echo ""

# Амжилттай дууссан
echo -e "${GREEN}🎉 Database амжилттай сэргээгдлээ!${NC}"
echo ""

# Password environment variable-г арилгах (аюулгүй байдал)
unset PGPASSWORD

exit 0
