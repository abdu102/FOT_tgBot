import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { generateTeamInvite } from '../services/invite';

export function registerCaptainHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  // Entry point from main menu
  bot.hears(['👥 Jamoa', '👥 Команда'], async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const team = await prisma.team.findFirst({ where: { captainId: userId }, include: { members: { include: { user: true } } } });
    if (!team) {
      return ctx.reply('Jamoa yo‘q. Yaratamizmi? / Нет команды. Создать?', {
        reply_markup: { inline_keyboard: [[{ text: '➕ Jamoa yaratish', callback_data: 'team_create_scene' }], [{ text: '⬅️ Menyuga qaytish', callback_data: 'back_menu' }]] },
      } as any);
    }
    const count = team.members.length;
    const list = team.members.map((m, i) => `${i + 1}. ${m.user.firstName} ${m.user.lastName ?? ''} ${m.user.phone ?? ''} @${m.user.username ?? ''}`).join('\n');
    const warn = count < 6 ? '\n⚠️ Kamida 6 o‘yinchi bo‘lishi kerak / Минимум 6 игроков' : '';
    await ctx.reply(`👥 ${team.name}\nA’zolar: ${count}${warn}\n${list}`, {
      reply_markup: { inline_keyboard: [[{ text: '🔗 Taklif havolasi', callback_data: `team_invite_${team.id}` }],[{ text: '➕ A’zo qo‘shish', callback_data: `team_add_more_${team.id}` }], [{ text: '⬅️ Menyuga qaytish', callback_data: 'back_menu' }]] },
    } as any);
  });

  bot.command('team', async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const team = await prisma.team.findFirst({ where: { captainId: userId }, include: { members: { include: { user: true } } } });
    if (!team) {
      return ctx.reply('Sizda jamoa yo‘q. Yaratamizmi? / Нет команды. Создать?', {
        reply_markup: { inline_keyboard: [[{ text: '➕ Jamoa yaratish', callback_data: 'team_create_scene' }]] },
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

  bot.action('team_create_scene', async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const exists = await prisma.team.findFirst({ where: { captainId: userId } });
    if (exists) return ctx.reply('Sizda allaqachon jamoa bor / Команда уже есть');
    await ctx.scene.enter('team:create');
  });

  bot.action(/team_add_more_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    (ctx.session as any).addMemberTeamId = teamId;
    await ctx.scene.enter('team:addMember');
  });

  bot.action(/team_invite_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    const inv = await generateTeamInvite(prisma, teamId);
    const base = process.env.WEBHOOK_URL || process.env.RAILWAY_STATIC_URL || '';
    const url = `${base?.replace(/\/$/, '')}/telegraf/${process.env.BOT_TOKEN}?start=join_${inv.token}`;
    await ctx.reply(`🔗 Havola: ${url}\n⏳ Amal qilish muddati: ${inv.expires.toISOString().slice(0,16).replace('T',' ')}`);
  });
}


