import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function registerCaptainHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.command('team', async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const team = await prisma.team.findFirst({ where: { captainId: userId }, include: { members: { include: { user: true } } } });
    if (!team) return ctx.reply('Sizda jamoa yo‘q / У вас нет команды');
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
}


