import 'dotenv/config';
import { Telegraf, session, Scenes } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import I18n from 'telegraf-i18n';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { buildMainKeyboard, buildAuthKeyboard } from './keyboards/main';
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
bot.use(session());
// @ts-ignore - types augmented in src/types
bot.use(i18n.middleware());
bot.use(authMiddleware(prisma));
bot.use(ensureUserMiddleware(prisma));

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
  // @ts-ignore
  await ctx.reply(
    ctx.i18n.t('start.greet', { name }),
    isAuthenticated ? buildMainKeyboard(ctx) : buildAuthKeyboard(ctx, { showRegister: !hasAccount })
  );
  if (isAdmin) {
    await ctx.reply('🛡 Admin detected', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Open admin panel', callback_data: 'open_admin_panel' }]] },
    } as any);
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

async function startBot() {
  const app = express();
  app.use(express.json());
  app.get('/', (_req: express.Request, res: express.Response) => res.status(200).send('ok'));
  app.get('/health', (_req: express.Request, res: express.Response) => res.status(200).send('ok'));

  if (WEBHOOK_URL) {
    const path = `/telegraf/${BOT_TOKEN}`;
    const full = `${WEBHOOK_URL.replace(/\/$/, '')}${path}`;
    app.use(bot.webhookCallback(path));
    app.listen(port, () => console.log(`Webhook server on :${port} url=${full}`));
    try {
      await bot.telegram.setWebhook(full, { drop_pending_updates: true });
    } catch (err) {
      console.error('setWebhook failed, running server without webhook:', err);
    }
  } else {
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
      await bot.launch({ dropPendingUpdates: true });
      console.log('Bot launched with polling');
      process.once('SIGINT', () => bot.stop('SIGINT'));
      process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (e: any) {
      // If another instance is polling, keep the web server alive for healthchecks
      if (e?.response?.error_code === 409) {
        console.error('Polling conflict (409): another instance is running. Keeping server alive.');
      } else {
        throw e;
      }
    }
    app.listen(port, () => console.log(`Health server on :${port}`));
  }
}

startBot().catch((e) => {
  console.error('Bot start error', e);
  // Do not exit hard to allow Railway to pass healthchecks
});


