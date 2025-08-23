import type { PrismaClient } from '@prisma/client';
import type { Context, MiddlewareFn } from 'telegraf';

export function ensureUserMiddleware(prisma: PrismaClient): MiddlewareFn<Context> {
  return async (ctx, next) => {
    if (!ctx.from) return next();
    const telegramId = String(ctx.from.id);
    const firstName = ctx.from.first_name || '';
    const lastName = ctx.from.last_name || null;
    try {
      let user = await prisma.user.findUnique({ where: { telegramId } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId,
            firstName,
            lastName,
          },
        });
      }
      (ctx.state as any).userId = user.id;
      (ctx.state as any).isRegistered = Boolean(user.phone);
      if (ctx.i18n && user.language) {
        // @ts-ignore telegraf-i18n typing
        ctx.i18n.locale(user.language);
      }
    } catch (e) {
      console.error('ensureUser error', e);
    }
    return next();
  };
}


