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
      await ctx.reply('📅 Yoshingiz? / Ваш возраст?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const age = parseInt((ctx.message as any)?.text?.trim());
      (ctx.wizard.state as any).age = isNaN(age) ? null : age;
      await ctx.reply('🔐 Parol kiriting / Введите пароль (min 4)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const pass = (ctx.message as any)?.text?.trim();
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
      const bcrypt = (await import('bcryptjs')).default;
      const hash = await bcrypt.hash((ctx.wizard.state as any).password || '0000', 10);
      await prisma.user.update({
        where: { id: userId },
        data: {
          firstName: (ctx.wizard.state as any).name,
          age: (ctx.wizard.state as any).age,
          phone,
          passwordHash: hash,
        },
      });
      await linkTelegramUserByPhone(prisma, userId);
      await ctx.reply('✅ Ro‘yxatdan o‘tish yakunlandi! / Регистрация завершена!', Markup.removeKeyboard());
      await ctx.reply('📋 Asosiy menyu / Главное меню', buildMainKeyboard(ctx));
      return ctx.scene.leave();
    },
  );
  return scene;
}


