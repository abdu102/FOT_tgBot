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
      await ctx.reply('Stadion nomi / Название стадиона');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).stadium = (ctx.message as any)?.text?.trim();
      await ctx.reply('Joy (manzil) / Место (локация)');
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
      await ctx.reply('Match turi? (5v5 / 6v6)');
      (ctx.wizard.state as any).capacity = capacity;
      return ctx.wizard.next();
    },
    async (ctx) => {
      const typeRaw = String((ctx.message as any)?.text || '').toLowerCase();
      const type = typeRaw.includes('6') ? 'SIX_V_SIX' : 'FIVE_V_FIVE';
      const dt = (ctx.wizard.state as any).dateTime as string;
      const stadium = (ctx.wizard.state as any).stadium as string;
      const location = (ctx.wizard.state as any).location as string;
      const price = (ctx.wizard.state as any).price as number;
      const capacity = (ctx.wizard.state as any).capacity as number;
      await prisma.match.create({
        data: {
          dateTime: new Date(dt.replace(' ', 'T') + ':00'),
          location: stadium ? `${stadium} — ${location}` : location,
          pricePerUser: isNaN(price) ? 40000 : price,
          capacityPerTeam: isNaN(capacity) ? (type === 'SIX_V_SIX' ? 6 : 5) : capacity,
          type: type as any,
        } as any,
      });
      await ctx.reply('✅ Match yaratildi / Матч создан');
      return ctx.scene.leave();
    },
  );
  return scene;
}


