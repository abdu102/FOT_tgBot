import type { PrismaClient } from '@prisma/client';
import { Telegraf, Scenes } from 'telegraf';
import { buildMainKeyboard, buildAuthKeyboard, buildWelcomeKeyboard } from '../keyboards/main';

export function languageHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.hears([/🌐 Til: UZ\/RU/, /🌐 Язык: UZ\/RU/], async (ctx) => {
    const current = ctx.i18n.locale();
    const next = current === 'uz' ? 'ru' : 'uz';
    // @ts-ignore
    ctx.i18n.locale(next);
    const userId = (ctx.state as any).userId as string | undefined;
    if (userId) {
      await prisma.user.update({ where: { id: userId }, data: { language: next } });
    }
    const isAuthenticated = Boolean((ctx.state as any).isAuthenticated);
    const isAdmin = Boolean((ctx.state as any).isAdmin);

    // Build reply keyboard depending on role/auth
    let keyboard: any;
    if (isAdmin) {
      // Reuse admin keyboard layout from /start
      const adminKeyboard = {
        keyboard: [
          // @ts-ignore
          [{ text: ctx.i18n.t('admin.sessions') }, { text: ctx.i18n.t('admin.create_session') }],
          // @ts-ignore
          [{ text: ctx.i18n.t('admin.lists') }, { text: ctx.i18n.t('admin.approvals') }],

          // @ts-ignore
          [{ text: ctx.i18n.t('admin.demo_create') }, { text: ctx.i18n.t('admin.demo_pending') }],
          // @ts-ignore
          [{ text: ctx.i18n.t('menu.language') }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      } as any;
      keyboard = adminKeyboard;
    } else if (isAuthenticated) {
      keyboard = buildMainKeyboard(ctx);
    } else {
      keyboard = buildWelcomeKeyboard(ctx);
    }

    await ctx.reply(next === 'uz' ? '🌐 Til UZ ga o\'zgardi' : '🌐 Язык изменён на RU', keyboard);
  });
}
