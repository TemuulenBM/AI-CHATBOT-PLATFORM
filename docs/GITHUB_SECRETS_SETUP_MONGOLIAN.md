# GitHub Secrets Тохиргооны Заавар

Энэхүү заавар нь GitHub Actions backup-д шаардлагатай нууц мэдээллүүдийг хэрхэн тохируулахыг зургаар харуулсан.

## 📸 Алхам алхмаар заавар

### Алхам 1: GitHub Repository руу орох

1. Browser-т GitHub.com нээх
2. Өөрийн repository руу очих:
   ```
   https://github.com/YOUR-USERNAME/AI-CHATBOT-PLATFORM
   ```

### Алхам 2: Settings tab нээх

Repository хуудсанд **Settings** tab-ыг дарах (баруун дээд буланд).

### Алхам 3: Secrets хэсэг рүү очих

Зүүн талын sidebar-с:
1. **Secrets and variables** гэснийг дарах
2. **Actions** гэснийг дарах

Эсвэл шууд очих:
```
https://github.com/YOUR-USERNAME/AI-CHATBOT-PLATFORM/settings/secrets/actions
```

### Алхам 4: Шинэ Secret нэмэх

**"New repository secret"** товч дарах (ногоон өнгөтэй, баруун дээд буланд).

### Алхам 5: Нэгдүгээр Secret - Database Password

**Name:** `SUPABASE_DB_PASSWORD`

**Secret:** Таны database password

```
Жишээ (БҮҮ хуулбарлах, өөрийнхөө password-ыг бичих!):
your_super_secret_password_123
```

**"Add secret"** дарах.

#### Database Password-оо хаанаас олох вэ?

**Арга 1: Supabase Dashboard**

1. https://supabase.com/dashboard нээх
2. Project сонгох
3. Settings (доод зүүн булан) → Database
4. Connection Info хэсэгт очих
5. "Show password" дарах эсвэл "Reset Database Password"

**Арга 2: .env файл**

```bash
# Terminal дээр
cd /Users/temuulen/Development/AI-Chatbot-Platform
cat .env | grep SUPABASE

# Үр дүн:
# SUPABASE_URL=https://wvodufqgnnhajcvhnvoa.supabase.co
# SUPABASE_SERVICE_KEY=eyJhbGc...
```

Password нь service key биш, database-ын password!

### Алхам 6: Хоёрдугаар Secret - Database Host

**Name:** `SUPABASE_HOST`

**Secret:**
```
aws-1-us-east-1.pooler.supabase.com
```

**"Add secret"** дарах.

### Алхам 7: Гуравдугаар Secret - Database User

**Name:** `SUPABASE_USER`

**Secret:**
```
postgres.wvodufqgnnhajcvhnvoa
```

**"Add secret"** дарах.

#### User name хаанаас олох вэ?

Supabase Dashboard → Settings → Database → Connection Info:
```
Host: aws-1-us-east-1.pooler.supabase.com
Database name: postgres
Port: 5432
User: postgres.wvodufqgnnhajcvhnvoa  ← Энэ!
```

### Алхам 8: Дөрөвдүгээр Secret - Database Name

**Name:** `SUPABASE_DB`

**Secret:**
```
postgres
```

**"Add secret"** дарах.

---

## ✅ Баталгаажуулалт

Бүх 4 secrets нэмсэний дараа дараах байдалтай харагдах ёстой:

```
Repository secrets

SUPABASE_DB              Updated 1 minute ago
SUPABASE_DB_PASSWORD     Updated 2 minutes ago
SUPABASE_HOST            Updated 3 minutes ago
SUPABASE_USER            Updated 4 minutes ago
```

---

## 🔐 Аюулгүй байдал

### Secrets-ийг хэн харж болох вэ?

- **Та зөвхөн нэг удаа харна** - Secret нэмэх үед
- **Түүнээс хойш ХЭНД ч харагдахгүй** - GitHub-д ч, бусдад ч
- **Workflow дотор ашиглагдана** - Гэхдээ logs-д харагдахгүй

### Secrets алдсан бол яах вэ?

```bash
# 1. Supabase password солих
# Supabase Dashboard → Settings → Database → Reset Database Password

# 2. GitHub Secret шинэчлэх
# GitHub → Settings → Secrets → SUPABASE_DB_PASSWORD → Update secret

# 3. Workflow дахин ажиллуулах
# Actions → Database Backup → Run workflow
```

