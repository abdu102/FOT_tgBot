import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { generateTeamInvite, buildInviteDeepLink } from '../services/invite';
import { buildMainKeyboard, buildWelcomeKeyboard } from '../keyboards/main';

export function registerCaptainHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  // Helper function to check authentication
  const requireAuth = (ctx: any) => {
    const isAuth = Boolean((ctx.state as any).isAuthenticated);
    if (!isAuth) {
      // @ts-ignore
      ctx.reply(ctx.i18n.t('auth.sign_in_first'), buildWelcomeKeyboard(ctx));
      return false;
    }
    return true;
  };

  async function showTeam(ctx: any) {
    if (!requireAuth(ctx)) return;
    const userId = (ctx.state as any).userId as string;
    let team = await prisma.team.findFirst({ where: { captainId: userId }, include: { members: { include: { user: true } } } });
    if (!team) {
      const tm = await prisma.teamMember.findFirst({ where: { userId }, include: { team: { include: { members: { include: { user: true } } } } } });
      if (tm) team = tm.team as any;
    }
    if (!team) {
      await ctx.reply('Jamoa yo‘q. Yaratamizmi? / Нет команды. Создать?', { reply_markup: { inline_keyboard: [[{ text: '➕ Jamoa yaratish', callback_data: 'team_create_scene' }], [{ text: '⬅️ Menyuga qaytish', callback_data: 'back_menu' }]] } } as any);
      return;
    }
    const userId2 = (ctx.state as any).userId as string;
    const isCaptain = team.captainId === userId2;
    const count = team.members.length;
    const list = team.members.map((m: { user: { firstName: string; lastName?: string | null; phone?: string | null; username?: string | null } }, i: number) => `${i + 1}. ${m.user.firstName} ${m.user.lastName ?? ''} ${m.user.phone ?? ''} @${m.user.username ?? ''}`).join('\n');
    const warn = count < 6 ? '\n⚠️ Kamida 6 o‘yinchi bo‘lishi kerak / Минимум 6 игроков' : '';
    const keyboard: any[] = [];
    if (isCaptain) {
      keyboard.push([{ text: '✏️ Nomni tahrirlash', callback_data: `team_edit_name_${team.id}` }]);
      keyboard.push([{ text: '📝 Tavsifni tahrirlash', callback_data: `team_edit_desc_${team.id}` }]);
      keyboard.push([{ text: '🔗 Taklif havolasi', callback_data: `team_invite_${team.id}` }]);
      keyboard.push([{ text: '➕ A’zo qo‘shish', callback_data: `team_add_more_${team.id}` }]);
      keyboard.push([{ text: '🗑️ A’zoni olib tashlash', callback_data: `team_remove_${team.id}` }]);
      keyboard.push([{ text: '👑 Kapitanni o‘zgartirish', callback_data: `team_promote_${team.id}` }]);
    } else {
      keyboard.push([{ text: '🚪 Jamoani tark etish', callback_data: `team_leave_${team.id}` }]);
    }
    keyboard.push([{ text: '⬅️ Menyuga qaytish', callback_data: 'back_menu' }]);
    await ctx.reply(`👥 ${team.name}\nA’zolar: ${count}${warn}\n${list}`, { reply_markup: { inline_keyboard: keyboard } } as any);
  }
  // Entry point from main menu
  bot.hears(['👥 Jamoa', '👥 Команда'], showTeam);
  bot.command('team', showTeam);

  bot.command('team', async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const team = await prisma.team.findFirst({ where: { captainId: userId }, include: { members: { include: { user: true } } } });
    if (!team) {
      return ctx.reply('Sizda jamoa yo‘q. Yaratamizmi? / Нет команды. Создать?', {
        reply_markup: { inline_keyboard: [[{ text: '➕ Jamoa yaratish', callback_data: 'team_create_scene' }]] },
      } as any);
    }
    const list = team.members.map((m: { user: { firstName: string; phone?: string | null } }, i: number) => `${i + 1}. ${m.user.firstName} ${m.user.phone ?? ''}`).join('\n');
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

  bot.action('back_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx));
  });

  bot.action(/team_add_more_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    (ctx.session as any).addMemberTeamId = teamId;
    await ctx.scene.enter('team:addMember');
  });

  bot.action(/team_invite_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    const inv = await generateTeamInvite(prisma, teamId);
    const url = buildInviteDeepLink(inv.token);
    await ctx.reply(`🔗 Havola: ${url}\n⏳ Amal qilish muddati: ${inv.expires.toISOString().slice(0,16).replace('T',' ')}`);
  });

  // Edit name/description
  bot.action(/team_edit_name_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    (ctx.session as any).editTeamNameId = teamId;
    await ctx.reply('Yangi nomni yuboring / Отправьте новое название');
  });
  bot.action(/team_edit_desc_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    (ctx.session as any).editTeamDescId = teamId;
    await ctx.reply('Yangi tavsifni yuboring / Отправьте описание');
  });
  bot.on('text', async (ctx, next) => {
    const sess: any = ctx.session || {};
    const userId = (ctx.state as any).userId as string;
    if (sess.editTeamNameId) {
      const team = await prisma.team.findUnique({ where: { id: sess.editTeamNameId } });
      if (team?.captainId !== userId) { sess.editTeamNameId = undefined; return next(); }
      await prisma.team.update({ where: { id: team.id }, data: { name: (ctx.message as any).text.trim() } });
      sess.editTeamNameId = undefined;
      await ctx.reply('✅ Nom yangilandi');
      return;
    }
    if (sess.editTeamDescId) {
      const team = await prisma.team.findUnique({ where: { id: sess.editTeamDescId } });
      if (team?.captainId !== userId) { sess.editTeamDescId = undefined; return next(); }
      await prisma.team.update({ where: { id: team.id }, data: { description: (ctx.message as any).text.trim() } });
      sess.editTeamDescId = undefined;
      await ctx.reply('✅ Tavsif yangilandi');
      return;
    }
    return next();
  });

  // Remove member list
  bot.action(/team_remove_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { members: { include: { user: true } } } });
    if (!team) return;
    const rows = team.members.filter((m: { userId: string }) => m.userId !== team.captainId).map((m: { userId: string; user: { firstName: string; lastName?: string | null } }) => [{ text: `🗑️ ${m.user.firstName} ${m.user.lastName ?? ''}`, callback_data: `team_remove_member_${team.id}_${m.userId}` }]);
    if (!rows.length) return ctx.reply('O‘chirish uchun a’zo yo‘q');
    await ctx.reply('Kimni olib tashlaymiz?', { reply_markup: { inline_keyboard: rows } } as any);
  });
  bot.action(/team_remove_member_(.*)_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    const targetUserId = (ctx.match as any)[2] as string;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    const userId = (ctx.state as any).userId as string;
    if (!team || team.captainId !== userId) return ctx.reply('Faqat kapitan');
    await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId: targetUserId } } });
    const member = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (member?.telegramId) { try { await ctx.telegram.sendMessage(member.telegramId, `🚪 Siz ${team.name} jamoasidan chiqarildingiz.`); } catch {} }
    await ctx.reply('✅ Olib tashlandi');
  });

  // Promote to captain
  bot.action(/team_promote_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { members: true } });
    if (!team) return;
    const rows = team.members.filter((m: { userId: string }) => m.userId !== team.captainId).map((m: { userId: string }) => [{ text: `👑 ${m.userId}`, callback_data: `team_promote_member_${team.id}_${m.userId}` }]);
    if (!rows.length) return ctx.reply('A’zo topilmadi');
    await ctx.reply('Kimni kapitan qilamiz?', { reply_markup: { inline_keyboard: rows } } as any);
  });
  bot.action(/team_promote_member_(.*)_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    const newCapId = (ctx.match as any)[2] as string;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    const userId = (ctx.state as any).userId as string;
    if (!team || team.captainId !== userId) return ctx.reply('Faqat kapitan');
    await prisma.team.update({ where: { id: teamId }, data: { captainId: newCapId } });
    await ctx.reply('✅ Kapitan o‘zgartirildi');
  });

  // Leave team (members only)
  bot.action(/team_leave_(.*)/, async (ctx) => {
    const teamId = (ctx.match as any)[1] as string;
    const userId = (ctx.state as any).userId as string;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return;
    if (team.captainId === userId) return ctx.reply('Kapitan jamoani tark eta olmaydi. Avval kapitanni o‘zgartiring.');
    await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
    await ctx.reply('✅ Jamoani tark etdingiz');
    const cap = await prisma.user.findUnique({ where: { id: team.captainId } });
    if (cap?.telegramId) { try { await ctx.telegram.sendMessage(cap.telegramId, `🚪 A’zo jamoani tark etdi.`); } catch {} }
  });
}


