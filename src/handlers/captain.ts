import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function registerCaptainHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.command('team', async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const team = await prisma.team.findFirst({ where: { captainId: userId }, include: { members: { include: { user: true } } } });
    if (!team) {
      return ctx.reply('Sizda jamoa yo‘q. Yaratamizmi? / Нет команды. Создать?', {
        reply_markup: { inline_keyboard: [[{ text: '➕ Jamoa yaratish', callback_data: 'team_create' }]] },
      } as any);
    }
    const list = team.members.map((m, i) => `${i + 1}. ${m.user.firstName} ${m.user.phone ?? ''}`).join('\n');
    await ctx.reply(`👥 ${team.name}\n${list}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Qo‘shish', callback_data: `team_add_${team.id}` }],
          [{ text: '➖ Olib tashlash', callback_data: `team_remove_${team.id}` }],
        ],
      },
    } as any);
  });

  bot.action('team_create', async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const exists = await prisma.team.findFirst({ where: { captainId: userId } });
    if (exists) return ctx.reply('Sizda allaqachon jamoa bor / Команда уже есть');
    await ctx.reply('Jamoa nomi? / Название команды?');
    (ctx.session as any).awaitingTeamName = true;
  });

  bot.on('text', async (ctx, next) => {
    const sess: any = ctx.session || {};
    if (sess.awaitingTeamName) {
      const name = (ctx.message as any).text.trim();
      sess.awaitingTeamName = false;
      const userId = (ctx.state as any).userId as string;
      const team = await prisma.team.create({ data: { name, captainId: userId } });
      await prisma.teamMember.create({ data: { teamId: team.id, userId, role: 'captain' } });
      return ctx.reply('✅ Jamoa yaratildi / Команда создана');
    }
    return next();
  });
}


