import { Scenes, Markup } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

type MemberDraft = { name: string; phone?: string; age?: number };

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
      await ctx.reply('A’zolarni qo‘shasizmi? / Добавить участников?', Markup.inlineKeyboard([
        [Markup.button.callback('➕ Qo‘shish', 'team_add_member')],
        [Markup.button.callback('✅ Yakunlash', 'team_finish')],
        [Markup.button.callback('⬅️ Menyuga qaytish', 'team_back_menu')],
      ]));
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (!('callback_query' in ctx.update)) return;
      const data = (ctx.update.callback_query as any).data as string;
      if (data === 'team_add_member') {
        await ctx.reply('👤 Ism? / Имя?');
        return ctx.wizard.selectStep(3);
      }
      if (data === 'team_finish') {
        return ctx.wizard.selectStep(6);
      }
      if (data === 'team_back_menu') {
        await ctx.reply('Menyuga qaytdingiz / Возврат в меню');
        return ctx.scene.leave();
      }
    },
    // Step 3: member name
    async (ctx) => {
      (ctx.wizard.state as any).currentName = (ctx.message as any)?.text?.trim();
      await ctx.reply(
        '📞 Telefon yoki kontakt yuboring / Телефон или контакт',
        Markup.keyboard([[Markup.button.contactRequest('📞 Share / Отправить')]]).resize().oneTime()
      );
      return ctx.wizard.next();
    },
    // Step 4: member phone
    async (ctx) => {
      const msg: any = ctx.message;
      const raw = msg?.contact?.phone_number || msg?.text?.trim();
      const phone = (raw || '').replace(/[^0-9+]/g, '');
      (ctx.wizard.state as any).currentPhone = phone || undefined;
      await ctx.reply('📅 Yoshi? / Возраст?');
      return ctx.wizard.next();
    },
    // Step 5: member age, push and back to add/finish menu
    async (ctx) => {
      const ageNum = parseInt((ctx.message as any)?.text?.trim());
      const member: MemberDraft = {
        name: (ctx.wizard.state as any).currentName,
        phone: (ctx.wizard.state as any).currentPhone,
        age: isNaN(ageNum) ? undefined : ageNum,
      };
      (ctx.wizard.state as any).members.push(member);
      // clear temp
      (ctx.wizard.state as any).currentName = undefined;
      (ctx.wizard.state as any).currentPhone = undefined;
      await ctx.reply('Yana a’zo qo‘shasizmi?', Markup.inlineKeyboard([
        [Markup.button.callback('➕ Qo‘shish', 'team_add_member')],
        [Markup.button.callback('✅ Yakunlash', 'team_finish')],
        [Markup.button.callback('⬅️ Menyuga qaytish', 'team_back_menu')],
      ]));
      return ctx.wizard.selectStep(2);
    },
    // Step 6: persist team and members
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
          u = await prisma.user.create({ data: { telegramId: `unlinked_${Date.now()}_${Math.random().toString(36).slice(2)}`, firstName: m.name.split(' ')[0], lastName: m.name.split(' ').slice(1).join(' ') || null, phone: m.phone, age: m.age || null } });
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

  scene.action('team_add_member', async (ctx) => ctx.wizard.selectStep(3));
  scene.action('team_finish', async (ctx) => ctx.wizard.selectStep(6));
  scene.action('team_back_menu', async (ctx) => ctx.scene.leave());

  return scene;
}


