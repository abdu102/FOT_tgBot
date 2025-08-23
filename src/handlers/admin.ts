import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { autoFormTeams } from '../services/autoFormation';
import { createDemoSessionWithTeams } from '../services/demo';

export function registerAdminHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  const sendAdminPanel = async (ctx: any) => {
    // Remove reply keyboard (login/registration buttons)
    try { await ctx.reply(' ', { reply_markup: { remove_keyboard: true } } as any); } catch {}
    await ctx.reply('Admin panel', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🗓️ Sessiyalar', callback_data: 'admin_sessions' }],
          [{ text: '➕ Create session', callback_data: 'admin_create_session' }],
          [{ text: '🧾 Ro‘yxatlar', callback_data: 'admin_registrations' }],
          [{ text: '✅ Tasdiqlash', callback_data: 'admin_approve' }],
          [{ text: '🤖 Auto-formation', callback_data: 'admin_autoform' }],
          [{ text: '🏆 Winner & MoM', callback_data: 'admin_winners' }],
          [{ text: '🧪 Demo: create session + teams', callback_data: 'admin_demo_seed' }],
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

  // Removed direct match creation; create matches inside a chosen session

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
    await (prisma as any).sessionRegistration.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
    await ctx.reply('✅ Sessiya ro‘yxatdan o‘tish tasdiqlandi');
  });

  bot.action(/sess_reject_(.*)/, async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const id = (ctx.match as any)[1];
    await (prisma as any).sessionRegistration.update({ where: { id }, data: { status: 'REJECTED' } });
    await ctx.reply('❌ Sessiya ro‘yxatdan o‘tish rad etildi');
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

  // stats entry is only accessible within a started session (via session view)

  bot.action('admin_winners', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:winners');
  });

  bot.action('admin_sessions', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:sessions');
  });

  bot.action('admin_create_session', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    await ctx.scene.enter('admin:sessions');
  });

  bot.action('admin_demo_seed', async (ctx) => {
    if (!(ctx.state as any).isAdmin) return;
    const { sessionId } = await createDemoSessionWithTeams(prisma);
    await ctx.reply(`✅ Demo session created: ${sessionId}`);
  });
}


