import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { createPaymentForRegistration, paymentInstructions, createPaymentForSessionRegistration } from '../services/payments';

export function registerPaymentHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.action(/signup_(.*)/, async (ctx, next) => {
    await next(); // let main handler create registration first
    const matchId = (ctx.match as any)[1] as string;
    const userId = (ctx.state as any).userId as string;
    const reg = await prisma.registration.findFirst({
      where: { matchId, userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!reg) return;
    const p = await createPaymentForRegistration(prisma, reg.id, userId, undefined);
    if (p) {
      await ctx.reply(paymentInstructions() + `\n\nSummasi: ${p.amount} UZS`);
    }
  });

  bot.action(/sess_signup_(ind|team)_(.*)/, async (ctx) => {
    const type = (ctx.match as any)[1] as 'ind' | 'team';
    const sessionId = (ctx.match as any)[2] as string;
    const userId = (ctx.state as any).userId as string;
    let reg = null as any;
    if (type === 'ind') {
      reg = await (prisma as any).sessionRegistration.findFirst({ where: { sessionId, userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
      if (!reg) reg = await (prisma as any).sessionRegistration.create({ data: { sessionId, userId, type: 'INDIVIDUAL', status: 'PENDING' } });
      const p = await createPaymentForSessionRegistration(prisma as any, reg.id, userId, undefined);
      if (p) await ctx.reply(paymentInstructions() + `\n\nSummasi: ${p.amount} UZS`);
    } else {
      const team = await prisma.team.findFirst({ where: { captainId: userId } });
      if (!team) return ctx.reply('Avval jamoa yarating: /team');
      reg = await (prisma as any).sessionRegistration.findFirst({ where: { sessionId, teamId: team.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
      if (!reg) reg = await (prisma as any).sessionRegistration.create({ data: { sessionId, teamId: team.id, type: 'TEAM', status: 'PENDING' } });
      const p = await createPaymentForSessionRegistration(prisma as any, reg.id, undefined, team.id);
      if (p) await ctx.reply(paymentInstructions() + `\n\nJamoa: ${team.name}\nSummasi: ${p.amount} UZS`);
    }
  });
}


