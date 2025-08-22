import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function registerCancelHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.command('cancel', async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const pending = await prisma.registration.findFirst({ where: { userId, status: 'APPROVED' }, include: { match: true } });
    if (!pending) return ctx.reply('Sizda faol ishtirok yo‘q / Активной записи нет');
    await ctx.reply(`Bekor qilish so‘rovi yuborildi: ${pending.match?.location}`, { reply_markup: { inline_keyboard: [[{ text: '🆗 Tasdiqlash', callback_data: `cancel_${pending.id}` }]] } } as any);
  });

  bot.action(/cancel_(.*)/, async (ctx) => {
    const id = (ctx.match as any)[1];
    await prisma.registration.update({ where: { id }, data: { status: 'CANCELLED' } });
    // notify admins
    const adminIds = (process.env.ADMIN_TG_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const a of adminIds) {
      try { await ctx.telegram.sendMessage(a, `🔔 Bekor qilish so‘rovi: reg ${id}`); } catch {}
    }
    await ctx.reply('So‘rov yuborildi, admin javobini kuting / Запрос отправлен');
  });
}


