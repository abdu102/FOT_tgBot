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
      try {
        const name = ((ctx.wizard.state as any).loginName as string).trim().toLowerCase();
        const pass = (ctx.message as any)?.text?.trim();
        const user = await prisma.user.findFirst({ where: { username: name } });
        const bcryptModule: any = await import('bcryptjs');
        const bcrypt = bcryptModule.default || bcryptModule;
        if (!user?.passwordHash || !(await bcrypt.compare(pass, user.passwordHash))) {
          await ctx.reply('Login yoki parol noto‘g‘ri / Неверные данные', buildAuthKeyboard(ctx));
          return ctx.scene.leave();
        }
        const tgId = String(ctx.from?.id);
        await prisma.user.updateMany({ where: { telegramId: tgId, id: { not: user.id } }, data: { telegramId: `unlinked_${Date.now()}_${Math.random().toString(36).slice(2)}` } });
        await prisma.user.update({ where: { id: user.id }, data: { telegramId: tgId, isActive: true } });
        (ctx.state as any).userId = user.id;
        (ctx.state as any).isAuthenticated = true;
        await ctx.reply('✅ Kirish muvaffaqiyatli / Вход выполнен');
        await ctx.reply('📋 Asosiy menyu / Главное меню', (user.phone ? buildMainKeyboard(ctx) : buildAuthKeyboard(ctx)) as any);
        // auto-join pending invite if exists
        const pending = (ctx.session as any).pendingInviteToken as string | undefined;
        if (pending) {
          const { tryJoinByInvite } = await import('../services/invite');
          const team = await tryJoinByInvite(prisma, pending, user.id);
          (ctx.session as any).pendingInviteToken = undefined;
          if (team) {
            await ctx.reply(`✅ Siz ${team.name} jamoasiga qo‘shildingiz!`);
            const cap = await prisma.user.findUnique({ where: { id: team.captainId } });
            if (cap?.telegramId) { try { await ctx.telegram.sendMessage(cap.telegramId, `👤 ${user.firstName} jamoangizga qo‘shildi.`); } catch {} }
          }
        }
        return ctx.scene.leave();
      } catch (e) {
        console.error('login error', e);
        await ctx.reply('Xatolik yuz berdi. Qayta urinib ko‘ring. / Произошла ошибка, попробуйте ещё раз.', buildAuthKeyboard(ctx));
        return ctx.scene.leave();
      }
    }
  );
  return scene;
}


