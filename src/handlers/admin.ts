import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { autoFormTeams } from '../services/autoFormation';

export function registerAdminHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  const sendAdminPanel = async (ctx: any) => {
    await ctx.reply('Admin panel', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Match yaratish', callback_data: 'admin_create_match' }],
          [{ text: '🧾 Ro‘yxatlar', callback_data: 'admin_registrations' }],
          [{ text: '✅ Tasdiqlash', callback_data: 'admin_approve' }],
          [{ text: '🤖 Auto-formation', callback_data: 'admin_autoform' }],
          [{ text: '📊 Statistika kiritish', callback_data: 'admin_stats' }],
          [{ text: '🏆 Winner & MoM', callback_data: 'admin_winners' }],
        ],
      },
    } as any);
  };

  bot.command('admin', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await sendAdminPanel(ctx);
  });

  bot.action('open_admin_panel', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await sendAdminPanel(ctx);
  });

  bot.action('admin_create_match', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('match:create');
  });

  bot.action('admin_registrations', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const upcoming = await prisma.match.findMany({ orderBy: { dateTime: 'asc' }, take: 3 });
    for (const m of upcoming) {
      const regs = await prisma.registration.findMany({ where: { matchId: m.id }, include: { user: true, team: true, payment: true } });
      await ctx.reply(`Match ${m.location} ${m.dateTime.toISOString()}: ${regs.length} reg`);
    }
  });

  bot.action('admin_approve', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const regs = await prisma.registration.findMany({ where: { status: 'PENDING' }, include: { user: true, team: true, match: true, payment: true }, take: 10 });
    if (!regs.length) return ctx.reply('Pending yo‘q / Нет ожидающих');
    for (const r of regs) {
      const title = r.type === 'TEAM' ? `TEAM ${r.team?.name}` : `USER ${r.user?.firstName}`;
      await ctx.reply(
        `📝 ${title}\nMatch: ${r.match?.location} ${r.match?.dateTime.toISOString()}\nTo‘lov: ${r.payment?.amount ?? 0} (${r.payment?.status})`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Approve', callback_data: `approve_${r.id}` }],
              [{ text: '❌ Reject', callback_data: `reject_${r.id}` }],
            ],
          },
        } as any
      );
    }
  });

  bot.action(/approve_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    await prisma.registration.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
    await ctx.reply('✅ Approved');
  });

  bot.action(/reject_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    await prisma.registration.update({ where: { id }, data: { status: 'REJECTED' } });
    await ctx.reply('❌ Rejected');
  });

  bot.action('admin_autoform', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const next = await prisma.match.findFirst({ orderBy: { dateTime: 'asc' } });
    if (!next) return ctx.reply('Match yo‘q / Нет матча');
    await autoFormTeams(prisma, next.id);
    await ctx.reply('🤖 Done');
  });

  bot.action('admin_stats', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:stats');
  });

  bot.action('admin_winners', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:winners');
  });
}


