import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { computeSessionTable, getSessionTopPlayers } from '../services/session';
import { autoFormSessionTeams } from '../services/sessionFormation';

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
      const actions: any[] = [];
      actions.push([{ text: s.status !== 'STARTED' ? '▶️ Start' : '⏹ Stop', callback_data: s.status !== 'STARTED' ? `sess_start_${s.id}` : `sess_stop_${s.id}` }]);
      if (s.status === 'STARTED') {
        actions.push([{ text: '➕ Match qo‘shish', callback_data: `sess_add_match_${s.id}` }]);
        actions.push([{ text: '📊 Statistika kiritish', callback_data: `sess_stats_entry_${s.id}` }]);
      }
      actions.push([{ text: '📊 Statistika', callback_data: `sess_stats_${s.id}` }]);
      actions.push([{ text: '⬅️ Orqaga', callback_data: 'open_admin_panel' }]);
      await ctx.reply(`${header}\n\n${table}`, { reply_markup: { inline_keyboard: actions } } as any);
      return;
    }
  );

  (scene as any).action?.(/sess_start_(.*)/, async (ctx: any) => {
    const id = (ctx.match as any)[1];
    // Lock teams: approve list is transformed into SessionTeam
    await autoFormSessionTeams(prisma as any, id);
    await (prisma as any).session.update({ where: { id }, data: { status: 'STARTED' as any } });
    await ctx.answerCbQuery('Started');
    await ctx.scene.enter('admin:sessionView', { sessionId: id });
  });
  (scene as any).action?.(/sess_stop_(.*)/, async (ctx: any) => {
    const id = (ctx.match as any)[1];
    await (prisma as any).session.update({ where: { id }, data: { status: 'FINISHED' as any } });
    const table = await computeSessionTable(prisma, id);
    const lines = table.map((t: any, i: number) => `${i+1}. ${t.team.name} — ${t.points} pts (GF ${t.goalsFor}/GA ${t.goalsAgainst})`).join('\n') || '—';
    await ctx.answerCbQuery('Stopped');
    await ctx.reply(`🏁 Sessiya yakunlandi\n\n${lines}`, { reply_markup: { inline_keyboard: [[{ text: '📊 Statistics', callback_data: `sess_stats_${id}` }], [{ text: '🏅 MoM', callback_data: `sess_mom_${id}` }]] } } as any);
  });
  (scene as any).action?.(/sess_add_match_(.*)/, async (ctx: any) => {
    await ctx.scene.enter('admin:sessionMatchAdd', { sessionId: (ctx.match as any)[1] });
  });
  (scene as any).action?.(/sess_stats_(.*)/, async (ctx: any) => {
    const id = (ctx.match as any)[1];
    const { topScorers, topAssists } = await getSessionTopPlayers(prisma, id);
    const sLines = topScorers.map((p: any, i: number) => `${i+1}. ${p.name} — ⚽ ${p.goals}`).join('\n') || '—';
    const aLines = topAssists.map((p: any, i: number) => `${i+1}. ${p.name} — 🅰️ ${p.assists}`).join('\n') || '—';
    await ctx.reply(`Top Scorers:\n${sLines}\n\nTop Assists:\n${aLines}`);
  });

  // Stats entry available only via session view when started
  (scene as any).action?.(/sess_stats_entry_(.*)/, async (ctx: any) => {
    const id = (ctx.match as any)[1];
    const s = await (prisma as any).session.findUnique({ where: { id } });
    if (!s || (s as any).status !== 'STARTED') return ctx.answerCbQuery('Session not started');
    await ctx.scene.enter('admin:sessionMatchStats', { sessionId: id });
  });

  // Session MoM: choose team -> choose player
  (scene as any).action?.(/sess_mom_(.*)/, async (ctx: any) => {
    const id = (ctx.match as any)[1];
    const st = await (prisma as any).session.findUnique({ where: { id }, include: { teams: { include: { team: true } } } });
    if (!st) return;
    const rows = st.teams.map((t: any) => [{ text: t.team.name, callback_data: `sess_mom_team_${id}_${t.teamId}` }]);
    await ctx.reply('Jamoani tanlang', { reply_markup: { inline_keyboard: rows } } as any);
  });
  (scene as any).action?.(/sess_mom_team_(.*)_(.*)/, async (ctx: any) => {
    const sid = (ctx.match as any)[1];
    const teamId = (ctx.match as any)[2];
    const members = await prisma.teamMember.findMany({ where: { teamId }, include: { user: true } });
    const rows = members.map((tm: any) => [{ text: tm.user.firstName, callback_data: `sess_mom_pick_${sid}_${tm.userId}` }]);
    await ctx.reply('O‘yinchini tanlang', { reply_markup: { inline_keyboard: rows } } as any);
  });
  (scene as any).action?.(/sess_mom_pick_(.*)_(.*)/, async (ctx: any) => {
    const sid = (ctx.match as any)[1];
    const userId = (ctx.match as any)[2];
    await (prisma as any).session.update({ where: { id: sid }, data: { manOfTheSessionUserId: userId } });
    await ctx.answerCbQuery('MoM belgilandi');
  });

  return scene;
}


