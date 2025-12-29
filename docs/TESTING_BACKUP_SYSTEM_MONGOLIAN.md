# Backup Системийг Туршиж Шалгах Заавар

Энэхүү заавар нь таны GitHub Actions backup систем зөв ажиллаж байгаа эсэхийг **алхам алхмаар** шалгах аргыг заана.

## 📋 Агуулга

1. [Тохиргоо шалгах](#1-тохиргоо-шалгах)
2. [Backup туршилт](#2-backup-туршилт)
3. [Restore туршилт](#3-restore-туршилт)
4. [Автомат backup шалгах](#4-автомат-backup-шалгах)
5. [Бүтэн тест (End-to-End)](#5-бүтэн-тест-end-to-end)

---

## 1. Тохиргоо шалгах

### 1.1 Файлууд байгаа эсэх

```bash
# Terminal нээж project folder-д очих
cd /Users/temuulen/Development/AI-Chatbot-Platform

# Файлууд байгаа эсэхийг шалгах
ls -la .github/workflows/database-backup.yml
ls -la scripts/restore-database.sh
ls -la docs/GITHUB_BACKUP_GUIDE.md
```

**Хүлээгдэж буй үр дүн:**
```
-rw-r--r--  1 user  staff  3456 Jan 29 14:30 .github/workflows/database-backup.yml
-rwxr-xr-x  1 user  staff  8901 Jan 29 14:30 scripts/restore-database.sh
-rw-r--r--  1 user  staff  12345 Jan 29 14:30 docs/GITHUB_BACKUP_GUIDE.md
```

✅ Бүх файл байвал **АМЖИЛТТАЙ**
❌ Файл байхгүй бол `docs/GITHUB_BACKUP_GUIDE.md` уншаарай

### 1.2 GitHub Secrets шалгах

1. GitHub repository-гоо нээх
2. Settings → Secrets and variables → Actions
3. Дараах 4 secrets байгаа эсэх:

```
✓ SUPABASE_DB
✓ SUPABASE_DB_PASSWORD
✓ SUPABASE_HOST
✓ SUPABASE_USER
```

✅ 4-ийг нь харагдаж байвал **АМЖИЛТТАЙ**
❌ Алга бол `docs/GITHUB_SECRETS_SETUP_MONGOLIAN.md` уншаарай

### 1.3 Workflow идэвхтэй эсэх

```bash
# Git status шалгах
git status

# Workflow файл commit хийгдсэн эсэх
git log --oneline | head -5
```

✅ Workflow commit хийгдсэн байвал **АМЖИЛТТАЙ**
❌ Commit хийгдээгүй бол:

```bash
git add .github/workflows/database-backup.yml
git add scripts/restore-database.sh
git commit -m "feat: add GitHub Actions backup system"
git push origin main
```

---

## 2. Backup туршилт

### 2.1 Manual backup ажиллуулах

**Шат 1:** GitHub-д очих

1. Repository нээх: `https://github.com/YOUR-USERNAME/AI-CHATBOT-PLATFORM`
2. **Actions** tab дарах
3. Зүүн sidebar-с **"Database Backup"** сонгох

**Шат 2:** Workflow ажиллуулах

1. Баруун талд **"Run workflow"** товч дарах
2. Branch: **main** сонгосон эсэхээ шалгах
3. Ногоон **"Run workflow"** дарах

**Шат 3:** Явцыг хянах

Workflow ажиллаж эхэлнэ:

```
🟡 Database Backup
   Running... (0m 15s)
```

2-3 минутын дараа:

```
🟢 Database Backup
   ✓ Completed successfully (2m 34s)
```

✅ Ногоон ✓ харагдвал **АМЖИЛТТАЙ**
❌ Улаан ✗ харагдвал [Алдаа засах](#алдаа-засах) хэсэг рүү очно уу

### 2.2 Backup агуулга шалгах

**Шат 1:** Workflow дарж нээх

Амжилттай дууссан workflow-г дарна.

**Шат 2:** Logs шалгах

Дараах мэдээлэл харагдах ёстой:

```
🔄 Database backup эхэлж байна...
📅 Огноо: Sun Jan 29 14:30:00 UTC 2025

📦 Backup файлын мэдээлэл:
-rw-r--r-- 1 runner docker 245M Jan 29 14:30 backup-20250129-143015.dump

🔍 Backup агуулга шалгаж байна...
10; 38174 TABLE DATA public users postgres
11; 38175 TABLE DATA public chatbots postgres
12; 38176 TABLE DATA public conversations postgres

✅ Backup амжилттай үүслээ!
```

✅ Эдгээр мэдээлэл харагдвал **АМЖИЛТТАЙ**

**Шат 3:** Artifact татаж авах

1. Workflow хуудсыг доош scroll хийх
2. **"Artifacts"** хэсэг олох:

```
📦 Artifacts produced during runtime
   database-backup-1  245 MB  Expires in 30 days
```

3. **"database-backup-1"** дарж татаж авах
4. Zip файл татагдана

✅ Zip файл татагдвал **АМЖИЛТТАЙ**

### 2.3 Backup файл задлах

```bash
# Downloads folder-д очих
cd ~/Downloads

# Татаж авсан zip олох
ls -la database-backup-*.zip

# Zip задлах
unzip database-backup-1.zip

# Backup файл гарч ирсэн эсэх
ls -la backup-*.dump
```

**Хүлээгдэж буй үр дүн:**
```
-rw-r--r-- 1 user staff 256901234 Jan 29 14:30 backup-20250129-143015.dump
```

✅ `.dump` файл байвал **АМЖИЛТТАЙ**

### 2.4 Backup integrity шалгах

```bash
# PostgreSQL client шаардлагатай
# macOS: brew install postgresql

# Backup файлын агуулга шалгах
pg_restore --list backup-20250129-143015.dump | head -20
```

**Хүлээгдэж буй үр дүн:**
```
;
; Archive created at 2025-01-29 14:30:15 UTC
;     dbname: postgres
;     TOC Entries: 234
;     Compression: -1
;     Dump Version: 1.14-0
;
10; 1259 38174 TABLE public users postgres
11; 1259 38175 TABLE public chatbots postgres
12; 1259 38176 TABLE public conversations postgres
13; 1259 38177 TABLE public embeddings postgres
14; 1259 38178 TABLE public subscriptions postgres
```

✅ Tables жагсаалт харагдвал **АМЖИЛТТАЙ**
❌ Алдаа гарвал backup файл corrupt байна

---

## 3. Restore туршилт

⚠️ **АНХААР:** Энэ тест таны одоогийн database-г солих болно!

### 3.1 Одоогийн өгөгдлийн snapshot авах

```bash
# Database-ын өгөгдлийн тоог бичиж үлдээх
export SUPABASE_DB_PASSWORD="your_password"

psql -h aws-1-us-east-1.pooler.supabase.com \
     -U postgres.wvodufqgnnhajcvhnvoa \
     -d postgres \
     -c "SELECT
           (SELECT COUNT(*) FROM users) as users,
           (SELECT COUNT(*) FROM chatbots) as chatbots,
           (SELECT COUNT(*) FROM conversations) as conversations;"
```

**Үр дүн бичиж үлдээх:**
```
 users | chatbots | conversations
-------+----------+---------------
    42 |       15 |           238
```

### 3.2 Application унтраах

```bash
# Terminal дээр npm run dev ажиллаж байгаа бол
# Ctrl+C дарж зогсоох

# Эсвэл бүх Node process-уудыг зогсоох
pkill -f "node"

# Шалгах (юу ч гарахгүй байх ёстой)
ps aux | grep node
```

### 3.3 Restore script ажиллуулах

```bash
# Backup файл байгаа folder-т очих
cd ~/Downloads

# Environment variable тохируулах
export SUPABASE_DB_PASSWORD="your_password"

# Restore хийх
/Users/temuulen/Development/AI-Chatbot-Platform/scripts/restore-database.sh backup-20250129-143015.dump
```

**Процесс:**

1. Анхны мэдээлэл харагдана:
```
========================================
   Database Restore
========================================

📦 Backup файл: backup-20250129-143015.dump
💾 Хэмжээ:      245M
```

2. Анхааруулга гарна:
```
⚠️  АНХААР - АЮУЛТАЙ ҮЙЛДЭЛ!
Та ҮНЭХЭЭР restore хийхийг хүсэж байна уу? 'yes' гэж бичнэ үү:
```
→ **yes** гэж бичнэ үү

3. Сүүлчийн баталгаажуулалт:
```
СҮҮЛЧИЙН АНХААРУУЛГА:
Та БАТТАЙ 'CONTINUE' гэж бичнэ үү:
```
→ **CONTINUE** гэж бичнэ үү

4. Restore явагдана:
```
[Шат 0/4] Database холболт шалгаж байна...
✓ Database холболт амжилттай

[Шат 1/4] Одоогийн өгөгдлийн тоо:
   Users:         42
   Chatbots:      15
   Conversations: 238

[Шат 2/4] Database цэвэрлэж байна...
✓ Цэвэрлэлт дууслаа

[Шат 3/4] Backup сэргээж байна...
✓ Restore амжилттай дууслаа

[Шат 4/4] Restore-ийн үр дүнг шалгаж байна...

✅ Restore амжилттай дууслаа!

📊 Сэргээсэн өгөгдлийн тоо:
   Users:         42
   Chatbots:      15
   Conversations: 238
   Embeddings:    1,234
```

✅ Бүх шат амжилттай **ТЕСТ АМЖИЛТТАЙ**

### 3.4 Application эхлүүлж шалгах

```bash
# Project folder-д очих
cd /Users/temuulen/Development/AI-Chatbot-Platform

# Server эхлүүлэх
npm run dev
```

**Шалгах:**

1. Browser нээх: `http://localhost:5000`
2. Login хийх
3. Dashboard харагдаж байгаа эсэх
4. Chatbots жагсаалт харагдаж байгаа эсэх
5. Conversation бичлэгүүд харагдаж байгаа эсэх

✅ Бүх зүйл харагдаж байвал **ТЕСТ АМЖИЛТТАЙ**

---

## 4. Автомат backup шалгах

### 4.1 Schedule тохиргоо шалгах

```bash
# Workflow файл нээх
cat .github/workflows/database-backup.yml | grep -A 2 "schedule:"
```

**Хүлээгдэж буй үр дүн:**
```yaml
schedule:
  # Долоо хоног бүр Ням гарагт 02:00 UTC-д ажиллана
  - cron: '0 2 * * 0'
```

✅ Cron schedule харагдвал **АМЖИЛТТАЙ**

### 4.2 Дараагийн backup хугацаа тооцоолох

Cron: `0 2 * * 0` = Ням гарагт 02:00 UTC

**Монголын цагаар:**
- UTC+8: 10:00 өглөө
- Ням гарагт

**Дараагийн backup:**
```bash
# Өнөөдөр: Энэ 7 хоногийн Ням гараг 10:00
# Дараагийнх: Дараа 7 хоногийн Ням гараг 10:00
```

### 4.3 Автомат backup ажилласан эсэх шалгах

**Дараагийн Ням гараг 10:30 цагт:**

1. GitHub → Actions tab
2. "Database Backup" workflow-г хайх
3. Автоматаар ажилласан workflow харагдах ёстой:

```
Database Backup
✓ Scheduled  2h 30m ago
```

✅ "Scheduled" гэж харагдвал **АВТОМАТ BACKUP АЖИЛЛАЖ БАЙНА**

---

## 5. Бүтэн тест (End-to-End)

Энэ нь бүх системийг эхнээс нь эцсээ хүртэл шалгах тест юм.

### Тестийн хөтөлбөр

```
1. Backup үүсгэх (Manual)
2. Backup татаж авах
3. Database өөрчлөх (тест data нэмэх)
4. Restore хийх
5. Өгөгдөл буцаж ирсэн эсэх шалгах
```

### Алхам 1: Анхны backup үүсгэх

```bash
# GitHub Actions дээр Manual backup ажиллуулах
# (Дээрх 2.1 хэсэг харах)
```

### Алхам 2: Backup татаж авах

```bash
# Artifact татаж авах
# Downloads folder-д unzip хийх
cd ~/Downloads
unzip database-backup-*.zip
```

### Алхам 3: Тест өгөгдөл нэмэх

```bash
# Database-д тест user нэмэх
export SUPABASE_DB_PASSWORD="your_password"

psql -h aws-1-us-east-1.pooler.supabase.com \
     -U postgres.wvodufqgnnhajcvhnvoa \
     -d postgres \
     -c "INSERT INTO users (id, email, created_at)
         VALUES ('test-user-12345', 'test@example.com', NOW());"

# Тест user үүссэн эсэх
psql ... -c "SELECT * FROM users WHERE email = 'test@example.com';"
```

**Үр дүн:**
```
           id           |      email       |         created_at
------------------------+------------------+----------------------------
 test-user-12345        | test@example.com | 2025-01-29 14:45:30.123
```

✅ Тест user үүслээ

### Алхам 4: Хуучин backup-аас restore хийх

```bash
# Application унтраах
# Restore хийх (дээрх backup файл ашиглах)
./scripts/restore-database.sh backup-20250129-143015.dump
```

### Алхам 5: Тест user алга болсон эсэх шалгах

```bash
# Тест user хайх
psql -h aws-1-us-east-1.pooler.supabase.com \
     -U postgres.wvodufqgnnhajcvhnvoa \
     -d postgres \
     -c "SELECT * FROM users WHERE email = 'test@example.com';"
```

**Хүлээгдэж буй үр дүн:**
```
 id | email | created_at
----+-------+------------
(0 rows)
```

✅ Тест user алга болсон = Restore зөв ажиллаж байна!

---

## ✅ Амжилттай тестийн шалгах жагсаалт

Бүх зүйл зөв ажиллаж байвал:

- [ ] Workflow файлууд бүгд байна
- [ ] GitHub Secrets 4-ийг нь тохируулсан
- [ ] Manual backup амжилттай ажилласан
- [ ] Artifact татаж авч чадсан
- [ ] Backup файл integrity шалгалт амжилттай
- [ ] Restore script амжилттай ажилласан
- [ ] Application эхлэж, бүх өгөгдөл харагдаж байна
- [ ] End-to-end тест амжилттай
- [ ] Автомат schedule тохируулагдсан

---

## 🐛 Алдаа засах

### Алдаа 1: "Password authentication failed"

**Шалт гаан:**
```
FATAL: password authentication failed for user "postgres.wvodufqgnnhajcvhnvoa"
```

**Шийдэл:**

1. Password зөв эсэхийг шалгах:
```bash
# Суpabase Dashboard → Settings → Database → Show password
```

2. GitHub Secret шинэчлэх:
```
GitHub → Settings → Secrets → SUPABASE_DB_PASSWORD → Update
```

3. Workflow дахин ажиллуулах

### Алдаа 2: "Connection timeout"

**Шалт гаан:**
```
could not connect to server: Connection timed out
```

**Шийдэл:**

1. Network холболт шалгах:
```bash
ping aws-1-us-east-1.pooler.supabase.com
```

2. Supabase service ажиллаж байгаа эсэх:
```
https://status.supabase.com
```

3. Firewall/VPN шалгах

### Алдаа 3: "Artifact олдсонгүй"

**Шалт гаан:**
Workflow амжилттай дууссан ч Artifact харагдахгүй байна.

**Шийдэл:**

Workflow logs шалгах:
1. Actions → Workflow дарах
2. "Upload backup artifact" step нээх
3. Алдааны мэдээлэл харах

### Алдаа 4: "Restore хийгдээгүй"

**Шалт гаан:**
Restore амжилттай дууссан ч өгөгдөл хуучин хэвээр байна.

**Шийдэл:**

1. Application унтраасан эсэхийг шалгах:
```bash
ps aux | grep node
# Юу ч гарахгүй байх ёстой
```

2. Cache цэвэрлэх:
```bash
# Browser cache цэвэрлэх
# Hard refresh: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
```

3. Restore дахин ажиллуулах

---

## 📊 Тестийн хуваарь

**Анхны туршилт:** Одоо даруй

**Долоо хоног тутамд:**
- Автомат backup ажилласан эсэх шалгах
- Artifact татаж авч чадаж байгаа эсэх

**Сар бүр:**
- Бүтэн restore тест хийх
- Өгөгдлийн бүрэн бүтэн байдал шалгах

**Улирал тутам:**
- End-to-end тест хийх
- Disaster recovery plan шинэчлэх
- Team-тэй restore дадлага хийх

---

## 🎓 Санамж

**Амжилттай тест** гэдэг нь:

1. ✅ Backup файл үүсч байна
2. ✅ Restore ажиллаж байна
3. ✅ Өгөгдөл зөв сэргэж байна
4. ✅ Application ажиллаж байна

**Бүх 4 нөхцөл биелвэл танай систем БҮРЭН АЖИЛЛАЖ БАЙНА!** 🎉

---

Асуулт байвал `docs/GITHUB_BACKUP_GUIDE.md` уншаарай эсвэл GitHub Issues дээр асуу! 😊
