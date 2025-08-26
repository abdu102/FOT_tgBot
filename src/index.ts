import 'dotenv/config';
import { Telegraf, session, Scenes } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import I18n from 'telegraf-i18n';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { spawn } from 'child_process';
import { buildMainKeyboard, buildAuthKeyboard, buildWelcomeKeyboard } from './keyboards/main';
import redis from './config/redis';
import { collectDefaultMetrics, register } from 'prom-client';
import { messageCounter } from './utils/telegram';
import { registerScenes } from './scenes';
import { authMiddleware } from './middlewares/auth';
import { ensureUserMiddleware } from './middlewares/ensureUser';
import { setupCronJobs } from './services/scheduler';
import { initAdmin } from './services/admin';
import { languageHandlers } from './services/language';
import { registerMainHandlers } from './handlers/main';
import { registerAdminHandlers } from './handlers/admin';
import { registerCaptainHandlers } from './handlers/captain';
import { registerCancelHandlers } from './handlers/cancel';
import { registerPaymentHandlers } from './handlers/payments';

const prisma = new PrismaClient();

// Redis client for sessions and caching

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN env is required');
  process.exit(1);
}

// Resolve locales directory both in dev (src/locales) and prod (dist/locales)
const distLocales = path.join(__dirname, 'locales');
const srcLocales = path.join(process.cwd(), 'src', 'locales');
const localesDir = fs.existsSync(distLocales) ? distLocales : srcLocales;

const i18n = new I18n({
  defaultLanguage: 'uz',
  allowMissing: false,
  directory: localesDir,
});

const bot = new Telegraf<Scenes.WizardContext>(BOT_TOKEN);

// Redis-backed session storage (if Redis available); otherwise fallback to in-memory session
const SESSION_TTL = parseInt(process.env.SESSION_TTL || '3600', 10);
if (redis) {
  const redisStore = {
    get: async (key: string) => {
      try {
        const data = await (redis as any).get(`tgsess:${key}`);
        return data ? JSON.parse(data) : undefined;
      } catch {
        return undefined;
      }
    },
    set: async (key: string, value: any) => {
      try {
        await (redis as any).set(`tgsess:${key}`, JSON.stringify(value), 'EX', SESSION_TTL);
      } catch {}
    },
    delete: async (key: string) => {
      try { await (redis as any).del(`tgsess:${key}`); } catch {}
    },
  };
  bot.use(session({
    store: redisStore as any,
    getSessionKey: (ctx: any) => {
      const fromId = ctx.from?.id;
      const chatId = ctx.chat?.id;
      if (!fromId || !chatId) return undefined;
      return `${fromId}:${chatId}`;
    },
  } as any));
} else {
  bot.use(session());
}
// @ts-ignore - types augmented in src/types
bot.use(i18n.middleware());
// Simple per-user rate limiting (30 actions/min)
bot.use(async (ctx, next) => {
  const userKey = ctx.from ? `rate:${ctx.from.id}` : null;
  if (!userKey) return next();
  try {
    const cnt = await redis.incr(userKey);
    if (cnt === 1) {
      await redis.expire(userKey, 60);
    }
    if (cnt > Number(process.env.RATE_LIMIT_MAX || 60)) {
      try { await (ctx as any).reply('Juda tez. Iltimos, bir oz kuting.'); } catch {}
      return;
    }
  } catch {}
  return next();
});

bot.use(authMiddleware(prisma));
bot.use(ensureUserMiddleware(prisma));

// Optional debug logs - Enable by default for now to debug stats issue
// if (process.env.DEBUG_LOG === '1') {
  bot.on('callback_query', async (ctx, next) => { 
    try { 
      console.log('CB:', (ctx.callbackQuery as any)?.data); 
      console.log('DEBUG: Current scene:', (ctx.scene as any)?.current?.id || 'NO_SCENE');
      try { messageCounter.inc({ type: 'callback' }); } catch {}
    } catch {} 
    return next(); 
  });
  bot.on('text', async (ctx, next) => { 
    try { 
      console.log('TXT:', (ctx.message as any)?.text); 
      try { messageCounter.inc({ type: 'text' }); } catch {}
    } catch {} 
    return next(); 
  });
// }

registerScenes(bot, prisma);
registerMainHandlers(bot, prisma);
registerAdminHandlers(bot, prisma);
registerCaptainHandlers(bot, prisma);
registerCancelHandlers(bot, prisma);
registerPaymentHandlers(bot, prisma);

