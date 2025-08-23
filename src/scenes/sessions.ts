import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function sessionsScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:sessions',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) { await ctx.reply('Faqat admin'); return ctx.scene.leave(); }
      // Show a simple month/year picker and day grid
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const header = `${y}-${String(m+1).padStart(2,'0')}`;
      const daysInMonth = new Date(y, m+1, 0).getDate();
      const rows: any[] = [];
      let row: any[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        row.push({ text: String(d), callback_data: `sess_pick_day_${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` });
        if (row.length === 7) { rows.push(row); row = []; }
      }
      if (row.length) rows.push(row);
      rows.unshift([
        { text: '«', callback_data: `sess_prev_${y}_${m}` },
        { text: header, callback_data: 'noop' },
        { text: '»', callback_data: `sess_next_${y}_${m}` }
      ]);
      await ctx.reply('Kunni tanlang', { reply_markup: { inline_keyboard: rows } } as any);
      return ctx.scene.leave();
    },
  );

  // Inline actions
  (scene as any).action?.('noop', async (ctx: any) => { await ctx.answerCbQuery(); });

  (scene as any).action?.(/sess_prev_(.*)_(.*)/, async (ctx: any) => {
    const y = parseInt((ctx.match as any)[1], 10);
    const m = parseInt((ctx.match as any)[2], 10) - 1; // previous
    const date = new Date(y, m, 1);
    const yy = date.getFullYear();
    const mm = date.getMonth();
    const header = `${yy}-${String(mm+1).padStart(2,'0')}`;
    const daysInMonth = new Date(yy, mm+1, 0).getDate();
    const rows: any[] = [];
    let row: any[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      row.push({ text: String(d), callback_data: `sess_pick_day_${yy}-${String(mm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` });
      if (row.length === 7) { rows.push(row); row = []; }
    }
    if (row.length) rows.push(row);
    rows.unshift([
      { text: '«', callback_data: `sess_prev_${yy}_${mm}` },
      { text: header, callback_data: 'noop' },
      { text: '»', callback_data: `sess_next_${yy}_${mm}` }
    ]);
    await ctx.editMessageReplyMarkup({ inline_keyboard: rows } as any).catch(async () => {
      await ctx.reply('Kunni tanlang', { reply_markup: { inline_keyboard: rows } } as any);
    });
  });

  (scene as any).action?.(/sess_next_(.*)_(.*)/, async (ctx: any) => {
    const y = parseInt((ctx.match as any)[1], 10);
    const m = parseInt((ctx.match as any)[2], 10) + 1; // next
    const date = new Date(y, m, 1);
    const yy = date.getFullYear();
    const mm = date.getMonth();
    const header = `${yy}-${String(mm+1).padStart(2,'0')}`;
    const daysInMonth = new Date(yy, mm+1, 0).getDate();
    const rows: any[] = [];
    let row: any[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      row.push({ text: String(d), callback_data: `sess_pick_day_${yy}-${String(mm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` });
      if (row.length === 7) { rows.push(row); row = []; }
    }
    if (row.length) rows.push(row);
    rows.unshift([
      { text: '«', callback_data: `sess_prev_${yy}_${mm}` },
      { text: header, callback_data: 'noop' },
      { text: '»', callback_data: `sess_next_${yy}_${mm}` }
    ]);
    await ctx.editMessageReplyMarkup({ inline_keyboard: rows } as any).catch(async () => {
      await ctx.reply('Kunni tanlang', { reply_markup: { inline_keyboard: rows } } as any);
    });
  });

  (scene as any).action?.(/sess_create_(.*)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    const day = (ctx.match as any)[1] as string;
    (ctx.session as any).sessCreateDay = day;
    await ctx.reply('Boshlanish vaqti (HH:mm)');
  });

  (scene as any).on?.('text', async (ctx: any, next: any) => {
    const sess: any = ctx.session || {};
    if (sess.sessCreateDay && !sess.sessCreateStart) {
      sess.sessCreateStart = (ctx.message as any).text.trim();
      await ctx.reply('Tugash vaqti (HH:mm)');
      return;
    }
    if (sess.sessCreateDay && sess.sessCreateStart && !sess.sessCreateType) {
      const start = `${sess.sessCreateDay}T${sess.sessCreateStart}:00`;
      const end = `${sess.sessCreateDay}T${(ctx.message as any).text.trim()}:00`;
      sess.sessCreateEnd = end;
      await ctx.reply('Turi? (5v5 / 6v6)');
      return;
    }
    if (sess.sessCreateDay && sess.sessCreateStart && sess.sessCreateEnd && !sess.sessCreateDone) {
      const start = `${sess.sessCreateDay}T${sess.sessCreateStart}:00`;
      const end = sess.sessCreateEnd as string;
      const tRaw = String((ctx.message as any).text || '').toLowerCase();
      const type = tRaw.includes('6') ? 'SIX_V_SIX' : 'FIVE_V_FIVE';
      const s = await (prisma as any).session.create({ data: { startAt: new Date(start), endAt: new Date(end), type } });
      sess.sessCreateDone = true; sess.sessCreateDay = undefined; sess.sessCreateStart = undefined; sess.sessCreateEnd = undefined; sess.sessCreateType = undefined;
      await ctx.reply('✅ Sessiya yaratildi', { reply_markup: { inline_keyboard: [[{ text: 'Ochil', callback_data: `sess_open_${s.id}` }]] } } as any);
      return;
    }
    return next();
  });

  (scene as any).action?.(/sess_open_(.*)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:sessionView', { sessionId: (ctx.match as any)[1] });
  });

  (scene as any).action?.(/sess_pick_day_(.*)/, async (ctx: any) => {
    const day = (ctx.match as any)[1] as string; // YYYY-MM-DD
    const startDay = new Date(`${day}T00:00:00`);
    const endDay = new Date(`${day}T23:59:59`);
    const sessions = await (prisma as any).session.findMany({ where: { startAt: { gte: startDay }, endAt: { lte: endDay } }, orderBy: { startAt: 'asc' } });
    if (!sessions.length) {
      await ctx.reply('Ushbu kunda sessiya yo‘q. Yaratamizmi?', { reply_markup: { inline_keyboard: [[{ text: '➕ Yaratish', callback_data: `sess_create_${day}` }]] } } as any);
    } else {
      const rows = sessions.map((s: any) => [{ text: `${s.startAt.toISOString().slice(11,16)}–${s.endAt.toISOString().slice(11,16)} (${s.status})`, callback_data: `sess_open_${s.id}` }]);
      rows.push([{ text: '➕ Yangi sessiya', callback_data: `sess_create_${day}` }]);
      await ctx.reply('Sessiyalar:', { reply_markup: { inline_keyboard: rows } } as any);
    }
  });

  return scene;
}


