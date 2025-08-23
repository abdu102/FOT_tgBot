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
      const teamIds = st.teams.map((t: any) => t.teamId as string);
      (ctx.session as any).matchAdd = { sid, teamIds };
      const rows = st.teams.map((t: any, i: number) => [{ text: t.team.name, callback_data: `mc_h_${i}` }]);
      await ctx.reply('Uy jamoa:', { reply_markup: { inline_keyboard: rows } } as any);
      return ctx.wizard.next();
    },
    async (ctx) => { return; }
  );

  (scene as any).action?.(/mc_h_(\d+)/, async (ctx: any) => {
    const idx = parseInt((ctx.match as any)[1], 10);
    const st = (ctx.session as any).matchAdd as { sid: string; teamIds: string[] } | undefined;
    if (!st || isNaN(idx)) return;
    (ctx.session as any).matchAdd.homeIdx = idx;
    const teams = await (prisma as any).session.findUnique({ where: { id: st.sid }, include: { teams: { include: { team: true } } } });
    const rows = (teams?.teams || []).map((t: any, i: number) => i !== idx ? [{ text: t.team.name, callback_data: `mc_a_${i}` }] : null).filter(Boolean) as any[];
    await ctx.reply('Mehmon jamoa:', { reply_markup: { inline_keyboard: rows } } as any);
  });

  (scene as any).action?.(/mc_a_(\d+)/, async (ctx: any) => {
    const awayIdx = parseInt((ctx.match as any)[1], 10);
    const st = (ctx.session as any).matchAdd as { sid: string; teamIds: string[]; homeIdx: number } | undefined;
    if (!st || isNaN(awayIdx) || typeof st.homeIdx !== 'number') return;
    const homeId = st.teamIds[st.homeIdx];
    const awayId = st.teamIds[awayIdx];
    await prisma.match.create({ data: { sessionId: st.sid, homeTeamId: homeId, awayTeamId: awayId, dateTime: new Date(), location: 'Session' } as any });
    try { await ctx.answerCbQuery('Match qo‘shildi'); } catch {}
    await ctx.scene.enter('admin:sessionView', { sessionId: st.sid });
  });

  return scene;
}


