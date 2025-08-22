import 'dotenv/config';
import { Telegraf, session, Scenes } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import I18n from 'telegraf-i18n';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { buildMainKeyboard } from './keyboards/main';
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
  // @ts-ignore
  await ctx.reply(ctx.i18n.t('start.greet', { name }), buildMainKeyboard(ctx));
});

languageHandlers(bot, prisma);

bot.catch((err, ctx) => {
  console.error('Bot error', err);
});

setupCronJobs(bot.telegram, prisma);
initAdmin(prisma);

bot.launch().then(() => {
  console.log('Bot launched');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Minimal HTTP server for Railway health checks
const port = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});
server.listen(port, () => {
  console.log(`Health server listening on :${port}`);
});


