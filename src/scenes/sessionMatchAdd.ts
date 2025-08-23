import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function matchAddScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:sessionMatchAdd',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) { await ctx.reply('Faqat admin'); return ctx.scene.leave(); }
      const sid = (ctx.scene.state as any)?.sessionId as string | undefined;
      if (!sid) { await ctx.reply('Session topilmadi'); return ctx.scene.leave(); }
      const st = await (prisma as any).session.findUnique({ where: { id: sid }, include: { teams: { include: { team: true } } } });
      if (!st || st.teams.length < 2) { await ctx.reply('Kamida 2 jamoa bo‘lishi kerak'); return ctx.scene.leave(); }
      const rows = st.teams.map((t: any) => [{ text: t.team.name, callback_data: `sess_pick_home_${sid}_${t.teamId}` }]);
      await ctx.reply('Uy jamoa:', { reply_markup: { inline_keyboard: rows } } as any);
      return ctx.wizard.next();
    },
    async (ctx) => { return; }
  );

  (scene as any).action?.(/sess_pick_home_(.*)_(.*)/, async (ctx: any) => {
    const sid = (ctx.match as any)[1];
    const homeId = (ctx.match as any)[2];
    (ctx.session as any).addHome = homeId;
    (ctx.session as any).addSession = sid;
    const st = await (prisma as any).session.findUnique({ where: { id: sid }, include: { teams: { include: { team: true } } } });
    const rows = st?.teams.filter((t: any) => t.teamId !== homeId).map((t: any) => [{ text: t.team.name, callback_data: `sess_pick_away_${sid}_${t.teamId}` }]) || [];
    await ctx.editMessageReplyMarkup({ inline_keyboard: rows } as any).catch(async () => {
      await ctx.reply('Mehmon jamoa:', { reply_markup: { inline_keyboard: rows } } as any);
    });
  });

  (scene as any).action?.(/sess_pick_away_(.*)_(.*)/, async (ctx: any) => {
    const sid = (ctx.match as any)[1];
    const awayId = (ctx.match as any)[2];
    const homeId = (ctx.session as any).addHome as string;
    await prisma.match.create({ data: { sessionId: sid, homeTeamId: homeId, awayTeamId: awayId, dateTime: new Date(), location: 'Session', capacityPerTeam: 5 } as any });
    await ctx.answerCbQuery('Match qo‘shildi');
    await ctx.scene.enter('admin:sessionView', { sessionId: sid });
  });

  return scene;
}


