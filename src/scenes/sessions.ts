import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';

export function sessionsScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:sessions',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) { await ctx.reply('Faqat admin'); return ctx.scene.leave(); }
      await ctx.reply('Sessiya kuni (YYYY-MM-DD)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const day = (ctx.message as any)?.text?.trim();
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
      (ctx.wizard.state as any).day = day;
      return ctx.scene.leave();
    },
  );

  // Inline actions
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
    if (sess.sessCreateDay && sess.sessCreateStart && !sess.sessCreateDone) {
      const start = `${sess.sessCreateDay}T${sess.sessCreateStart}:00`;
      const end = `${sess.sessCreateDay}T${(ctx.message as any).text.trim()}:00`;
      const s = await (prisma as any).session.create({ data: { startAt: new Date(start), endAt: new Date(end) } });
      sess.sessCreateDone = true; sess.sessCreateDay = undefined; sess.sessCreateStart = undefined;
      await ctx.reply('✅ Sessiya yaratildi', { reply_markup: { inline_keyboard: [[{ text: 'Ochil', callback_data: `sess_open_${s.id}` }]] } } as any);
      return;
    }
    return next();
  });

  (scene as any).action?.(/sess_open_(.*)/, async (ctx: any) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:sessionView', { sessionId: (ctx.match as any)[1] });
  });

  return scene;
}


