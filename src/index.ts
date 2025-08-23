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
  const name = ctx.from?.first_name ?? 'do‘st';
  const userId = (ctx.state as any).userId as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const registered = Boolean(user?.phone);
  // @ts-ignore
  await ctx.reply(
    ctx.i18n.t('start.greet', { name }),
    registered ? buildMainKeyboard(ctx) : buildAuthKeyboard(ctx)
  );
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


