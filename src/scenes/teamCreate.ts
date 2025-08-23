import { Scenes, Markup } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildMainKeyboard } from '../keyboards/main';

type MemberDraft = { name: string; phone?: string; age?: number; username?: string };

export function teamCreateScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'team:create',
    async (ctx) => {
      (ctx.wizard.state as any).members = [] as MemberDraft[];
      await ctx.reply('👥 Jamoa nomi? / Название команды?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).teamName = (ctx.message as any)?.text?.trim();
      await ctx.reply('👤 A’zoning ism va familiyasi? / Имя и фамилия участника?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
      return ctx.wizard.next();
    },
    // Step 2: member name
    async (ctx) => {
      const txt = (ctx.message as any)?.text?.trim();
      if (txt === '⬅️ Menyuga qaytish') { await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); }
      (ctx.wizard.state as any).currentName = txt;
      await ctx.reply('📅 Yoshi? / Возраст?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
      return ctx.wizard.next();
    },
    // Step 3: member age
    async (ctx) => {
      const txt = (ctx.message as any)?.text?.trim();
      if (txt === '⬅️ Menyuga qaytish') { await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); }
      const ageNum = parseInt(txt);
      (ctx.wizard.state as any).currentAge = isNaN(ageNum) ? undefined : ageNum;
      await ctx.reply('📞 Telefon raqam? (+998...)', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
      return ctx.wizard.next();
    },
    // Step 4: member phone
    async (ctx) => {
      const txt = (ctx.message as any)?.text?.trim();
      if (txt === '⬅️ Menyuga qaytish') { await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); }
      const phone = (txt || '').replace(/[^0-9+]/g, '');
      (ctx.wizard.state as any).currentPhone = phone || undefined;
      await ctx.reply('👤 Telegram username ( @siz_yozmasdan )?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
      return ctx.wizard.next();
    },
    // Step 5: member username and push
    async (ctx) => {
      const txt = (ctx.message as any)?.text?.trim();
      if (txt === '⬅️ Menyuga qaytish') { await ctx.reply('Menyuga qaytish'); return ctx.scene.leave(); }
      const username = (txt || '').replace(/^@/, '').toLowerCase();
      const member: MemberDraft = {
        name: (ctx.wizard.state as any).currentName,
        phone: (ctx.wizard.state as any).currentPhone,
        age: (ctx.wizard.state as any).currentAge,
        username,
      };
      (ctx.wizard.state as any).members.push(member);
      (ctx.wizard.state as any).currentName = undefined;
      (ctx.wizard.state as any).currentPhone = undefined;
      (ctx.wizard.state as any).currentAge = undefined;
      await ctx.reply('Yana a’zo qo‘shasizmi?', Markup.inlineKeyboard([
        [Markup.button.callback('➕ Qo‘shish', 'team_add_member')],
        [Markup.button.callback('✅ Yakunlash', 'team_finish')],
        [Markup.button.callback('⬅️ Menyuga qaytish', 'team_back_menu')],
      ]));
      return ctx.wizard.next();
    },
    // Step 6: inline handler add/finish/back
    async (ctx) => {
      if (!('callback_query' in ctx.update)) return;
      const data = (ctx.update.callback_query as any).data as string;
      if (data === 'team_add_member') {
        await ctx.answerCbQuery();
        await ctx.reply('👤 A’zoning ism va familiyasi?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize());
        return ctx.wizard.selectStep(2);
      }
      if (data === 'team_finish') {
        await ctx.answerCbQuery();
        return ctx.wizard.selectStep(7);
      }
      if (data === 'team_back_menu') {
        await ctx.answerCbQuery();
        await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx));
        return ctx.scene.leave();
      }
    },
    // Step 7: persist team and members
    async (ctx) => {
      const userId = (ctx.state as any).userId as string;
      const name = (ctx.wizard.state as any).teamName as string;
      const members = (ctx.wizard.state as any).members as MemberDraft[];
      // Ensure one team per captain: find or create
      let team = await prisma.team.findFirst({ where: { captainId: userId } });
      if (team) {
        team = await prisma.team.update({ where: { id: team.id }, data: { name } });
      } else {
        team = await prisma.team.create({ data: { name, captainId: userId } });
      }
      // add captain
      await prisma.teamMember.create({ data: { teamId: team.id, userId, role: 'captain' } });
      for (const m of members) {
        let u = m.phone ? await prisma.user.findUnique({ where: { phone: m.phone } }).catch(() => null) : null;
        if (!u) {
          u = await prisma.user.create({ data: { telegramId: `unlinked_${Date.now()}_${Math.random().toString(36).slice(2)}`, firstName: m.name.split(' ')[0], lastName: m.name.split(' ').slice(1).join(' ') || null, phone: m.phone, age: m.age || null, username: m.username } });
        }
        await prisma.teamMember.upsert({
          where: { teamId_userId: { teamId: team.id, userId: u.id } },
          update: {},
          create: { teamId: team.id, userId: u.id, role: 'player' },
        });
      }
      const count = (await prisma.teamMember.count({ where: { teamId: team.id } })) - 1; // exclude captain
      const warn = count < 6 ? '\n⚠️ Kamida 6 o‘yinchi talab etiladi / Минимум 6 игроков' : '';
      await ctx.reply(`✅ Jamoa saqlandi. A’zolar: ${count}${warn}`, Markup.removeKeyboard());
      return ctx.scene.leave();
    }
  );

  scene.action('team_add_member', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('👤 A’zoning ism va familiyasi?', Markup.keyboard([[ '⬅️ Menyuga qaytish' ]]).resize()); return ctx.wizard.selectStep(2); });
  scene.action('team_finish', async (ctx) => { await ctx.answerCbQuery(); return ctx.wizard.selectStep(7); });
  scene.action('team_back_menu', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); });

  return scene;
}


