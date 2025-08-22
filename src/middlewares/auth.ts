import type { PrismaClient } from '@prisma/client';
import type { Context, MiddlewareFn } from 'telegraf';

export function authMiddleware(prisma: PrismaClient): MiddlewareFn<Context> {
  const adminIds = (process.env.ADMIN_TG_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return async (ctx, next) => {
    if (!ctx.from) return next();
    (ctx.state as any).isAdmin = adminIds.includes(String(ctx.from.id));
    return next();
  };
}


