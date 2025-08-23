import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function winnersScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:winners',
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
      await ctx.reply('Winner team ID? (o‘tkazish uchun - skip)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const winnerTeamIdRaw = (ctx.message as any)?.text?.trim();
      (ctx.wizard.state as any).winnerTeamId = winnerTeamIdRaw && winnerTeamIdRaw.toLowerCase() !== 'skip' ? winnerTeamIdRaw : null;
      await ctx.reply('Man of the Match user ID? (o‘tkazish uchun - skip)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const st = ctx.wizard.state as any;
      const momUserIdRaw = (ctx.message as any)?.text?.trim();
      const data: any = {};
      if (st.winnerTeamId) data.winnerTeamId = st.winnerTeamId as string;
      if (momUserIdRaw && momUserIdRaw.toLowerCase() !== 'skip') data.manOfTheMatchUserId = momUserIdRaw;
      await prisma.match.update({ where: { id: st.matchId as string }, data });
      await ctx.reply('✅ Winner/MoM saqlandi');
      return ctx.scene.leave();
    }
  );
  return scene;
}


