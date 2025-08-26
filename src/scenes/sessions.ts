import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { formatUzDayAndTimeRange, uzTypeLabel } from '../utils/format';
import { safeAnswerCb, editOrReply } from '../utils/telegram';

// Calendar helper function
async function showCalendar(ctx: any) {
  const now = new Date();
  const calendar: any[][] = [];
  
  // Show next 14 days as calendar buttons
  for (let i = 0; i < 14; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const label = i === 0 ? 'Bugun' : i === 1 ? 'Ertaga' : 
      `${date.getDate()}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    
    if (i % 2 === 0) {
      calendar.push([{ text: label, callback_data: `sess_create_${dateStr}` }]);
    } else {
      calendar[calendar.length - 1].push({ text: label, callback_data: `sess_create_${dateStr}` });
    }
  }
  
  await ctx.reply('Sessiya sanasini tanlang:', { 
    reply_markup: { inline_keyboard: calendar } 
  });
}

export function sessionsScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:sessions',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) { await ctx.reply('Faqat admin'); return; }
      
      console.log('DEBUG: Sessions scene entered');
      console.log('DEBUG: Scene state:', ctx.scene.state);
      console.log('DEBUG: createOnly flag:', (ctx.scene.state as any)?.createOnly);
      
      // If entering in create-only mode, start creation flow with calendar
      if ((ctx.scene.state as any)?.createOnly) {
        console.log('DEBUG: Sessions scene entered in createOnly mode, showing calendar');
        await showCalendar(ctx);
        return;
      }
      
      console.log('DEBUG: Sessions scene entered in list mode, showing sessions list');
      
      // Clear any lingering session creation state
      const sess: any = ctx.session || {};
      sess.sessCreateDay = undefined;
      sess.sessCreateStart = undefined;
      sess.sessCreateEnd = undefined;
      sess.stadium = undefined;
      sess.place = undefined;
      sess.awaitingStadium = false;
      sess.awaitingPlace = false;
      sess.sessCreateAskDay = false;
      
      // Show upcoming sessions (2 weeks) with pagination (10 per page)
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 14);
      console.log(`DEBUG: Admin sessions scene - Looking for sessions from ${now.toISOString()} to ${end.toISOString()}`);
      
      const pageSize = 10;
      const total = await (prisma as any).session.count({ where: { startAt: { gte: now, lte: end } } });
      console.log(`DEBUG: Admin sessions scene - Found ${total} total sessions in 2-week range`);
      
      // Also check for any sessions at all
      const allSessions = await (prisma as any).session.findMany({ orderBy: { startAt: 'asc' }, take: 10 });
      console.log(`DEBUG: Admin sessions scene - Database has ${allSessions.length} sessions total`);
      allSessions.forEach((s: any, i: number) => {
        console.log(`  ${i}: ${s.id} - ${s.startAt} - ${s.status}`);
      });
      
      const sessions = await (prisma as any).session.findMany({ where: { startAt: { gte: now, lte: end } }, orderBy: { startAt: 'asc' }, take: pageSize, skip: 0 });
      console.log(`DEBUG: Admin sessions scene - Retrieved ${sessions.length} sessions for page 0`);
      const makeRows = (items: any[]) => items.map((s: any) => [{ text: `${formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt))} (${uzTypeLabel(s.type)})`, callback_data: `sess_open_${s.id}` }]);
      const nav = total > pageSize ? [{ text: '»', callback_data: `sess_list_1` }] : [];
      const rows = makeRows(sessions);
      if (nav.length) rows.push(nav);
      await editOrReply(ctx, sessions.length ? 'Yaqin 2 haftalik sessiyalar:' : 'Yaqin 2 haftada sessiya yo‘q', { reply_markup: { inline_keyboard: rows } } as any);
      return;
    },
  );

  // Inline actions
  (scene as any).action?.('noop', async (ctx: any) => { await safeAnswerCb(ctx); });

  // Pagination for upcoming sessions (single message updated via editMessageText)
  (scene as any).action?.(/sess_list_(\d+)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    const page = parseInt((ctx.match as any)[1], 10) || 0;
    console.log(`DEBUG: sess_list_${page} triggered`);
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 14);
    const pageSize = 10;
    const skip = page * pageSize;
    const sessions = await (prisma as any).session.findMany({ where: { startAt: { gte: now, lte: end } }, orderBy: { startAt: 'asc' }, take: pageSize, skip });
    console.log(`DEBUG: Admin sessions scene pagination - Retrieved ${sessions.length} sessions for page ${page}`);
    
    const makeRows = (items: any[]) => items.map((s: any) => [{ text: `${formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt))} (${uzTypeLabel(s.type)})`, callback_data: `sess_open_${s.id}` }]);
    const rows = makeRows(sessions);
    const navRow: any[] = [];
    if (page > 0) navRow.push({ text: '«', callback_data: `sess_list_${page - 1}` });
    if (sessions.length === pageSize) navRow.push({ text: '»', callback_data: `sess_list_${page + 1}` });
    if (navRow.length) rows.push(navRow);
    await safeAnswerCb(ctx);
    console.log(`DEBUG: about to update keyboard for page ${page}`);
    try {
      // Only the keyboard changes; keep text identical to avoid duplication
      await (ctx as any).editMessageReplyMarkup({ inline_keyboard: rows } as any);
      console.log(`DEBUG: keyboard updated for page ${page}`);
    } catch (e) {
      console.log(`DEBUG: editMessageReplyMarkup failed, sending new message`, e);
      await ctx.reply('Yaqin 2 haftalik sessiyalar:', { reply_markup: { inline_keyboard: rows } } as any);
    }
  });

  (scene as any).action?.(/sess_create_(.*)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    const day = (ctx.match as any)[1] as string;
    (ctx.session as any).sessCreateDay = day;
    console.log(`DEBUG: Date selected: ${day}`);
    try { await ctx.answerCbQuery(); } catch {}
    await ctx.reply('Boshlanish vaqti (HH:mm):\n\nMasalan: 18:00');
  });

  (scene as any).on?.('text', async (ctx: any, next: any) => {
    const sess: any = ctx.session || {};
    
    // Handle start time input
    if (sess.sessCreateDay && !sess.sessCreateStart) {
      const timeText = (ctx.message as any).text.trim();
      console.log(`DEBUG: Start time entered: ${timeText}`);
      
      // Validate time format (HH:mm)
      if (!/^\d{1,2}:\d{2}$/.test(timeText)) {
        await ctx.reply('Noto\'g\'ri format! Masalan: 18:00');
        return;
      }
      
      sess.sessCreateStart = timeText;
      await ctx.reply('Tugash vaqti (HH:mm):\n\nMasalan: 20:00');
      return;
    }
    
    // Handle end time input
    if (sess.sessCreateDay && sess.sessCreateStart && !sess.sessCreateEnd) {
      const timeText = (ctx.message as any).text.trim();
      console.log(`DEBUG: End time entered: ${timeText}`);
      
      // Validate time format (HH:mm)
      if (!/^\d{1,2}:\d{2}$/.test(timeText)) {
        await ctx.reply('Noto\'g\'ri format! Masalan: 20:00');
        return;
      }
      
      sess.sessCreateEnd = timeText;
      sess.awaitingStadium = true;
      await ctx.reply('Stadion nomi?');
      return;
    }
    
    // Handle stadium name input
    if (sess.sessCreateDay && sess.sessCreateStart && sess.sessCreateEnd && sess.awaitingStadium) {
      sess.stadium = (ctx.message as any).text.trim();
      sess.awaitingStadium = false;
      sess.awaitingPlace = true;
      await ctx.reply('Stadion joyi / Place?');
      return;
    }
    
    // Handle place input
    if (sess.sessCreateDay && sess.sessCreateStart && sess.sessCreateEnd && sess.awaitingPlace) {
      sess.place = (ctx.message as any).text.trim();
      sess.awaitingPlace = false;
      const kb = { inline_keyboard: [[
        { text: '5v5', callback_data: 'sess_type_5' },
        { text: '6v6', callback_data: 'sess_type_6' }
      ]] };
      await ctx.reply('Turi? (5v5 / 6v6)', { reply_markup: kb } as any);
      return;
    }
    
    return next();
  });

  (scene as any).action?.(/sess_type_(5|6)/, async (ctx: any) => {
    const t = (ctx.match as any)[1];
    const sess: any = ctx.session || {};
    if (!sess.sessCreateDay || !sess.sessCreateStart || !sess.sessCreateEnd) return ctx.answerCbQuery();
    
    const type = t === '6' ? 'SIX_V_SIX' : 'FIVE_V_FIVE';
    
    // Ensure we have stadium/place collected
    if (!sess.stadium) { sess.awaitingStadium = true; await ctx.reply('Stadion nomi?'); return; }
    if (!sess.place) { sess.awaitingPlace = true; await ctx.reply('Stadion joyi / Place?'); return; }
    
    // Create exact timestamps with proper timezone handling
    const startDateTime = new Date(`${sess.sessCreateDay}T${sess.sessCreateStart}:00`);
    const endDateTime = new Date(`${sess.sessCreateDay}T${sess.sessCreateEnd}:00`);
    
    console.log(`DEBUG: Creating session with exact timestamps:`);
    console.log(`DEBUG: Start: ${startDateTime.toISOString()}`);
    console.log(`DEBUG: End: ${endDateTime.toISOString()}`);
    console.log(`DEBUG: Stadium: ${sess.stadium}`);
    console.log(`DEBUG: Place: ${sess.place}`);
    console.log(`DEBUG: Type: ${type}`);
    
    try {
      const s = await (prisma as any).session.create({ 
        data: { 
          startAt: startDateTime,
          endAt: endDateTime, 
          type, 
          stadium: sess.stadium, 
          place: sess.place,
          status: 'PLANNED',
          maxTeams: 4
        } 
      });
      
      console.log(`DEBUG: Session created successfully with ID: ${s.id}`);
      
      // Save data for confirmation message before clearing
      const confirmationData = {
        day: sess.sessCreateDay,
        start: sess.sessCreateStart,
        end: sess.sessCreateEnd,
        stadium: sess.stadium,
        place: sess.place
      };
      
      // Clear session data
      sess.sessCreateDone = true; 
      sess.sessCreateDay = undefined; 
      sess.sessCreateStart = undefined; 
      sess.sessCreateEnd = undefined; 
      sess.sessCreateType = undefined;
      sess.stadium = undefined;
      sess.place = undefined;
      sess.awaitingStadium = false;
      sess.awaitingPlace = false;
      
      await ctx.answerCbQuery('Sessiya yaratildi!');
      await ctx.reply(`✅ Sessiya muvaffaqiyatli yaratildi!\n\n🗓️ Sana: ${confirmationData.day}\n⏰ Vaqt: ${confirmationData.start} - ${confirmationData.end}\n🏟️ Stadion: ${confirmationData.stadium}\n📍 Joy: ${confirmationData.place}\n🧩 Turi: ${type === 'SIX_V_SIX' ? '6v6' : '5v5'}`, { 
        reply_markup: { 
          inline_keyboard: [
            [{ text: '👁 Sessiyani ko\'rish', callback_data: `sess_open_${s.id}` }], 
            [{ text: '⬅️ Admin panel', callback_data: 'open_admin_panel' }]
          ] 
        } 
      } as any);
      
    } catch (error) {
      console.error('DEBUG: Session creation failed:', error);
      await ctx.answerCbQuery('Xatolik yuz berdi');
      await ctx.reply('❌ Sessiya yaratishda xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    }
  });

  // Session opening handler within the scene
  (scene as any).action?.(/sess_open_(.*)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    console.log(`DEBUG: sessions scene sess_open_${id} triggered`);
    try { await ctx.answerCbQuery('Ochilmoqda…'); } catch {}
    try { await ctx.scene.leave(); } catch {}
    
    // Import the sendSessionView function
    const { registerAdminHandlers } = await import('../handlers/admin');
    
    // Get the session and display it
    try {
      const s = await (prisma as any).session.findUnique({ where: { id }, include: { teams: { include: { team: true } } } });
      if (!s) { await ctx.reply('Session topilmadi'); return; }
      const typeLabel = (s as any).type === 'SIX_V_SIX' ? '6v6' : '5v5';
      const header = `🗓️ ${s.startAt.toISOString().slice(0,16).replace('T',' ')}–${s.endAt.toISOString().slice(0,16).replace('T',' ')}  [${s.status}]`;
      const info = [`🏟️ ${((s as any).stadium || '-')}`, `📍 ${((s as any).place || '-')}`, `🧩 ${typeLabel}`, `👥 ${s.teams.length}/${(s as any).maxTeams || 4}`].join('\n');
      const list = (s.teams || []).slice(0, 10).map((t: any) => `• ${t.team.name}`).join('\n');
      const tail = (s.teams || []).length > 10 ? `\n…` : (s.teams || []).length ? '' : "Hali jamoalar yo'q";
      const actions: any[] = [];
      if ((s as any).status === 'PLANNED') {
        actions.push([{ text: '▶️ Start', callback_data: `sess_start_${s.id}` }]);
      } else if ((s as any).status === 'STARTED') {
        actions.push([{ text: '⏹ Stop', callback_data: `sess_stop_${s.id}` }]);
        actions.push([{ text: "➕ Match qo'shish", callback_data: `sess_add_match_${s.id}` }]);
        actions.push([{ text: '📜 Matches', callback_data: `sess_matches_${s.id}` }]);
        actions.push([{ text: '📊 Statistika kiritish', callback_data: `sess_stats_entry_${s.id}` }]);
      }
      actions.push([{ text: '📊 Statistika', callback_data: `sess_stats_${s.id}` }]);
      actions.push([{ text: '⬅️ Sessiyalar', callback_data: 'admin_sessions' }]);
      const text = `${header}\n${info}\n\n${list || ''}${tail}`;
      await ctx.reply(text, { reply_markup: { inline_keyboard: actions } } as any);
      console.log(`DEBUG: sessions scene sess_open_${id} completed`);
    } catch (e) {
      console.error('sessions scene sess_open failed', id, e);
      try { await ctx.reply("Xatolik: sessiyani ochib bo'lmadi"); } catch {}
    }
  });

  // Ensure stats entry works even when triggered from within this scene
  (scene as any).action?.(/sess_stats_entry_(.*)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    console.log(`DEBUG: sessions scene sess_stats_entry_${id} triggered`);
    try { await ctx.answerCbQuery('Statistika kiritish…'); } catch {}
    try { await ctx.scene.leave(); } catch {}
    console.log('DEBUG: Sessions scene - About to enter admin:sessionMatchStats with:', { sessionId: id });
    try {
      await ctx.scene.enter('admin:sessionMatchStats', { sessionId: id });
      console.log('DEBUG: Sessions scene - Scene enter completed');
    } catch (error) {
      console.error('DEBUG: Sessions scene - Scene enter failed:', error);
      await ctx.reply('Scene enter failed: ' + String(error));
    }
  });

  // Removed day picking calendar; admin sees only upcoming list and can create via keyboard or typed flow

  return scene;
}


