import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { formatUzDayAndTimeRange, uzTypeLabel } from '../utils/format';

export function sessionsScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:sessions',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) { await ctx.reply('Faqat admin'); return; }
      // If entering in create-only mode, start creation flow without calendar
      if ((ctx.scene.state as any)?.createOnly) {
        (ctx.session as any).sessCreateAskDay = true;
        await ctx.reply('Kunni kiriting (YYYY-MM-DD)');
        return;
      }
      // Show upcoming sessions (2 weeks) with pagination (5 per page)
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 14);
      const pageSize = 5;
      const sessions = await (prisma as any).session.findMany({ where: { startAt: { gte: now, lte: end } }, orderBy: { startAt: 'asc' }, take: pageSize, skip: 0 });
      const makeRows = (items: any[]) => items.map((s: any) => [{ text: `${formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt))} (${uzTypeLabel(s.type)})`, callback_data: `sess_open_${s.id}` }]);
      const nav = [{ text: '»', callback_data: `sess_list_1` }];
      const rows = makeRows(sessions);
      rows.push(nav);
      await ctx.reply('Yaqin 2 haftalik sessiyalar:', { reply_markup: { inline_keyboard: rows } } as any);
      return;
    },
  );

  // Inline actions
  (scene as any).action?.('noop', async (ctx: any) => { try { await ctx.answerCbQuery(); } catch {} });

  // Pagination for upcoming sessions (single message updated via editMessageText)
  (scene as any).action?.(/sess_list_(\d+)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    const page = parseInt((ctx.match as any)[1], 10) || 0;
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 14);
    const pageSize = 5;
    const skip = page * pageSize;
    const sessions = await (prisma as any).session.findMany({ where: { startAt: { gte: now, lte: end } }, orderBy: { startAt: 'asc' }, take: pageSize, skip });
    const makeRows = (items: any[]) => items.map((s: any) => [{ text: `${formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt))} (${uzTypeLabel(s.type)})`, callback_data: `sess_open_${s.id}` }]);
    const rows = makeRows(sessions);
    const navRow: any[] = [];
    if (page > 0) navRow.push({ text: '«', callback_data: `sess_list_${page - 1}` });
    if (sessions.length === pageSize) navRow.push({ text: '»', callback_data: `sess_list_${page + 1}` });
    if (navRow.length) rows.push(navRow);
    try { await ctx.answerCbQuery(); } catch {}
    try { await (ctx as any).editMessageText('Yaqin 2 haftalik sessiyalar:', { reply_markup: { inline_keyboard: rows } } as any); }
    catch { await ctx.reply('Yaqin 2 haftalik sessiyalar:', { reply_markup: { inline_keyboard: rows } } as any); }
  });

  (scene as any).action?.(/sess_create_(.*)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    const day = (ctx.match as any)[1] as string;
    (ctx.session as any).sessCreateDay = day;
    try { await ctx.answerCbQuery(); } catch {}
    await ctx.reply('Boshlanish vaqti (HH:mm)');
  });

  (scene as any).on?.('text', async (ctx: any, next: any) => {
    const sess: any = ctx.session || {};
    if ((sess as any).sessCreateAskDay && !sess.sessCreateDay) {
      const raw = (ctx.message as any).text.trim();
      (ctx.session as any).sessCreateDay = raw;
      (ctx.session as any).sessCreateAskDay = false;
      await ctx.reply('Boshlanish vaqti (HH:mm)');
      return;
    }
    if (sess.sessCreateDay && !sess.sessCreateStart) {
      sess.sessCreateStart = (ctx.message as any).text.trim();
      await ctx.reply('Tugash vaqti (HH:mm)');
      return;
    }
    if (sess.sessCreateDay && sess.sessCreateStart && !sess.sessCreateEnd) {
      const end = `${sess.sessCreateDay}T${(ctx.message as any).text.trim()}:00`;
      sess.sessCreateEnd = end;
      sess.awaitingStadium = true;
      await ctx.reply('Stadion nomi?');
      return;
    }
    if (sess.sessCreateDay && sess.sessCreateStart && sess.sessCreateEnd && sess.awaitingStadium) {
      sess.stadium = (ctx.message as any).text.trim();
      sess.awaitingStadium = false;
      sess.awaitingPlace = true;
      await ctx.reply('Stadion joyi / Place?');
      return;
    }
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
    const start = `${sess.sessCreateDay}T${sess.sessCreateStart}:00`;
    const type = t === '6' ? 'SIX_V_SIX' : 'FIVE_V_FIVE';
    // Ensure we have stadium/place collected
    if (!sess.stadium) { sess.awaitingStadium = true; await ctx.reply('Stadion nomi?'); return; }
    if (!sess.place) { sess.awaitingPlace = true; await ctx.reply('Stadion joyi / Place?'); return; }
    const s = await (prisma as any).session.create({ data: { startAt: new Date(start), endAt: new Date(sess.sessCreateEnd), type, stadium: sess.stadium, place: sess.place } });
    sess.sessCreateDone = true; sess.sessCreateDay = undefined; sess.sessCreateStart = undefined; sess.sessCreateEnd = undefined; sess.sessCreateType = undefined;
    await ctx.answerCbQuery('Yaratildi');
    await ctx.reply('✅ Sessiya yaratildi', { reply_markup: { inline_keyboard: [[{ text: 'Ochil', callback_data: `sess_open_${s.id}` }], [{ text: '⬅️ Menyu', callback_data: 'open_admin_panel' }]] } } as any);
  });

  // Note: session opening is handled globally in admin handlers

  // Removed day picking calendar; admin sees only upcoming list and can create via keyboard or typed flow

  return scene;
}


