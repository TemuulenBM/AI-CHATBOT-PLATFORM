# GitHub Actions Backup - Түргэн эхлүүлэх заавар

5 минутад backup систем эхлүүлэх! ⚡

## 📝 Хурдан тохиргоо (5 минут)

### 1️⃣ GitHub Secrets тохируулах (2 минут)

1. GitHub.com → Repository → **Settings**
2. **Secrets and variables** → **Actions**
3. **New repository secret** дарж 4 secret нэмэх:

```bash
SUPABASE_DB_PASSWORD  = your_database_password
SUPABASE_HOST         = aws-1-us-east-1.pooler.supabase.com
SUPABASE_USER         = postgres.wvodufqgnnhajcvhnvoa
SUPABASE_DB           = postgres
```

💡 **Password хаанаас олох вэ?**
- Supabase Dashboard → Settings → Database → Show password

### 2️⃣ Git Push хийх (1 минут)

```bash
# Terminal нээх
cd /Users/temuulen/Development/AI-Chatbot-Platform

# Git status шалгах
git status

# Файлууд нэмэх (аль хэдийн үүссэн байх ёстой)
git add .github/workflows/database-backup.yml
git add scripts/restore-database.sh
git add docs/*.md

# Commit хийх
git commit -m "feat: add GitHub Actions backup system"

# Push хийх
git push origin main
```

### 3️⃣ Туршилт хийх (2 минут)

**Manual backup ажиллуулах:**

1. GitHub → **Actions** tab
2. **"Database Backup"** сонгох
3. **"Run workflow"** → **"Run workflow"** дарах
4. 2-3 минут хүлээх

**Амжилттай бол:**
```
✓ Database Backup
  Completed successfully
```

**Backup татаж авах:**
- Scroll down → **Artifacts** → **database-backup-1** → Татах

---

## 🚀 Хэрхэн ашиглах вэ?

### Backup үүсгэх

**Автомат:** Долоо хоног бүр Ням гарагт 10:00 (Монголын цагаар)

**Гараар:**
```
GitHub → Actions → Database Backup → Run workflow
```

### Backup татаж авах

```
1. GitHub → Actions → Амжилттай workflow сонгох
2. Доош scroll → Artifacts
3. database-backup-XXX татаж авах
4. Unzip хийх
```

### Database сэргээх

```bash
# 1. Password тохируулах
export SUPABASE_DB_PASSWORD="your_password"

# 2. Application унтраах (Ctrl+C)

# 3. Restore хийх
./scripts/restore-database.sh backup-20250129-143015.dump

# 4. Application эхлүүлэх
npm run dev
```

---

## ✅ Шалгах жагсаалт

Тохиргоо зөв эсэхийг шалгах:

- [ ] GitHub Secrets: 4 secret нэмсэн
- [ ] Git push: workflow файлууд push хийгдсэн
- [ ] Туршилт: Manual backup амжилттай
- [ ] Artifact: Backup файл татаж авч чадсан

**Бүгд ✓ бол БЭЛЭН!** 🎉

---

## 📚 Дэлгэрэнгүй заавар

- **Secrets тохируулах:** `docs/GITHUB_SECRETS_SETUP_MONGOLIAN.md`
- **Бүрэн заавар:** `docs/GITHUB_BACKUP_GUIDE.md`
- **Тест хийх:** `docs/TESTING_BACKUP_SYSTEM_MONGOLIAN.md`

---

## 💬 Түгээмэл асуултууд

**Хэдэн backup хадгалагдах вэ?**
→ 30 хоногийн турш

**Үнэгүй юу?**
→ Тийм! GitHub Actions үнэгүй

**Автомат эсвэл гараар?**
→ Хоёуланг нь дэмждэг

**Restore хэдэн хугацаа авах вэ?**
→ 5-15 минут

---

**Амжилт хүсье!** Одоо таны өгөгдөл хамгаалагдсан! 🛡️
