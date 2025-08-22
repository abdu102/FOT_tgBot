import { Scenes, Markup } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

type TeamWizardState = {
  teamName?: string;
  members: Array<{ name: string; phone?: string; age?: number }>;
};

export function onboardingTeamScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'onboarding:team',
    async (ctx) => {
      (ctx.wizard.state as any as TeamWizardState).members = [];
      await ctx.reply('👥 Jamoa nomi? / Название команды?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const teamName = (ctx.message as any)?.text?.trim();
      (ctx.wizard.state as any as TeamWizardState).teamName = teamName;
      await ctx.reply('👤 1-o‘yinchi ismi? / Имя игрока №1');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const name = (ctx.message as any)?.text?.trim();
      (ctx.wizard.state as any as TeamWizardState).members.push({ name });
      await ctx.reply('📞 Telefon yoki Contact yuboring / Телефон или контакт',
        Markup.keyboard([[Markup.button.contactRequest('📞 Share / Отправить')]]).resize().oneTime());
      return ctx.wizard.next();
    },
    async (ctx) => {
      const msg: any = ctx.message;
      const phone = msg?.contact?.phone_number || msg?.text?.trim();
      const state = (ctx.wizard.state as any as TeamWizardState);
      state.members[state.members.length - 1].phone = phone;
      await ctx.reply('📅 Yoshi? / Возраст?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const age = parseInt((ctx.message as any)?.text?.trim());
      const state = (ctx.wizard.state as any as TeamWizardState);
      state.members[state.members.length - 1].age = isNaN(age) ? undefined : age;
      const state = (ctx.wizard.state as any as TeamWizardState);
      const count = state.members.length;
      if (count < 7) {
        await ctx.reply(`👤 ${count + 1}-o‘yinchi ismi? / Имя игрока №${count + 1}`);
        return ctx.wizard.selectStep(2);
      }
      // Persist team and members
      const captainUserId = (ctx.state as any).userId as string;
      const captain = await prisma.user.findUnique({ where: { id: captainUserId } });
      if (!captain) {
        await ctx.reply('Xatolik, keyinroq urinib ko‘ring / Ошибка, повторите позже');
        return ctx.scene.leave();
      }
      const team = await prisma.team.create({
        data: {
          name: state.teamName!,
          captainId: captainUserId,
          members: {
            create: [
              { user: { connect: { id: captainUserId } }, role: 'captain' },
            ],
          },
        },
        include: { members: true },
      });

      for (const m of state.members) {
        // Find or create user by phone
        let user = m.phone
          ? await prisma.user.findUnique({ where: { phone: m.phone } })
          : null;
        if (!user) {
          user = await prisma.user.create({
            data: {
              telegramId: `unlinked_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              firstName: m.name,
              phone: m.phone,
              age: m.age,
            },
          });
        }
        await prisma.teamMember.upsert({
          where: { teamId_userId: { teamId: team.id, userId: user.id } },
          update: {},
          create: { teamId: team.id, userId: user.id, role: 'player' },
        });
      }
      await ctx.reply('✅ Jamoa ro‘yxatdan o‘tdi! / Команда зарегистрирована!', Markup.removeKeyboard());
      return ctx.scene.leave();
    },
  );
  return scene;
}


