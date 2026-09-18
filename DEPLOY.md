# Deployment Guide — GitHub + Neon + Vercel

## Langkah 1: GitHub
1. Buat repo baru di https://github.com/new
2. Push kode ke GitHub

## Langkah 2: Neon (Database)
1. Daftar di https://neon.tech
2. Buat project baru
3. Copy connection string (DATABASE_URL)
4. Copy direct connection string (DIRECT_URL)

## Langkah 3: Vercel
1. Login di https://vercel.com dengan GitHub
2. Import repo
3. Set Environment Variables:
   - DATABASE_URL = (dari Neon)
   - DIRECT_URL = (dari Neon)
4. Deploy

## Langkah 4: Setup Database
Setelah deploy, run di Vercel terminal:
```
bun run db:push
bun scripts/seed-production.ts
```

## Login Default
- Username: admin
- Password: admin123
