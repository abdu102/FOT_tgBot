## Futbol Liga Bot (Telegraf + Prisma + PostgreSQL)

Zamonaviy Telegram bot: ro‘yxatdan o‘tish (o‘yinchi/jamoa), haftalik matchlarga yozilish, to‘lov, admin panel, eslatmalar, statistika va leaderboard.

### Texnologiyalar
- Node.js, TypeScript
- Telegraf v4
- Prisma ORM + PostgreSQL
- node-cron (eslatmalar)
- i18n (UZ/RU)

### Muhit sozlash
1) `.env` ni yarating (`env.example` asosida):
```
BOT_TOKEN=xxxxxx
DATABASE_URL=postgresql://user:pass@host:5432/football
ADMIN_TG_IDS=111111111,222222222
PAYMENT_METHOD=MANUAL
ORGANIZER_NAME="Your League"
ORGANIZER_REQUISITES="Карта ....; Получатель ...; Комментарий: ваш ник"
TIMEZONE=Asia/Tashkent
```

2) Lokal Postgres (ixtiyoriy):
```
docker compose up -d
```

3) Bog‘lash va ishga tushirish:
```
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

### Foydalanish
- `/start` — asosiy menyu
- "📝 Ro‘yxatdan o‘tish" — o‘yinchi yoki jamoa sifatida ro‘yxatdan o‘tish
- "⚽ Haftalik o‘yinlar" — yaqin matchlar ro‘yxati va yozilish
- "🌐 Til: UZ/RU" — tilni almashtirish
- "👤 Profil" — profil va statistika
- `/admin` — admin panel (faqat `ADMIN_TG_IDS`):
  - ➕ Match yaratish (sana/vaqt, manzil, narx, jamoa hajmi)
  - 🧾 Ro‘yxatlar (ro‘yxatdan o‘tganlar)
  - ✅ Tasdiqlash / ❌ Rad etish
  - 🤖 Auto-formation (7x7 guruhlash)
  - 📊 Statistika kiritish (goals/assists/win)
- `/team` — kapitan jamoani ko‘rish va boshqarish
- `/cancel` — qatnashishni bekor qilish so‘rovi
- `/top` — leaderboard

### To‘lov
- `PAYMENT_METHOD=MANUAL` — bot to‘lov rekvizitlarini yuboradi
- Ishtirokchi chekni yuboradi → admin tasdiqlaydi → status APPROVED

### Eslatmalar
- Har kuni soat 10:00 da ertangi matchlar uchun xabar yuboriladi (`TIMEZONE` bo‘yicha)

### Railway’ga deploy
1) Yangi loyiha → Deploy from GitHub
2) Variables (Environment):
   - `BOT_TOKEN`
   - `DATABASE_URL` (Railway Postgres pluginidan olingan URL)
   - `ADMIN_TG_IDS`
   - `PAYMENT_METHOD` (MANUAL)
   - `ORGANIZER_NAME`, `ORGANIZER_REQUISITES`, `TIMEZONE`
3) Build & Start komandalarini Railway detect qiladi yoki qo‘lda:
   - Build: `npm run build && npx prisma generate`
   - Start: `npm run start`
4) Migrations: Railway “Deploy” jarayonidan oldin yoki birinchi ishga tushirishdan keyin `npx prisma migrate deploy` ishga tushiring (Railway Shell yoki CI step orqali)
5) Webhook kerak emas — Telegraf long polling ishlaydi. Railway “Sleep” off yoqilganligiga ishonch hosil qiling.

### Arxitektura
- `src/index.ts` — bot bootstrap, middleware, scene/handlerlar
- `src/scenes/*` — onboarding, match yaratish, stats kiritish
- `src/handlers/*` — foydalanuvchi/admin/captain/leaderboard/payments
- `src/services/*` — scheduler, payments, autoFormation, stats, language
- `prisma/schema.prisma` — ma’lumotlar modeli

### Kengaytirish
- Payme/Click integratsiyasi uchun `src/services/payments.ts` ni kengaytiring (webhook, payment verify)
- Admin UI (bot ichida) ga qo‘shimcha filtrlash/sortlash
- Jamoa balanslash strategiyalari (pozitsiya asosida)


