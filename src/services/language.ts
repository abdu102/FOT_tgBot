import type { PrismaClient } from '@prisma/client';
import { Telegraf, Scenes } from 'telegraf';
import { buildMainKeyboard } from '../keyboards/main';

export function languageHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.hears(['🌐 Til: UZ/RU', '🌐 Язык: UZ/RU'], async (ctx) => {
    const current = ctx.i18n.locale();
    const next = current === 'uz' ? 'ru' : 'uz';
    // @ts-ignore
    ctx.i18n.locale(next);
    const userId = (ctx.state as any).userId as string | undefined;
    if (userId) {
      await prisma.user.update({ where: { id: userId }, data: { language: next } });
    }
    await ctx.reply(next === 'uz' ? '🌐 Til UZ ga o‘zgardi' : '🌐 Язык изменён на RU', buildMainKeyboard(ctx));
  });
}
