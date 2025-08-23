import { Scenes, Markup } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { linkTelegramUserByPhone } from '../services/linkByPhone';
import { buildMainKeyboard } from '../keyboards/main';

export function onboardingIndividualScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'onboarding:individual',
    async (ctx) => {
      await ctx.reply('👤 Ismingiz? / Ваше имя?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const name = (ctx.message as any)?.text?.trim();
      (ctx.wizard.state as any).name = name;
      await ctx.reply('👤 Familiyangiz? / Ваша фамилия?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const lastName = (ctx.message as any)?.text?.trim();
      (ctx.wizard.state as any).lastName = lastName;
      await ctx.reply('📅 Yoshingiz? / Ваш возраст?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const age = parseInt((ctx.message as any)?.text?.trim());
      (ctx.wizard.state as any).age = isNaN(age) ? null : age;
      await ctx.reply('👤 Username yarating / Придумайте username (unikal)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const username = (ctx.message as any)?.text?.trim();
      if (!username || username.length < 3) {
        await ctx.reply('Username juda qisqa, qayta yuboring');
        return; // remain on same step
      }
      // check uniqueness
      const uname = username.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { username: uname } }).catch(() => null);
      if (existing) {
        await ctx.reply('Bu username band, boshqasini kiriting');
        return; // stay
      }
      (ctx.wizard.state as any).username = uname;
      await ctx.reply('🔐 Parol kiriting / Введите пароль (min 4)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const pass = (ctx.message as any)?.text?.trim();
      if (!pass || pass.length < 4) {
        await ctx.reply('Parol juda qisqa, qayta yuboring');
        return;
      }
      (ctx.wizard.state as any).password = pass;
      await ctx.reply(
        '📞 Telefon raqamingizni yuboring / Отправьте номер телефона',
        Markup.keyboard([[Markup.button.contactRequest('📞 Share / Отправить')]]).resize().oneTime()
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      const msg: any = ctx.message;
      const phone: string | undefined = msg?.contact?.phone_number || msg?.text?.trim();
      const userId = (ctx.state as any).userId as string;
      const bcryptModule: any = await import('bcryptjs');
      const bcrypt = bcryptModule.default || bcryptModule;
      const hash = await bcrypt.hash((ctx.wizard.state as any).password || '0000', 10);
      const normalizedPhone = (phone || '').replace(/[^0-9+]/g, '');
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            firstName: (ctx.wizard.state as any).name,
            lastName: (ctx.wizard.state as any).lastName,
            age: (ctx.wizard.state as any).age,
            username: (ctx.wizard.state as any).username,
            phone: normalizedPhone || null,
            passwordHash: hash,
            isActive: true,
          },
        });
      } catch (e: any) {
        // Handle unique phone conflict by merging placeholder account
        if (normalizedPhone) {
          const placeholder = await prisma.user.findFirst({ where: { phone: normalizedPhone } });
          if (placeholder && placeholder.id !== userId) {
            const tms = await prisma.teamMember.findMany({ where: { userId: placeholder.id } });
            for (const tm of tms) {
              await prisma.teamMember.upsert({
                where: { teamId_userId: { teamId: tm.teamId, userId } },
                update: {},
                create: { teamId: tm.teamId, userId, role: tm.role || 'player' },
              });
            }
            await prisma.teamMember.deleteMany({ where: { userId: placeholder.id } });
            await prisma.user.delete({ where: { id: placeholder.id } });
            await prisma.user.update({
              where: { id: userId },
              data: {
                firstName: (ctx.wizard.state as any).name,
                lastName: (ctx.wizard.state as any).lastName,
                age: (ctx.wizard.state as any).age,
                username: (ctx.wizard.state as any).username,
                phone: normalizedPhone,
                passwordHash: hash,
                isActive: true,
              },
            });
          }
        }
      }
      await linkTelegramUserByPhone(prisma, userId);
      await ctx.reply('✅ Ro‘yxatdan o‘tish yakunlandi! / Регистрация завершена!', Markup.removeKeyboard());
      await ctx.reply('📋 Asosiy menyu / Главное меню', buildMainKeyboard(ctx));
      (ctx.state as any).isAuthenticated = true;
      return ctx.scene.leave();
    },
  );
  return scene;
}


