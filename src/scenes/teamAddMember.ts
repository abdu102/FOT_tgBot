import { Scenes, Markup } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildMainKeyboard } from '../keyboards/main';

export function teamAddMemberScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'team:addMember',
    async (ctx) => {
      await ctx.reply('👤 A’zoning ism va familiyasi?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const txt = (ctx.message as any)?.text?.trim();
      if (txt === '⬅️ Menyuga qaytish') { await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); }
      (ctx.wizard.state as any).name = txt;
      await ctx.reply('📅 Yoshi? / Возраст?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const txt = (ctx.message as any)?.text?.trim();
      if (txt === '⬅️ Menyuga qaytish') { await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); }
      const age = parseInt(txt);
      (ctx.wizard.state as any).age = isNaN(age) ? undefined : age;
      await ctx.reply('📞 Telefon raqam? (+998...)', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const txt = (ctx.message as any)?.text?.trim();
      if (txt === '⬅️ Menyuga qaytish') { await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); }
      const phone = (txt || '').replace(/[^0-9+]/g, '');
      (ctx.wizard.state as any).phone = phone || undefined;
      await ctx.reply('👤 Telegram username ( @siz_yozmasdan )?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const txt = (ctx.message as any)?.text?.trim();
      if (txt === '⬅️ Menyuga qaytish') { await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); }
      const username = (txt || '').replace(/^@/, '').toLowerCase();
      const teamId = (ctx.session as any).addMemberTeamId as string;
      if (!teamId) { await ctx.reply('Xatolik: teamId topilmadi'); return ctx.scene.leave(); }
      // persist
      const name = (ctx.wizard.state as any).name as string;
      const age = (ctx.wizard.state as any).age as number | undefined;
      const phone = (ctx.wizard.state as any).phone as string | undefined;
      let u = phone ? await prisma.user.findUnique({ where: { phone } }).catch(() => null) : null;
      if (!u) {
        u = await prisma.user.create({ data: { telegramId: `unlinked_${Date.now()}_${Math.random().toString(36).slice(2)}`, firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') || null, phone: phone || null, age: age || null, username } });
      }
      await prisma.teamMember.upsert({ where: { teamId_userId: { teamId, userId: u.id } }, update: {}, create: { teamId, userId: u.id, role: 'player' } });
      await ctx.reply('✅ A’zo qo‘shildi', Markup.removeKeyboard());
      await ctx.reply('Davom etasizmi?', { reply_markup: { inline_keyboard: [[{ text: '➕ Yana a’zo', callback_data: 'add_more_again' }], [{ text: '⬅️ Menyu', callback_data: 'back_menu' }]] } as any });
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (!('callback_query' in ctx.update)) return;
      const data = (ctx.update.callback_query as any).data as string;
      if (data === 'add_more_again') {
        await ctx.answerCbQuery();
        await ctx.reply('👤 A’zoning ism va familiyasi?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
        return ctx.wizard.selectStep(1);
      }
      if (data === 'back_menu') {
        await ctx.answerCbQuery();
        await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx));
        return ctx.scene.leave();
      }
    }
  );
  return scene;
}


