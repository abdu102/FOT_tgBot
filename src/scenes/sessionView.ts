import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function sessionViewScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:sessionView',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) { await ctx.reply('Faqat admin'); return ctx.scene.leave(); }
      const sid = (ctx.scene.state as any)?.sessionId as string | undefined;
      if (!sid) { await ctx.reply('Session topilmadi'); return ctx.scene.leave(); }
      const s = await (prisma as any).session.findUnique({ where: { id: sid }, include: { matches: true, teams: { include: { team: true } } } });
      if (!s) { await ctx.reply('Session topilmadi'); return ctx.scene.leave(); }
      const header = `🗓️ ${s.startAt.toISOString().slice(0,16).replace('T',' ')}–${s.endAt.toISOString().slice(0,16).replace('T',' ')}  [${s.status}]`;
      const table = s.teams.map((t: any) => `${t.team.name}: ${t.points} pts (GF ${t.goalsFor}/GA ${t.goalsAgainst})`).join('\n') || 'Hali jamoalar yo‘q';
      const actions = [
        [{ text: s.status !== 'STARTED' ? '▶️ Start' : '⏹ Stop', callback_data: s.status !== 'STARTED' ? `sess_start_${s.id}` : `sess_stop_${s.id}` }],
        [{ text: '➕ Match qo‘shish', callback_data: `sess_add_match_${s.id}` }],
        [{ text: '📊 Statistika', callback_data: `sess_stats_${s.id}` }],
        [{ text: '⬅️ Orqaga', callback_data: 'open_admin_panel' }],
      ];
      await ctx.reply(`${header}\n\n${table}`, { reply_markup: { inline_keyboard: actions } } as any);
      return ctx.scene.leave();
    }
  );

  (scene as any).action?.(/sess_start_(.*)/, async (ctx: any) => {
    const id = (ctx.match as any)[1];
    await (prisma as any).session.update({ where: { id }, data: { status: 'STARTED' as any } });
    await ctx.answerCbQuery('Started');
    await ctx.scene.enter('admin:sessionView', { sessionId: id });
  });
  (scene as any).action?.(/sess_stop_(.*)/, async (ctx: any) => {
    const id = (ctx.match as any)[1];
    await (prisma as any).session.update({ where: { id }, data: { status: 'FINISHED' as any } });
    await ctx.answerCbQuery('Stopped');
    await ctx.scene.enter('admin:sessionView', { sessionId: id });
  });
  (scene as any).action?.(/sess_add_match_(.*)/, async (ctx: any) => {
    await ctx.scene.enter('admin:sessionMatchAdd', { sessionId: (ctx.match as any)[1] });
  });
  (scene as any).action?.(/sess_stats_(.*)/, async (ctx: any) => {
    await ctx.scene.enter('admin:sessionMatchStats', { sessionId: (ctx.match as any)[1] });
  });

  return scene;
}


