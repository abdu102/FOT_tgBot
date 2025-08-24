import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { createDemoSessionWithTeams, seedTwoTeamsAndSinglesPending } from '../services/demo';
import { computeSessionTable, getSessionTopPlayers } from '../services/session';
import { allocateIndividualToSession, ensureTeamInSession } from '../services/nabor';

export function registerAdminHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  const sendAdminPanel = async (ctx: any) => {
    // Show admin actions in the bottom reply keyboard (not inline)
    const keyboard = {
      keyboard: [
        [{ text: '🗓️ Sessiyalar' }, { text: '➕ Create session' }],
        [{ text: '🧾 Ro‘yxatlar' }, { text: '✅ Tasdiqlash' }],
        [{ text: '🏆 Winner & MoM' }],
        [{ text: '🧪 Demo: create session + teams' }, { text: '🧪 Demo: pending regs' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    } as any;
    await ctx.reply('Admin panel', { reply_markup: keyboard } as any);
  };

  bot.command('admin', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    await sendAdminPanel(ctx);
  });

  // Map text buttons from reply keyboard to actions
  bot.hears('🗓️ Sessiyalar', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    await ctx.scene.enter('admin:sessions');
  });
  bot.hears('➕ Create session', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    await ctx.scene.enter('admin:sessions');
  });
  bot.hears('🧾 Ro‘yxatlar', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    const upcoming = await prisma.match.findMany({ orderBy: { dateTime: 'asc' }, take: 3 });
    for (const m of upcoming) {
      const regs = await prisma.registration.findMany({ where: { matchId: m.id }, include: { user: true, team: true, payment: true } });
      await ctx.reply(`Match ${m.location} ${m.dateTime.toISOString()}: ${regs.length} reg`);
    }
  });
  bot.hears('✅ Tasdiqlash', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    const regs = await (prisma as any).sessionRegistration.findMany({ where: { status: 'PENDING' }, include: { session: true, user: true, team: { include: { members: { include: { user: true } } } }, payment: true }, take: 10 });
    if (!regs.length) return ctx.reply('Pending yo‘q');
    for (const r of regs) {
      const who = r.type === 'TEAM' ? `TEAM ${r.team?.name} (${r.team?.members?.length || 0})` : `USER ${r.user?.firstName}`;
      const when = `${r.session?.startAt.toISOString().slice(0,16).replace('T',' ')}–${r.session?.endAt.toISOString().slice(0,16).replace('T',' ')}`;
      const kb = { inline_keyboard: [[{ text: '✅ Approve', callback_data: `sess_approve_${r.id}` }], [{ text: '❌ Reject', callback_data: `sess_reject_${r.id}` }]] } as any;
      await ctx.reply(`🧾 ${who}\n🗓️ ${when}\n💰 ${r.payment?.amount ?? 0} (${r.payment?.status})` , { reply_markup: kb } as any);
      if (r.payment?.receiptFileId) { try { await ctx.replyWithPhoto(r.payment.receiptFileId); } catch {} }
    }
  });
  bot.hears('🏆 Winner & MoM', async (ctx) => { if ((ctx.state as any).isAdmin) { try { await (ctx.scene as any).leave(); } catch {} await ctx.scene.enter('admin:winners'); } });
  bot.hears('🧪 Demo: create session + teams', async (ctx) => { if (!(ctx.state as any).isAdmin) return; try { await (ctx.scene as any).leave(); } catch {} const { sessionId } = await createDemoSessionWithTeams(prisma); await ctx.reply(`✅ Demo session created: ${sessionId}`); });
  bot.hears('🧪 Demo: pending regs', async (ctx) => { if (!(ctx.state as any).isAdmin) return; try { await (ctx.scene as any).leave(); } catch {} const { sessionId } = await seedTwoTeamsAndSinglesPending(prisma, { teams: 1, singles: 21 }); await ctx.reply(`✅ Demo pending regs created for session: ${sessionId}`); });
  bot.hears('🧪 Demo: pending regs', async (ctx) => { if (!(ctx.state as any).isAdmin) return; const { sessionId } = await seedTwoTeamsAndSinglesPending(prisma, { teams: 1, singles: 21 }); await ctx.reply(`✅ Demo pending regs created for session: ${sessionId}`); });

  bot.action('open_admin_panel', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await ctx.answerCbQuery(); } catch {}
    try { await ctx.deleteMessage(); } catch {}
    await sendAdminPanel(ctx);
  });

  // Removed direct match creation; create matches inside a chosen session

  bot.action('admin_registrations', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const upcoming = await prisma.match.findMany({ orderBy: { dateTime: 'asc' }, take: 3 });
    for (const m of upcoming) {
      const regs = await prisma.registration.findMany({ where: { matchId: m.id }, include: { user: true, team: true, payment: true } });
      await ctx.reply(`Match ${m.location} ${m.dateTime.toISOString()}: ${regs.length} reg`);
    }
  });

  // Session registrations approval
  bot.action('admin_sess_approve', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const regs = await (prisma as any).sessionRegistration.findMany({ where: { status: 'PENDING' }, include: { user: true, team: true, session: true, payment: true }, take: 10 });
    if (!regs.length) return ctx.reply('Sessiya pending yo‘q');
    for (const r of regs) {
      const title = r.type === 'TEAM' ? `TEAM ${r.team?.name}` : `USER ${r.user?.firstName}`;
      await ctx.reply(
        `📝 ${title}\nSession: ${r.session?.startAt.toISOString()}\nTo‘lov: ${r.payment?.amount ?? 0} (${r.payment?.status})`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Approve', callback_data: `sess_approve_${r.id}` }],
              [{ text: '❌ Reject', callback_data: `sess_reject_${r.id}` }],
            ],
          },
        } as any
      );
    }
  });

  bot.action(/sess_approve_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    const reg = await (prisma as any).sessionRegistration.findUnique({ where: { id }, include: { session: true, user: true, team: { include: { members: true } }, payment: true } });
    if (!reg) return;
    // Check capacity: max 4 teams
    const teamSlots = await (prisma as any).sessionTeam.count({ where: { sessionId: reg.sessionId } });
    if (reg.type === 'TEAM') {
      const members = reg.team?.members?.length || 0;
      if (members !== 7) return ctx.reply('❌ Jamoada aniq 7 o‘yinchi bo‘lishi kerak');
      if (teamSlots >= 4) return ctx.reply('❌ Sessiya to‘ldi');
      await ensureTeamInSession(prisma as any, reg.sessionId, reg.teamId as string);
    } else {
      const ok = await allocateIndividualToSession(prisma as any, reg.sessionId, reg.userId as string);
      if (!ok) return ctx.reply('❌ Sessiya to‘ldi (NABOR jamoalari to‘ldi)');
    }
    await (prisma as any).sessionRegistration.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
    if (reg.payment?.id) { await (prisma as any).payment.update({ where: { id: reg.payment.id }, data: { status: 'CONFIRMED' } }); }
    await ctx.reply('✅ Sessiya ro‘yxatdan o‘tish tasdiqlandi');
  });

  bot.action(/sess_reject_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    await (prisma as any).sessionRegistration.update({ where: { id }, data: { status: 'REJECTED' } });
    await ctx.reply('❌ Sessiya ro‘yxatdan o‘tish rad etildi');
  });

  // stats entry is only accessible within a started session (via session view)

  bot.action('admin_winners', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:winners');
  });

  bot.action('admin_sessions', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await ctx.answerCbQuery(); } catch {}
    try { await ctx.deleteMessage(); } catch {}
    await ctx.scene.enter('admin:sessions');
  });

  bot.action('admin_create_session', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:sessions');
  });

  // Open session view from anywhere (for Back buttons)
  bot.action(/sess_open_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await ctx.answerCbQuery(); } catch {}
    try { await ctx.deleteMessage(); } catch {}
    await ctx.scene.enter('admin:sessionView', { sessionId: (ctx.match as any)[1] });
  });

  bot.action('admin_demo_seed', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const { sessionId } = await createDemoSessionWithTeams(prisma);
    await ctx.reply(`✅ Demo session created: ${sessionId}`);
  });

  // Global fallbacks for session view actions (in case scene is not active)
  bot.action(/sess_start_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    try {
      await (prisma as any).session.update({ where: { id }, data: { status: 'STARTED' as any } });
      try { await ctx.answerCbQuery('Started'); } catch {}
      try { await ctx.scene.enter('admin:sessionView', { sessionId: id }); } catch {}
      await ctx.reply('Session started');
    } catch (e) {
      try { await ctx.answerCbQuery('Error'); } catch {}
      await ctx.reply('Error while starting session');
    }
  });

  bot.action(/sess_stop_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    await (prisma as any).session.update({ where: { id }, data: { status: 'FINISHED' as any } });
    const table = await computeSessionTable(prisma, id);
    const lines = table.map((t: any, i: number) => `${i+1}. ${t.team.name} — ${t.points} pts (GF ${t.goalsFor}/GA ${t.goalsAgainst})`).join('\n') || '—';
    await ctx.answerCbQuery('Stopped');
    await ctx.reply(`🏁 Sessiya yakunlandi\n\n${lines}`, { reply_markup: { inline_keyboard: [[{ text: '📊 Statistics', callback_data: `sess_stats_${id}` }], [{ text: '🏅 MoM', callback_data: `sess_mom_${id}` }]] } } as any);
  });

  bot.action(/sess_add_match_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:sessionMatchAdd', { sessionId: (ctx.match as any)[1] });
  });

  bot.action(/sess_stats_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    const { topScorers, topAssists } = await getSessionTopPlayers(prisma, id);
    const sLines = topScorers.map((p: any, i: number) => `${i+1}. ${p.name} — ⚽ ${p.goals}`).join('\n') || '—';
    const aLines = topAssists.map((p: any, i: number) => `${i+1}. ${p.name} — 🅰️ ${p.assists}`).join('\n') || '—';
    await ctx.answerCbQuery();
    await ctx.reply(`Top Scorers:\n${sLines}\n\nTop Assists:\n${aLines}`);
  });

  bot.action(/sess_stats_entry_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    const s = await (prisma as any).session.findUnique({ where: { id } });
    if (!s || (s as any).status !== 'STARTED') return ctx.answerCbQuery('Session not started');
    await ctx.answerCbQuery();
    await ctx.scene.enter('admin:sessionMatchStats', { sessionId: id });
  });

  bot.action(/sess_mom_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    const st = await (prisma as any).session.findUnique({ where: { id }, include: { teams: { include: { team: true } } } });
    if (!st) return;
    const rows = st.teams.map((t: any) => [{ text: t.team.name, callback_data: `sess_mom_team_${id}_${t.teamId}` }]);
    await ctx.answerCbQuery();
    await ctx.reply('Jamoani tanlang', { reply_markup: { inline_keyboard: rows } } as any);
  });
  bot.action(/sess_mom_team_(.*)_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const sid = (ctx.match as any)[1];
    const teamId = (ctx.match as any)[2];
    const members = await (prisma as any).teamMember.findMany({ where: { teamId }, include: { user: true } });
    const rows = members.map((tm: any) => [{ text: tm.user.firstName, callback_data: `sess_mom_pick_${sid}_${tm.userId}` }]);
    await ctx.answerCbQuery();
    await ctx.reply('O‘yinchini tanlang', { reply_markup: { inline_keyboard: rows } } as any);
  });
  bot.action(/sess_mom_pick_(.*)_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const sid = (ctx.match as any)[1];
    const userId = (ctx.match as any)[2];
    await (prisma as any).session.update({ where: { id: sid }, data: { manOfTheSessionUserId: userId } });
    await ctx.answerCbQuery('MoM belgilandi');
  });
}


