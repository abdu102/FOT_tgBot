import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildMainKeyboard, buildAuthKeyboard } from '../keyboards/main';
import { listAvailableSessions } from '../services/session';
import bcrypt from 'bcryptjs';

export function registerMainHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.hears(['📝 Ro‘yxatdan o‘tish', '📝 Регистрация'], async (ctx) => {
    const u = await prisma.user.findUnique({ where: { id: (ctx.state as any).userId } });
    if (u?.isActive) {
      return ctx.reply('Siz allaqachon tizimdasiz / Вы уже авторизованы');
    }
    await ctx.scene.enter('onboarding:individual');
  });

  bot.action('go_individual', async (ctx) => {
    await ctx.scene.enter('onboarding:individual');
  });
  // Removed team registration from onboarding entry; team creation will be under captain tools after login

  bot.hears(['⚽ Haftalik o‘yinlar', '⚽ Еженедельные матчи'], async (ctx) => {
    const isAuth = Boolean((ctx.state as any).isAuthenticated);
    await ctx.reply('Ro‘yxatdan o‘tish turi?', { reply_markup: { inline_keyboard: [[{ text: '✍️ Shaxsiy', callback_data: 'sr_type_ind' }, { text: '👥 Jamoa', callback_data: 'sr_type_team' }]] } } as any);
  });

  // Session registration flow
  async function showWeeklySessions(ctx: any) {
    try { await ctx.answerCbQuery?.(); } catch {}
    const now = new Date();
    const start = new Date(now); // start from current time
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const sessions = await listAvailableSessions(prisma as any, start, end);
    if (!sessions.length) {
      await ctx.reply('Bu hafta uchun mos sessiya topilmadi.');
      return;
    }
    const rows = sessions.map((s: any) => {
      const d = new Date(s.startAt);
      const endAt = new Date(s.endAt);
      const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      const t2 = `${String(endAt.getHours()).padStart(2,'0')}:${String(endAt.getMinutes()).padStart(2,'0')}`;
      const type = s.type === 'SIX_V_SIX' ? '6v6' : '5v5';
      return [{ text: `${day} ${t}–${t2} (${type})`, callback_data: `sr_pick_${s.id}` }];
    });
    rows.push([{ text: '⬅️ Orqaga', callback_data: 'sr_back' }]);
    await ctx.reply('Bu haftadagi mavjud sessiyalar:', { reply_markup: { inline_keyboard: rows } } as any);
  }

  bot.action('sr_type_ind', async (ctx) => {
    (ctx.session as any).srType = 'INDIVIDUAL';
    (ctx.session as any).srDayAsk = false;
    await showWeeklySessions(ctx);
  });
  bot.action('sr_type_team', async (ctx) => {
    (ctx.session as any).srType = 'TEAM';
    (ctx.session as any).srDayAsk = false;
    await showWeeklySessions(ctx);
  });

  bot.action('sr_back', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    await ctx.reply('Ro‘yxatdan o‘tish turi?', { reply_markup: { inline_keyboard: [[{ text: '✍️ Shaxsiy', callback_data: 'sr_type_ind' }, { text: '👥 Jamoa', callback_data: 'sr_type_team' }]] } } as any);
  });

  bot.on('text', async (ctx, next) => {
    const sess = (ctx.session as any) || {};
    // Legacy typed-date flow only if explicitly enabled
    if (sess.srDayAsk && sess.srType && !sess.srDay) {
      const day = (ctx.message as any).text.trim();
      sess.srDay = day;
      const startDay = new Date(`${day}T00:00:00`);
      const endDay = new Date(`${day}T23:59:59`);
      const list = await (prisma as any).session.findMany({ where: { startAt: { gte: startDay }, endAt: { lte: endDay }, status: 'PLANNED' }, orderBy: { startAt: 'asc' } });
      if (!list.length) { await ctx.reply('Ushbu kunda sessiya yo‘q'); sess.srType = undefined; sess.srDay = undefined; return; }
      const rows = list.map((s: any) => [{ text: `${s.startAt.toISOString().slice(11,16)}–${s.endAt.toISOString().slice(11,16)} (${s.type})`, callback_data: `sr_pick_${s.id}` }]);
      await ctx.reply('Sessiyani tanlang', { reply_markup: { inline_keyboard: rows } } as any);
      return;
    }
    if (sess.awaitReceiptForRegId) {
      // ignore plain text while awaiting photo
      return ctx.reply('Iltimos, to‘lov cheki suratini yuboring');
    }
    return next();
  });

  bot.action(/sr_pick_(.*)/, async (ctx) => {
    const sessionId = (ctx.match as any)[1] as string;
    const sess = (ctx.session as any) || {};
    const s = await (prisma as any).session.findUnique({ where: { id: sessionId }, include: { teams: { include: { team: { include: { members: true } } } } } });
    if (!s) return;
    // Guard: block registration if session is already full (4 teams with >= 7 members each)
    const maxTeams: number = typeof (s as any).maxTeams === 'number' ? (s as any).maxTeams : 4;
    const sessionTeams: any[] = Array.isArray((s as any).teams) ? (s as any).teams : [];
    const fullTeams = sessionTeams.filter((st: any) => ((st.team?.members?.length || 0) >= 7)).length;
    if (sessionTeams.length >= maxTeams && fullTeams >= maxTeams) {
      try { await ctx.answerCbQuery?.('To‘liq'); } catch {}
      return ctx.reply('❌ Bu sessiya to‘la. Iltimos, boshqa sessiyani tanlang.');
    }
    const type = sess.srType === 'TEAM' ? 'TEAM' : 'INDIVIDUAL';
    let reg: any = null;
    if (type === 'INDIVIDUAL') {
      reg = await (prisma as any).sessionRegistration.create({ data: { sessionId, userId: (ctx.state as any).userId, type, status: 'PENDING' } });
    } else {
      const team = await prisma.team.findFirst({ where: { captainId: (ctx.state as any).userId } });
      if (!team) return ctx.reply('Avval jamoa yarating: /team');
      reg = await (prisma as any).sessionRegistration.create({ data: { sessionId, teamId: team.id, type, status: 'PENDING' } });
    }
    const count = type === 'TEAM' && reg?.teamId ? (await prisma.teamMember.count({ where: { teamId: reg.teamId } })) : 1;
    const amount = 40000 * count;
    const pay = await (prisma as any).payment.create({ data: { sessionRegistrationId: reg.id, amount, method: process.env.PAYMENT_METHOD || 'MANUAL', status: 'PENDING', userId: (ctx.state as any).userId, teamId: reg.teamId || null } });
    sess.awaitReceiptForRegId = reg.id;
    await ctx.reply(`To‘lov summasi: ${amount} UZS\n${require('../services/payments').paymentInstructions()}`);
    await ctx.reply('Iltimos, to‘lov chekini surat qilib yuboring');
  });

  // Photo upload for payment receipt
  bot.on('photo', async (ctx, next) => {
    const sess = (ctx.session as any) || {};
    const regId = sess.awaitReceiptForRegId as string | undefined;
    if (!regId) return next();
    const photos = (ctx.message as any).photo as Array<{ file_id: string }>;
    const fileId = photos?.[photos.length - 1]?.file_id;
    if (!fileId) return ctx.reply('Rasm topilmadi');
    await (prisma as any).payment.update({ where: { sessionRegistrationId: regId }, data: { receiptFileId: fileId } });
    sess.awaitReceiptForRegId = undefined; sess.srType = undefined; sess.srDay = undefined;
    await ctx.reply('So‘rov yuborildi. Iltimos, tasdiqlashni kuting.');
  });

  bot.action(/sess_signup_ind_(.*)/, async (ctx) => {
    const sessionId = (ctx.match as any)[1] as string;
    const userId = (ctx.state as any).userId as string;
    const reg = await (prisma as any).sessionRegistration.create({ data: { sessionId, userId, type: 'INDIVIDUAL', status: 'PENDING' } });
    await ctx.reply('🧾 To‘lov uchun ma’lumot yuborildi. Admin tasdiqlaydi.');
  });

  bot.action(/sess_signup_team_(.*)/, async (ctx) => {
    const sessionId = (ctx.match as any)[1] as string;
    const userId = (ctx.state as any).userId as string;
    const team = await prisma.team.findFirst({ where: { captainId: userId } });
    if (!team) return ctx.reply('Avval jamoa yarating: /team');
    await (prisma as any).sessionRegistration.create({ data: { sessionId, teamId: team.id, type: 'TEAM', status: 'PENDING' } });
    await ctx.reply('🧾 Jamoa bilan ro‘yxatga olindi. To‘lov va tasdiqlash kutilmoqda.');
  });

  bot.hears(['👤 Profil', '👤 Профиль'], async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const u = await prisma.user.findUnique({ where: { id: userId }, include: { stats: true } });
    const ps = u?.stats?.[0];
    await ctx.reply(`👤 ${u?.firstName || ''}\n📞 ${u?.phone || '-'}\n⭐️ ${ps?.rating ?? 0} | ⚽ ${ps?.goals ?? 0} | 🅰️ ${ps?.assists ?? 0} | 🏆 ${ps?.wins ?? 0}`);
    await ctx.reply('⚙️ Sozlamalar / Настройки', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Ma’lumotni o‘zgartirish / Изменить данные', callback_data: 'profile_edit' }],
          [{ text: '🔐 Parolni o‘zgartirish / Сменить пароль', callback_data: 'profile_password' }],
          [{ text: '🚪 Chiqish / Выйти', callback_data: 'profile_logout' }],
        ],
      },
    } as any);
  });

  // Logout: deactivate account (do not delete), keep phone and username intact
  bot.action('profile_logout', async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    (ctx.state as any).isAuthenticated = false;
    try { await ctx.telegram.deleteMessage(ctx.chat!.id, (ctx.callbackQuery as any).message.message_id); } catch {}
    await ctx.reply('✅ Tizimdan chiqdingiz / Вы вышли из системы', buildAuthKeyboard(ctx));
  });

  // Change password flow (simple inline asks)
  bot.action('profile_password', async (ctx) => {
    await ctx.reply('Yangi parol yuboring / Отправьте новый пароль');
    (ctx.session as any).awaitingPassword = true;
  });

  bot.on('text', async (ctx, next) => {
    if ((ctx.session as any).awaitingPassword) {
      const raw = (ctx.message as any).text.trim();
      if (raw.length < 4) {
        return ctx.reply('Parol juda qisqa / Пароль слишком короткий');
      }
      const userId = (ctx.state as any).userId as string;
      const hash = await bcrypt.hash(raw, 10);
      await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
      (ctx.session as any).awaitingPassword = false;
      return ctx.reply('✅ Parol yangilandi / Пароль обновлён');
    }
    return next();
  });

  // Login button → scene
  bot.hears(['🔐 Kirish', '🔐 Войти'], async (ctx) => {
    await ctx.scene.enter('auth:login');
  });
}


