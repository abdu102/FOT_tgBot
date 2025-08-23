import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildAuthKeyboard, buildMainKeyboard } from '../keyboards/main';
import bcrypt from 'bcryptjs';

export function loginScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'auth:login',
    async (ctx) => {
      await ctx.reply('Login: username yuboring / Отправьте username');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).loginName = (ctx.message as any)?.text?.trim().toLowerCase();
      // Ensure user exists by username
      const name = (ctx.wizard.state as any).loginName as string;
      const user = await prisma.user.findUnique({ where: { username: name } });
      if (!user) {
        await ctx.reply('Bunday username topilmadi / Пользователь не найден');
        return ctx.scene.leave();
      }
      await ctx.reply('Parol yuboring / Отправьте пароль');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const name = ((ctx.wizard.state as any).loginName as string).trim().toLowerCase();
      const pass = (ctx.message as any)?.text?.trim();
      const user = await prisma.user.findFirst({ where: { username: name } });
      const bcryptModule: any = await import('bcryptjs');
      const bcrypt = bcryptModule.default || bcryptModule;
      if (!user?.passwordHash || !(await bcrypt.compare(pass, user.passwordHash))) {
        await ctx.reply('Login yoki parol noto‘g‘ri / Неверные данные', buildAuthKeyboard(ctx));
        return ctx.scene.leave();
      }
      // Do NOT overwrite other accounts on same device: if some user already linked with this telegramId, unlink it first
      const tgId = String(ctx.from?.id);
      await prisma.user.updateMany({ where: { telegramId: tgId, id: { not: user.id } }, data: { telegramId: `unlinked_${Date.now()}_${Math.random().toString(36).slice(2)}` } });
      await prisma.user.update({ where: { id: user.id }, data: { telegramId: tgId, isActive: true } });
      (ctx.state as any).userId = user.id;
      (ctx.state as any).isAuthenticated = true;
      await ctx.reply('✅ Kirish muvaffaqiyatli / Вход выполнен');
      await ctx.reply('📋 Asosiy menyu / Главное меню', (user.phone ? buildMainKeyboard(ctx) : buildAuthKeyboard(ctx)) as any);
      return ctx.scene.leave();
    }
  );
  return scene;
}


