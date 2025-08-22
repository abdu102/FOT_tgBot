import { Scenes, Markup } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function onboardingScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'onboarding',
    async (ctx) => {
      await ctx.reply(
        '👋 Salom! / Привет!\n\nQaysi turda ro‘yxatdan o‘tasiz? / Как хотите зарегистрироваться?',
        Markup.inlineKeyboard([
          [Markup.button.callback('👤 O‘yinchi / Игрок', 'reg_individual')],
          [Markup.button.callback('👥 Jamoa / Команда', 'reg_team')],
        ])
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (!('callback_query' in ctx.update)) return;
      const cq = ctx.update.callback_query;
      if (cq && 'data' in cq) {
        const data = (cq as any).data as string;
      if (data === 'reg_individual') {
        (ctx.wizard.state as any).mode = 'INDIVIDUAL';
        await ctx.reply('Ismingiz? / Ваше имя?');
        return ctx.wizard.next();
      }
      if (data === 'reg_team') {
        (ctx.wizard.state as any).mode = 'TEAM';
        await ctx.reply('Jamoa nomi? / Название команды?');
        return ctx.wizard.selectStep(3);
      }
      }
    },
    // Step 2: Individual details
    async (ctx) => {
      const name = 'text' in ctx.message! ? ctx.message!.text.trim() : '';
      (ctx.wizard.state as any).name = name;
      await ctx.reply('Yoshingiz? / Ваш возраст?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const age = parseInt('text' in ctx.message! ? ctx.message!.text.trim() : '');
      (ctx.wizard.state as any).age = isNaN(age) ? null : age;
      await ctx.reply('Pozitsiya? (GK/DEF/MID/FWD) / Позиция?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const position = 'text' in ctx.message! ? ctx.message!.text.trim() : '';
      (ctx.wizard.state as any).position = position;
      await ctx.reply(
        'Telefon raqamingizni yuboring / Отправьте номер телефона',
        Markup.keyboard([
          [Markup.button.contactRequest('📞 Share / Отправить')],
        ]).resize().oneTime()
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      let phone: string | undefined;
      const msg: any = ctx.message;
      if (msg?.contact?.phone_number) {
        phone = msg.contact.phone_number;
      } else if (msg?.text) {
        phone = (msg.text as string).trim();
      }
      const userId = (ctx.state as any).userId as string;
      await prisma.user.update({
        where: { id: userId },
        data: {
          firstName: (ctx.wizard.state as any).name,
          age: (ctx.wizard.state as any).age,
          position: (ctx.wizard.state as any).position,
          phone: phone,
        },
      });
      await ctx.reply('✅ Ro‘yxatdan o‘tish yakunlandi! / Регистрация завершена!', Markup.removeKeyboard());
      return ctx.scene.leave();
    },
  );

  scene.action('reg_individual', async (ctx) => ctx.wizard.selectStep(2));
  scene.action('reg_team', async (ctx) => ctx.wizard.selectStep(3));

  return scene;
}


