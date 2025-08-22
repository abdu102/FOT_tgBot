import { Scenes, Markup } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { linkTelegramUserByPhone } from '../services/linkByPhone';

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
      await ctx.reply('🧭 Pozitsiya? (GK/DEF/MID/FWD)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const position = (ctx.message as any)?.text?.trim();
      (ctx.wizard.state as any).position = position;
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
      await prisma.user.update({
        where: { id: userId },
        data: {
          firstName: (ctx.wizard.state as any).name,
          age: (ctx.wizard.state as any).age,
          position: (ctx.wizard.state as any).position,
          phone,
        },
      });
      await linkTelegramUserByPhone(prisma, userId);
      await ctx.reply('✅ Ro‘yxatdan o‘tish yakunlandi! / Регистрация завершена!', Markup.removeKeyboard());
      return ctx.scene.leave();
    },
  );
  return scene;
}


