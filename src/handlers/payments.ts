import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { createPaymentForRegistration, paymentInstructions } from '../services/payments';

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
}


