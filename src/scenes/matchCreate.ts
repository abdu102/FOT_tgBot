import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function createMatchScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'match:create',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) {
        await ctx.reply('Faqat admin / Только админ');
        return ctx.scene.leave();
      }
      await ctx.reply('Sana-vaqt (YYYY-MM-DD HH:mm) / Дата-время');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).dateTime = (ctx.message as any)?.text?.trim();
      await ctx.reply('Manzil / Локация');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).location = (ctx.message as any)?.text?.trim();
      await ctx.reply('Narx (UZS) / Цена');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).price = parseInt((ctx.message as any)?.text?.trim());
      await ctx.reply('Jamoa hajmi (default 7) / Размер команды');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const capacity = parseInt((ctx.message as any)?.text?.trim());
      const dt = (ctx.wizard.state as any).dateTime as string;
      const location = (ctx.wizard.state as any).location as string;
      const price = (ctx.wizard.state as any).price as number;
      await prisma.match.create({
        data: {
          dateTime: new Date(dt.replace(' ', 'T') + ':00'),
          location,
          pricePerUser: isNaN(price) ? 40000 : price,
          capacityPerTeam: isNaN(capacity) ? 7 : capacity,
        },
      });
      await ctx.reply('✅ Match yaratildi / Матч создан');
      return ctx.scene.leave();
    },
  );
  return scene;
}