---

## 🧪 Туршилт хийх

Secrets зөв тохируулагдсан эсэхийг шалгах:

### Арга 1: Manual Workflow ажиллуулах

1. GitHub Repository → **Actions** tab
2. Зүүн талаас **"Database Backup"** сонгох
3. **"Run workflow"** дарах
4. Branch: **main** сонгох
5. **"Run workflow"** баталгаажуулах

### Арга 2: Үр дүн харах

2-3 минутын дараа:

✅ **Амжилттай:**
```
Database Backup
✓ All jobs completed successfully
```

Artifacts хэсэгт backup файл харагдах ёстой:
```
📦 Artifacts
   database-backup-1 (245 MB)
```

❌ **Алдаа гарвал:**

**"Password authentication failed"**
→ `SUPABASE_DB_PASSWORD` буруу байна

**"Connection timeout"**
→ `SUPABASE_HOST` эсвэл network асуудалтай

**"Role does not exist"**
→ `SUPABASE_USER` буруу байна

---

## 📝 Шалгах жагсаалт

Бүх зүйл зөв эсэхийг шалгах:

- [ ] GitHub repository руу Settings хандах боломжтой
- [ ] 4 secrets нэмсэн:
  - [ ] SUPABASE_DB_PASSWORD
  - [ ] SUPABASE_HOST
  - [ ] SUPABASE_USER
  - [ ] SUPABASE_DB
- [ ] Secrets жагсаалтад харагдаж байгаа
- [ ] Manual workflow амжилттай ажилласан
- [ ] Artifact татаж авч чадсан

---

## 🔄 Secrets засах/шинэчлэх

Secret-ыг шинэчлэх хэрэгтэй бол:

1. GitHub → Repository → Settings → Secrets and variables → Actions
2. Засахыг хүсч буй secret-ын нэр дээр дарах
3. **Update secret** сонгох
4. Шинэ утга оруулах
5. **Update secret** дарах

---

## ❓ Түгээмэл асуултууд

### Secrets хэдийд устах вэ?

Secrets хэзээ ч устахгүй. Та өөрөө устгах хүртэл байна.

### Secrets-ийг бусад хүн харж чадах уу?

Үгүй! Repository access байлаа гэхэд ч secrets харагдахгүй. Зөвхөн GitHub Actions workflow ашиглаж чадна.

### Workflow logs-д password харагдах уу?

Үгүй! GitHub автоматаар `***` болгож нууна.

```
Жишээ log:
  PGPASSWORD=***
  Connecting to database with user postgres.***
```

### Private repository шаардлагатай юу?

Үгүй, public repository дээр ч ажиллана. Secrets хамгаалагдсан хэвээр байна.

### .env файлаа GitHub-д оруулж болох уу?

**ҮГҮЙ!** `.env` файл нь `.gitignore`-д байх ёстой. GitHub Secrets ашигла!

```bash
# .gitignore шалгах
cat .gitignore | grep .env

# Үр дүн:
# .env
# .env.local
```

---

## 🎓 Нэмэлт сургалт

### Environment variables ба GitHub Secrets-ийн ялгаа

| | Environment Variables | GitHub Secrets |
|---|----------------------|----------------|
| Хаана байгаа | `.env` файл (local) | GitHub сервер |
| Хэн харах | File үзэж болох хүн бүр | Хэн ч харахгүй |
| Git-д орох уу | Үгүй (`.gitignore`) | GitHub-д хадгалагдана |
| Ашиглах газар | Local development | GitHub Actions |

### Best practices

1. ✅ Password хэзээ ч Git-д оруулахгүй
2. ✅ `.env` файл `.gitignore`-д байх
3. ✅ Production passwords Secrets-д хадгалах
4. ✅ Secrets-үүд descriptive нэртэй байх
5. ✅ Ашиглагдахгүй secrets устгах

---

## 📞 Тусламж хэрэгтэй бол

Хэрэв алдаа гарвал эсвэл тусламж хэрэгтэй бол:

1. **GitHub Docs:** https://docs.github.com/en/actions/security-guides/encrypted-secrets
2. **Supabase Docs:** https://supabase.com/docs/guides/database/connecting-to-postgres
3. **Project Issues:** GitHub repository → Issues tab

---

**Амжилт хүсье!** Одоо GitHub Actions backup бэлэн болсон! 🎉
