import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { addMatchStat } from '../services/stats';

export function matchStatsScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:sessionMatchStats',
    async (ctx) => {
      if (!(ctx.state as any).isAdmin) { await ctx.reply('Faqat admin'); return ctx.scene.leave(); }
      const sid = (ctx.scene.state as any)?.sessionId as string | undefined;
      if (!sid) { await ctx.reply('Session topilmadi'); return ctx.scene.leave(); }
      const matches = await prisma.match.findMany({ where: { sessionId: sid } as any });
      if (!matches.length) { await ctx.reply('Hali match yo‘q'); return ctx.scene.leave(); }
      const rows = matches.map((m) => [{ text: `Match ${m.id}`, callback_data: `mstat_${m.id}` }]);
      await ctx.reply('Match tanlang', { reply_markup: { inline_keyboard: rows } } as any);
      return ctx.wizard.next();
    },
    async (ctx) => { return; }
  );

  (scene as any).action?.(/mstat_(.*)/, async (ctx: any) => {
    const mid = (ctx.match as any)[1];
    (ctx.session as any).statMatch = mid;
    await ctx.reply('User ID, goals, assists, won (yes/no) — format: userId,2,1,yes');
  });

  (scene as any).on?.('text', async (ctx: any, next: any) => {
    const sm = (ctx.session as any).statMatch as string | undefined;
    if (!sm) return next();
    const raw = (ctx.message as any).text.trim();
    const [userId, g, a, w] = raw.split(',').map((s: string) => s.trim());
    await addMatchStat(prisma, { matchId: sm, userId, goals: parseInt(g || '0'), assists: parseInt(a || '0'), won: (w || '').toLowerCase().startsWith('y') });
    await ctx.reply('✅ Saqlandi');
  });

  return scene;
}


