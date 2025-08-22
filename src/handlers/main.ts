import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildMainKeyboard } from '../keyboards/main';

export function registerMainHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.hears(['📝 Ro‘yxatdan o‘tish', '📝 Регистрация'], async (ctx) => {
    // Ask which mode
    await ctx.reply('Qaysi turda? / Как?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 O‘yinchi / Игрок', callback_data: 'go_individual' }],
          [{ text: '👥 Jamoa / Команда', callback_data: 'go_team' }],
        ],
      },
    } as any);
  });

  bot.action('go_individual', async (ctx) => {
    await ctx.scene.enter('onboarding:individual');
  });
  bot.action('go_team', async (ctx) => {
    await ctx.scene.enter('onboarding:team');
  });

  bot.hears(['⚽ Haftalik o‘yinlar', '⚽ Еженедельные матчи'], async (ctx) => {
    const matches = await prisma.match.findMany({ orderBy: { dateTime: 'asc' }, take: 10 });
    if (!matches.length) return ctx.reply('Hozircha yo‘q / Пока нет');
    for (const m of matches) {
      await ctx.reply(
        `📅 ${m.dateTime.toISOString().slice(0,16).replace('T',' ')}\n📍 ${m.location}\n💰 ${m.pricePerUser} UZS`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '✍️ Ro‘yxatga yozilish / Записаться', callback_data: `signup_${m.id}` }]],
          },
        } as any
      );
    }
  });

  bot.action(/signup_(.*)/, async (ctx) => {
    const matchId = (ctx.match as any)[1] as string;
    const userId = (ctx.state as any).userId as string;
    // Create registration pending
    await prisma.registration.create({
      data: {
        matchId,
        userId,
        type: 'INDIVIDUAL',
        status: 'PENDING',
      },
    });
    await ctx.reply('🧾 To‘lov uchun ma’lumot yuborildi. Admin tasdiqlaydi. / Данные для оплаты отправлены, ждите подтверждения.');
  });

  bot.hears(['👤 Profil', '👤 Профиль'], async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const u = await prisma.user.findUnique({ where: { id: userId }, include: { stats: true } });
    const ps = u?.stats?.[0];
    await ctx.reply(
      `👤 ${u?.firstName || ''}\n📞 ${u?.phone || '-'}\n⭐️ ${ps?.rating ?? 0} | ⚽ ${ps?.goals ?? 0} | 🅰️ ${ps?.assists ?? 0} | 🏆 ${ps?.wins ?? 0}`,
      buildMainKeyboard(ctx)
    );
  });
}


