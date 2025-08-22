import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { addMatchStat } from '../services/stats';

export function statsEntryScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:stats',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) {
        await ctx.reply('Faqat admin / Только админ');
        return ctx.scene.leave();
      }
      await ctx.reply('Match ID?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).matchId = (ctx.message as any)?.text?.trim();
      await ctx.reply('User ID?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).userId = (ctx.message as any)?.text?.trim();
      await ctx.reply('Goals?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).goals = parseInt((ctx.message as any)?.text?.trim());
      await ctx.reply('Assists?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).assists = parseInt((ctx.message as any)?.text?.trim());
      await ctx.reply('Win? (yes/no)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const st = ctx.wizard.state as any;
      const won = String((ctx.message as any)?.text || '').toLowerCase().startsWith('y');
      await addMatchStat(prisma, {
        matchId: st.matchId,
        userId: st.userId,
        goals: isNaN(st.goals) ? 0 : st.goals,
        assists: isNaN(st.assists) ? 0 : st.assists,
        won,
      });
      await ctx.reply('✅ Saqlandi / Сохранено');
      return ctx.scene.leave();
    }
  );
  return scene;
}