bot.start(async (ctx) => {
  // Ensure any active scene is exited so /start always works
  try { await (ctx.scene as any)?.leave(); } catch {}
  const name = ctx.from?.first_name ?? 'do‘st';
  const userId = (ctx.state as any).userId as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isAuthenticated = Boolean(user?.isActive);
  const hasAccount = Boolean(user?.username || user?.phone);
  const isAdmin = Boolean((ctx.state as any).isAdmin);
  // Handle invite deep link: /start join_<token>
  const arg = (ctx.message as any)?.text?.split(' ').slice(1).join(' ');
  if (arg && arg.startsWith('join_')) {
    const token = arg.replace(/^join_/, '');
    if (isAuthenticated) {
      const { tryJoinByInvite } = await import('./services/invite');
      const team = await tryJoinByInvite(prisma, token, (ctx.state as any).userId);
      if (team) {
        await ctx.reply(`✅ Siz ${team.name} jamoasiga qo‘shildingiz!`);
        const cap = await prisma.user.findUnique({ where: { id: team.captainId } });
        if (cap?.telegramId) { try { await ctx.telegram.sendMessage(cap.telegramId, `👤 ${user?.firstName || ''} jamoangizga qo‘shildi.`); } catch {} }
      } else {
        await ctx.reply('Taklif havolasi eskirgan yoki noto‘g‘ri.');
      }
    } else {
      // persist pending invite on user record and ask to login/register
      const telegramId = String(ctx.from?.id);
      // try attach to authenticated or placeholder user by telegramId
      const existing = await prisma.user.findUnique({ where: { telegramId } }).catch(() => null);
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { pendingInviteToken: token } }).catch(() => {});
      } else if ((ctx.state as any).userId) {
        await prisma.user.update({ where: { id: (ctx.state as any).userId }, data: { pendingInviteToken: token } }).catch(() => {});
      } else {
        await prisma.user.create({ data: { telegramId, firstName: ctx.from?.first_name || 'User', lastName: ctx.from?.last_name || null, pendingInviteToken: token } }).catch(() => {});
      }
      await ctx.reply('🔗 Taklif qabul qilindi. Iltimos, avval tizimga kiring yoki ro‘yxatdan o‘ting.');
    }
  }
  if (isAdmin) {
    // For admins, do NOT show login/register keyboard. Show admin reply keyboard instead.
    const adminKeyboard = {
      keyboard: [
        // @ts-ignore
        [{ text: ctx.i18n.t('admin.sessions') }, { text: ctx.i18n.t('admin.create_session') }],
        // @ts-ignore
        [{ text: ctx.i18n.t('admin.lists') }, { text: ctx.i18n.t('admin.approvals') }],
        // @ts-ignore
        [{ text: ctx.i18n.t('menu.language') }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    } as any;
    // @ts-ignore
    await ctx.reply(ctx.i18n.t('start.greet', { name }), { reply_markup: adminKeyboard } as any);
    // @ts-ignore
    await ctx.reply(ctx.i18n.t('admin.admin_detected'));
  } else if (isAuthenticated) {
    // @ts-ignore
    await ctx.reply(ctx.i18n.t('start.greet', { name }), buildMainKeyboard(ctx));
  } else {
    // For new users, show welcome menu with "Create Account" option
    // @ts-ignore
    await ctx.reply(ctx.i18n.t('start.greet', { name }), buildWelcomeKeyboard(ctx));
  }
});

languageHandlers(bot, prisma);

bot.catch((err, ctx) => {
  console.error('Bot error', err);
});

setupCronJobs(bot.telegram, prisma);
initAdmin(prisma);

