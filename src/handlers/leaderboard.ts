import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function registerLeaderboardHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.command('top', async (ctx) => {
    const stats = await prisma.playerStat.findMany({ orderBy: { rating: 'desc' }, take: 10, include: { user: true } });
    if (!stats.length) return ctx.reply('Hali statistikalar yo‘q / Пока нет статистики');
    const lines = stats.map((s: { user: { firstName: string }; rating: number; goals: number; assists: number; wins: number }, i: number) => `${i + 1}. ${s.user.firstName} — ⭐️${s.rating.toFixed(1)} | ⚽${s.goals} | 🅰️${s.assists} | 🏆${s.wins}`);
    await ctx.reply(lines.join('\n'));
  });
}


