import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { createDemoSessionWithTeams, seedTwoTeamsAndSinglesPending } from '../services/demo';
import { computeSessionTable, getSessionTopPlayers } from '../services/session';
import { editOrReply, safeAnswerCb } from '../utils/telegram';
import { formatUzDayAndTimeRange, uzPaymentStatus, uzTypeLabel } from '../utils/format';
import { allocateIndividualToSession, ensureTeamInSession } from '../services/nabor';
import { cleanupEphemeralTeams, enforceMaxTeamsForAllSessions } from '../services/maintenance';

export function registerAdminHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  // Helpers
  const sendSessionView = async (ctx: any, id: string) => {
    try {
      const s = await (prisma as any).session.findUnique({ where: { id }, include: { teams: { include: { team: true } } } });
      if (!s) { await ctx.reply('Session topilmadi'); return; }
      const typeLabel = (s as any).type === 'SIX_V_SIX' ? '6v6' : '5v5';
      const header = `🗓️ ${s.startAt.toISOString().slice(0,16).replace('T',' ')}–${s.endAt.toISOString().slice(0,16).replace('T',' ')}  [${s.status}]`;
      const info = [`🏟️ ${((s as any).stadium || '-')}`, `📍 ${((s as any).place || '-')}`, `🧩 ${typeLabel}`, `👥 ${s.teams.length}/${(s as any).maxTeams || 4}`].join('\n');
      // Keep the body small to avoid 413
      const list = (s.teams || []).slice(0, 10).map((t: any) => `• ${t.team.name}`).join('\n');
      const tail = (s.teams || []).length > 10 ? `\n…` : (s.teams || []).length ? '' : 'Hali jamoalar yo‘q';
      const actions: any[] = [];
      if ((s as any).status === 'PLANNED') {
        actions.push([{ text: '▶️ Start', callback_data: `sess_start_${s.id}` }]);
      } else if ((s as any).status === 'STARTED') {
        actions.push([{ text: '⏹ Stop', callback_data: `sess_stop_${s.id}` }]);
        actions.push([{ text: '➕ Match qo‘shish', callback_data: `sess_add_match_${s.id}` }]);
        actions.push([{ text: '📜 Matches', callback_data: `sess_matches_${s.id}` }]);
        actions.push([{ text: '📊 Statistika kiritish', callback_data: `sess_stats_entry_${s.id}` }]);
      } else if ((s as any).status === 'FINISHED') {
        // No MoM button, only stats summary
      }
      actions.push([{ text: '📊 Statistika', callback_data: `sess_stats_${s.id}` }]);
      actions.push([{ text: '⬅️ Sessiyalar', callback_data: 'admin_sessions' }]);
      const text = `${header}\n${info}\n\n${list || ''}${tail}`;
      await ctx.reply(text, { reply_markup: { inline_keyboard: actions } } as any);
    } catch (e) {
      console.error('sendSessionView error', e);
      try { await ctx.reply('Xatolik: sessiya ko‘rinmadi'); } catch {}
    }
  };
  const sendApprovalSessionsList = async (ctx: any) => {
    const sessions = await (prisma as any).session.findMany({
      where: { registrations: { some: { status: 'PENDING' } } },
      include: { registrations: { where: { status: 'PENDING' }, select: { id: true } } },
      orderBy: { startAt: 'asc' },
      take: 15,
    });
    if (!sessions.length) {
      const kb = { inline_keyboard: [[{ text: '🧪 Seed demo pending', callback_data: 'admin_seed_pending' }], [{ text: '⬅️ Back', callback_data: 'open_admin_panel' }]] } as any;
      return ctx.reply('Pending yo‘q', { reply_markup: kb } as any);
    }
    const rows = sessions.map((s: any) => {
      const when = formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt));
      const typeLabel = uzTypeLabel(s.type);
      const cnt = s.registrations.length;
      return [{ text: `${when} · ${typeLabel} · ${cnt} kutilmoqda`, callback_data: `sess_appr_s_${s.id}` }];
    });
    rows.push([{ text: '⬅️ Back', callback_data: 'open_admin_panel' }]);
    await editOrReply(ctx, 'Sessiyalar (tasdiqlash uchun):', { reply_markup: { inline_keyboard: rows } } as any);
  };

  const sendSessionPendingList = async (ctx: any, sessionId: string) => {
    const s = await (prisma as any).session.findUnique({ where: { id: sessionId }, include: { registrations: { where: { status: 'PENDING' }, include: { user: true, team: { include: { members: { include: { user: true } } } }, payment: true } } } });
    if (!s) return ctx.reply('Session topilmadi');
    if (!s.registrations.length) {
      const backKb = { inline_keyboard: [[{ text: '⬅️ Sessiyalar', callback_data: 'admin_sessions' }]] } as any;
      return editOrReply(ctx, 'Ushbu sessiyada pending yo‘q', { reply_markup: backKb } as any);
    }
    const header = `🗓️ ${formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt))}  [${s.status}]\n🏟️ ${(s as any).stadium || '-'}\n📍 ${(s as any).place || '-'}`;
    await editOrReply(ctx, header, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Sessiyalar', callback_data: 'admin_sessions' }]] } } as any);
    for (const r of (s as any).registrations) {
      const who = r.type === 'TEAM' ? `Jamoa: ${r.team?.name} (${r.team?.members?.length || 0} kishi)` : `Foydalanuvchi: ${r.user?.firstName}`;
      const participants = r.type === 'TEAM' ? (r.team?.members?.length || 0) : 1;
      const amount = r.payment?.amount ?? (40000 * participants);
      const kb = { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: `sess_approve_${r.id}` }], [{ text: '❌ Rad etish', callback_data: `sess_reject_${r.id}` }]] } as any;
      await ctx.reply(`🧾 ${who}\n📄 Turi: ${r.type === 'TEAM' ? 'Jamoa' : 'Yakka'}\n💰 Summa: ${amount} so‘m\n💳 To‘lov: ${uzPaymentStatus(r.payment?.status)}`, { reply_markup: kb } as any);
      if (r.payment?.receiptFileId) { try { await ctx.replyWithPhoto(r.payment.receiptFileId); } catch {} }
    }
  };
  const sendAdminPanel = async (ctx: any) => {
    // Show admin actions in the bottom reply keyboard (not inline)
    const keyboard = {
      keyboard: [
        // @ts-ignore
        [{ text: ctx.i18n.t('admin.sessions') }, { text: ctx.i18n.t('admin.create_session') }],
        // @ts-ignore
        [{ text: ctx.i18n.t('admin.lists') }, { text: ctx.i18n.t('admin.approvals') }],

        // @ts-ignore
        [{ text: ctx.i18n.t('admin.demo_create') }, { text: ctx.i18n.t('admin.demo_pending') }],
        // @ts-ignore
        [{ text: ctx.i18n.t('menu.language') }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    } as any;
    // @ts-ignore
    await ctx.reply(ctx.i18n.t('admin.panel'), { reply_markup: keyboard } as any);
  };

  bot.command('admin', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    await sendAdminPanel(ctx);
  });

  // Map text buttons from reply keyboard to actions
  bot.hears([/🗓️ Sessiyalar/, /🗓️ Сессии/], async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    await ctx.scene.enter('admin:sessions', {});
  });
  bot.hears([/➕ Sessiya yaratish/, /➕ Создать сессию/], async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    await ctx.scene.enter('admin:sessions', { createOnly: true });
  });
  bot.hears([/🧾 Ro'yxatlar/, /🧾 Списки/], async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    const upcoming = await prisma.match.findMany({ orderBy: { dateTime: 'asc' }, take: 3 });
    for (const m of upcoming) {
      const regs = await prisma.registration.findMany({ where: { matchId: m.id }, include: { user: true, team: true, payment: true } });
      await ctx.reply(`Match ${m.location} ${m.dateTime.toISOString()}: ${regs.length} reg`);
    }
  });
  bot.hears([/✅ Tasdiqlash/, /✅ Подтверждения/], async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await (ctx.scene as any).leave(); } catch {}
    await sendApprovalSessionsList(ctx);
  });
  bot.hears([/🏆 G'olib va MoM/, /🏆 Победитель и лучший игрок/], async (ctx) => { 
    if (!(ctx.state as any).isAdmin) return; 
    try { await (ctx.scene as any).leave(); } catch {} 
    await ctx.scene.enter('admin:winners'); 
  });
  bot.hears([/🧪 Demo: sessiya \+ jamoalar/, /🧪 Демо: сессия \+ команды/], async (ctx) => { 
    if (!(ctx.state as any).isAdmin) return; 
    try { await (ctx.scene as any).leave(); } catch {} 
    const { sessionId } = await createDemoSessionWithTeams(prisma); 
    await ctx.reply(`✅ Demo session created: ${sessionId}`); 
  });
  bot.hears([/🧪 Demo: kutilayotgan arizalar/, /🧪 Демо: ожидающие заявки/], async (ctx) => { 
    if (!(ctx.state as any).isAdmin) return; 
    try { await (ctx.scene as any).leave(); } catch {} 
    const { sessionId } = await seedTwoTeamsAndSinglesPending(prisma, { teams: 1, singles: 21 }); 
    await ctx.reply(`✅ Demo pending regs created for session: ${sessionId}`); 
  });

  // Maintenance quick actions
  bot.command('cleanup', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const res1 = await cleanupEphemeralTeams(prisma as any);
    const res2 = await enforceMaxTeamsForAllSessions(prisma as any, 4);
    await ctx.reply(`🧹 Cleanup done: removed ${res1.deletedTeams} ephemeral teams, fixed ${res2.deletedSessionTeams} session-team links, deleted ${res2.deletedEphemeralTeams} stray NABOR teams.`);
  });

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

  // Seed demo pending registrations from inline button
  bot.action('admin_seed_pending', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await ctx.answerCbQuery(); } catch {}
    const { sessionId } = await seedTwoTeamsAndSinglesPending(prisma, { teams: 1, singles: 21 });
    await ctx.reply(`✅ Demo pending regs created for session: ${sessionId}`);
    await sendApprovalSessionsList(ctx);
  });

  // Select a session to see its pending registrations
  bot.action(/sess_appr_s_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await ctx.answerCbQuery(); } catch {}
    const sid = (ctx.match as any)[1];
    await sendSessionPendingList(ctx, sid);
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
    // Notify involved users
    try {
      const s = reg.session!;
      const when = formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt));
      const msg = `✅ Ro‘yxat tasdiqlandi\n🗓️ ${when}\n🏟️ ${(s as any).stadium || '-'}\n📍 ${(s as any).place || '-'}`;
      if (reg.type === 'TEAM' && reg.team) {
        for (const tm of reg.team.members) {
          const tgId = tm.user?.telegramId;
          if (tgId) { try { await (ctx.telegram as any).sendMessage(tgId, msg); } catch {} }
        }
      } else if (reg.user?.telegramId) {
        try { await (ctx.telegram as any).sendMessage(reg.user.telegramId, msg); } catch {}
      }
    } catch {}
  });

  bot.action(/sess_reject_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    
    // Store the registration ID for the comment collection
    (ctx.session as any).pendingRejectionId = id;
    
    await ctx.answerCbQuery();
    await ctx.reply('❌ Rad etish sababini yozing:');
  });

  // stats entry is only accessible within a started session (via session view)

  bot.action('admin_winners', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:winners');
  });

  bot.action('admin_sessions', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    try { await ctx.answerCbQuery(); } catch {}
    await ctx.scene.enter('admin:sessions', {});
  });

  bot.action('admin_create_session', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:sessions');
  });

  // Open session view from anywhere (for Back buttons)
  bot.action(/sess_open_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    console.log(`DEBUG: sess_open_${id} triggered`);
    try { 
      await ctx.answerCbQuery('Ochilmoqda…'); 
      console.log(`DEBUG: answered callback for sess_open_${id}`);
    } catch (e) { 
      console.log('DEBUG: answerCbQuery failed', e);
    }
    try { 
      await (ctx.scene as any).leave(); 
      console.log(`DEBUG: left scene for sess_open_${id}`);
    } catch {}
    try {
      console.log(`DEBUG: calling sendSessionView for ${id}`);
      await sendSessionView(ctx, id);
      console.log(`DEBUG: sendSessionView completed for ${id}`);
    } catch (e) {
      console.error('sess_open failed', id, e);
      try { await ctx.reply("Xatolik: sessiyani ochib bo'lmadi"); } catch {}
    }
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
      // Validate session can be started: must have exactly 4 teams with exactly 7 players each
      const s = await (prisma as any).session.findUnique({ 
        where: { id }, 
        include: { teams: { include: { team: { include: { members: true } } } } } 
      });
      if (!s) {
        try { await ctx.answerCbQuery('Session not found'); } catch {}
        return;
      }
      
      const teams = s.teams || [];
      if (teams.length !== 4) {
        try { await ctx.answerCbQuery(`Aniq 4 ta jamoa kerak. Hozir: ${teams.length}`); } catch {}
        return ctx.reply(`❌ Sessiyani boshlash uchun aniq 4 ta jamoa kerak. Hozir: ${teams.length} ta jamoa`);
      }
      
      // Check each team has exactly 7 players
      for (const team of teams) {
        const memberCount = team.team?.members?.length || 0;
        if (memberCount !== 7) {
          try { await ctx.answerCbQuery(`${team.team.name} jamoasida ${memberCount} o'yinchi`); } catch {}
          return ctx.reply(`❌ Har bir jamoada aniq 7 ta o'yinchi bo'lishi kerak.\n"${team.team.name}" jamoasida ${memberCount} ta o'yinchi bor.`);
        }
      }
      
      try { await ctx.answerCbQuery('Starting…'); } catch {}
      await (prisma as any).session.update({ where: { id }, data: { status: 'STARTED' as any } });
      setTimeout(async () => {
        try {
          const { autoFormSessionTeams } = await import('../services/sessionFormation');
          await autoFormSessionTeams(prisma as any, id);
        } catch (e) { console.error('bg autoFormSessionTeams error', e); }
      }, 0);
      // Optimistically update the message to show STARTED
      try {
        const s = await (prisma as any).session.findUnique({ where: { id }, include: { teams: { include: { team: true } } } });
        if (s) {
          const typeLabel = (s as any).type === 'SIX_V_SIX' ? '6v6' : '5v5';
          const header = `🗓️ ${s.startAt.toISOString().slice(0,16).replace('T',' ')}–${s.endAt.toISOString().slice(0,16).replace('T',' ')}  [${s.status}]`;
          const info = [`🏟️ ${((s as any).stadium || '-')}`, `📍 ${((s as any).place || '-')}`, `🧩 ${typeLabel}`, `👥 ${s.teams.length}/${(s as any).maxTeams || 4}`].join('\n');
          const table = s.teams.map((t: any) => `${t.team.name}: ${t.points} pts (GF ${t.goalsFor}/GA ${t.goalsAgainst})`).join('\n') || 'Hali jamoalar yo‘q';
          const actions: any[] = [];
          actions.push([{ text: '⏹ Stop', callback_data: `sess_stop_${s.id}` }]);
          actions.push([{ text: '➕ Match qo‘shish', callback_data: `sess_add_match_${s.id}` }]);
          actions.push([{ text: '📜 Matches', callback_data: `sess_matches_${s.id}` }]);
          actions.push([{ text: '📊 Statistika kiritish', callback_data: `sess_stats_entry_${s.id}` }]);
          actions.push([{ text: '📊 Statistika', callback_data: `sess_stats_${s.id}` }]);
          actions.push([{ text: '⬅️ Sessiyalar', callback_data: 'admin_sessions' }]);
          const text = `${header}\n${info}\n\n${table}`;
          try { await (ctx as any).editMessageText(text, { reply_markup: { inline_keyboard: actions } } as any); }
          catch { await ctx.reply(text, { reply_markup: { inline_keyboard: actions } } as any); }
        }
      } catch {}
    } catch (e) {
      try { await ctx.answerCbQuery(); } catch {}
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
    await ctx.reply(`Top Scorers:\n${sLines}\n\nTop Assists:\n${aLines}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏆 MVP tanlash', callback_data: `sess_mvp_${id}` }]
        ]
      }
    });
  });

  // MVP selection handlers
  bot.action(/sess_mvp_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const sessionId = (ctx.match as any)[1];
    const session = await (prisma as any).session.findUnique({ 
      where: { id: sessionId }, 
      include: { teams: { include: { team: { include: { members: { include: { user: true } } } } } } } 
    });
    if (!session) return;
    
    const teamButtons = session.teams.map((st: any) => [{
      text: st.team.name,
      callback_data: `mvp_team_${sessionId}_${st.team.id}`
    }]);
    
    await ctx.answerCbQuery();
    await ctx.reply('MVP uchun jamoani tanlang:', { 
      reply_markup: { inline_keyboard: teamButtons } 
    });
  });

  bot.action(/mvp_team_(.*)_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const sessionId = (ctx.match as any)[1];
    const teamId = (ctx.match as any)[2];
    
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { include: { user: true } } }
    });
    if (!team) return;
    
    const playerButtons = team.members.map((member: any) => [{
      text: `${member.user.firstName} ${member.user.lastName || ''}`.trim(),
      callback_data: `mvp_select_${sessionId}_${member.user.id}`
    }]);
    
    await ctx.answerCbQuery();
    await ctx.reply(`${team.name} - MVP ni tanlang:`, { 
      reply_markup: { inline_keyboard: playerButtons } 
    });
  });

  bot.action(/mvp_select_(.*)_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const sessionId = (ctx.match as any)[1];
    const userId = (ctx.match as any)[2];
    
    await (prisma as any).session.update({ 
      where: { id: sessionId }, 
      data: { manOfTheSessionUserId: userId } 
    });
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userName = user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Unknown';
    
    await ctx.answerCbQuery('MVP belgilandi!');
    await ctx.reply(`🏆 ${userName} MVP deb belgilandi!`);
  });

  bot.action(/sess_stats_entry_(.*)/, async (ctx) => {
    console.log('DEBUG: Global sess_stats_entry handler triggered');
    if (!(ctx.state as any).isAdmin) {
      console.log('DEBUG: Not admin, returning');
      return;
    }
    const id = (ctx.match as any)[1];
    console.log('DEBUG: Session ID:', id);
    
    const s = await (prisma as any).session.findUnique({ where: { id } });
    if (!s || (s as any).status !== 'STARTED') {
      console.log('DEBUG: Session not found or not started');
      return ctx.answerCbQuery('Session not started');
    }
    
    console.log('DEBUG: About to answer callback and enter scene');
    await ctx.answerCbQuery();
    console.log('DEBUG: Entering admin:sessionMatchStats scene with sessionId:', id);
    console.log('DEBUG: scene state being passed:', { sessionId: id });
    try {
      await ctx.scene.enter('admin:sessionMatchStats', { sessionId: id });
      console.log('DEBUG: Scene enter call completed');
    } catch (error) {
      console.error('DEBUG: Scene enter failed:', error);
      await ctx.reply('Scene enter failed: ' + String(error));
    }
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