const port = parseInt(process.env.PORT || '3000', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.RAILWAY_STATIC_URL; // auto-use Railway static URL if present

async function repairDbEnums() {
  try {
    // Ensure schema-qualified enum types exist in public schema
    await prisma.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "public"."RegistrationType" AS ENUM ('INDIVIDUAL','TEAM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "public"."RegistrationStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING','CONFIRMED','FAILED','REFUNDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    // New enum used by coupons
    await prisma.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "public"."CouponStatus" AS ENUM ('AVAILABLE','USED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    // Registration.type
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "Registration" ALTER COLUMN "type" DROP DEFAULT; EXCEPTION WHEN undefined_column THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "Registration" ALTER COLUMN "type" TYPE "public"."RegistrationType" USING (CASE WHEN "type" IS NULL THEN 'INDIVIDUAL'::"public"."RegistrationType" ELSE "type"::"public"."RegistrationType" END); EXCEPTION WHEN others THEN NULL; END $$;`);
    // Registration.status
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "Registration" ALTER COLUMN "status" DROP DEFAULT; EXCEPTION WHEN undefined_column THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "Registration" ALTER COLUMN "status" TYPE "public"."RegistrationStatus" USING (CASE WHEN "status" IS NULL THEN 'PENDING'::"public"."RegistrationStatus" ELSE "status"::"public"."RegistrationStatus" END); EXCEPTION WHEN others THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "Registration" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."RegistrationStatus"; EXCEPTION WHEN others THEN NULL; END $$;`);
    // SessionRegistration.type
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "SessionRegistration" ALTER COLUMN "type" DROP DEFAULT; EXCEPTION WHEN undefined_column THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "SessionRegistration" ALTER COLUMN "type" TYPE "public"."RegistrationType" USING (CASE WHEN "type" IS NULL THEN 'INDIVIDUAL'::"public"."RegistrationType" ELSE "type"::"public"."RegistrationType" END); EXCEPTION WHEN others THEN NULL; END $$;`);
    // SessionRegistration.status
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "SessionRegistration" ALTER COLUMN "status" DROP DEFAULT; EXCEPTION WHEN undefined_column THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "SessionRegistration" ALTER COLUMN "status" TYPE "public"."RegistrationStatus" USING (CASE WHEN "status" IS NULL THEN 'PENDING'::"public"."RegistrationStatus" ELSE "status"::"public"."RegistrationStatus" END); EXCEPTION WHEN others THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "SessionRegistration" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."RegistrationStatus"; EXCEPTION WHEN others THEN NULL; END $$;`);
    // Payment.status
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT; EXCEPTION WHEN undefined_column THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "public"."PaymentStatus" USING (CASE WHEN "status" IS NULL THEN 'PENDING'::"public"."PaymentStatus" ELSE "status"::"public"."PaymentStatus" END); EXCEPTION WHEN others THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."PaymentStatus"; EXCEPTION WHEN others THEN NULL; END $$;`);
    // Columns that newer migrations add; make startup idempotent by adding if missing
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredNumber" INTEGER NULL; EXCEPTION WHEN others THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "number" INTEGER NULL; EXCEPTION WHEN others THEN NULL; END $$;`);
    // Coupon table (minimal schema to satisfy queries); use public enums created above
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Coupon') THEN
          CREATE TABLE "public"."Coupon" (
            "id" TEXT PRIMARY KEY,
            "userId" TEXT NOT NULL,
            "status" "public"."CouponStatus" NOT NULL DEFAULT 'AVAILABLE',
            "sessionRegistrationId" TEXT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "usedAt" TIMESTAMP NULL
          );
        END IF;
      END $$;
    `);
    // Lightweight FKs (best-effort)
    await prisma.$executeRawUnsafe(`DO $$ BEGIN
      ALTER TABLE "Coupon" ADD CONSTRAINT IF NOT EXISTS "Coupon_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    EXCEPTION WHEN others THEN NULL; END $$;`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN
      ALTER TABLE "Coupon" ADD CONSTRAINT IF NOT EXISTS "Coupon_sr_fkey" FOREIGN KEY ("sessionRegistrationId") REFERENCES "SessionRegistration"("id") ON DELETE SET NULL;
    EXCEPTION WHEN others THEN NULL; END $$;`);
    console.log('DB enum repair completed');
  } catch (e) {
    console.error('DB enum repair failed', e);
  }
}

async function startBot() {
  const app = express();
  app.use(express.json());
  app.get('/', (_req: express.Request, res: express.Response) => res.status(200).send('ok'));
  app.get('/health', (_req: express.Request, res: express.Response) => res.status(200).send('ok'));
  // Metrics
  try {
    collectDefaultMetrics();
    app.get('/metrics', async (_req: express.Request, res: express.Response) => {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    });
  } catch (e) {
    console.error('metrics setup failed', e);
  }
  app.get('/ready', async (_req: express.Request, res: express.Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).send('ok');
    } catch {
      res.status(503).send('db not ready');
    }
  });

  // Bind HTTP server first and guard against EADDRINUSE
  try {
    app.listen(port, () => console.log(`HTTP server on :${port}`));
  } catch (e) {
    console.error('HTTP listen failed:', e);
  }

  // Run migrations in background so DB is up-to-date without blocking healthcheck
  if (process.env.AUTO_MIGRATE !== '0') {
    try {
      // First, ensure enums/columns/tables exist to unblock Prisma
      repairDbEnums().catch(() => {});
      // Resolve previously failed migration (P3009) if present
      try {
        const resolve = spawn('npx', ['prisma', 'migrate', 'resolve', '--applied', '0013_enums_registration_payment'], { stdio: 'inherit' });
        resolve.on('exit', (code) => console.log('migrate resolve 0013 exit', code));
      } catch {}
      const child = spawn('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });
      child.on('exit', (code) => console.log('migrate deploy finished with code', code));
    } catch (e) {
      console.error('Failed to spawn migrate deploy:', e);
    }
  }

  if (WEBHOOK_URL) {
    const path = `/telegraf/${BOT_TOKEN}`;
    const full = `${WEBHOOK_URL.replace(/\/$/, '')}${path}`;
    app.use(bot.webhookCallback(path));
    try {
      await bot.telegram.setWebhook(full, { drop_pending_updates: true });
      console.log('Webhook set to', full);
    } catch (err) {
      console.error('setWebhook failed, continuing with server only:', err);
    }
    return;
  }

  // Polling mode fallback
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
    await bot.launch({ dropPendingUpdates: true });
    console.log('Bot launched with polling');
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (e: any) {
    if (e?.response?.error_code === 409) {
      console.error('Polling conflict (409): another instance is running. Keeping server alive.');
    } else {
      console.error('Polling launch failed:', e);
    }
  }
}

startBot().catch((e) => {
  console.error('Bot start error', e);
  // Do not exit hard to allow Railway to pass healthchecks
});


