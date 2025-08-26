import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildMainKeyboard, buildAuthKeyboard, buildWelcomeKeyboard } from '../keyboards/main';
import { listAvailableSessions, listSessionsForTeamSignup } from '../services/session';
import { formatUzDayAndTimeRange, uzTypeLabel } from '../utils/format';
import bcrypt from 'bcryptjs';

export function registerMainHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  // Helper function to check authentication
  const requireAuth = (ctx: any) => {
    const isAuth = Boolean((ctx.state as any).isAuthenticated);
    if (!isAuth) {
      // @ts-ignore
      ctx.reply(ctx.i18n.t('auth.sign_in_first'), buildWelcomeKeyboard(ctx));
      return false;
    }
    return true;
  };

  // Handle "Create Account" button
  bot.hears([/👤 Hisob yaratish/, /👤 Создать аккаунт/], async (ctx) => {
    await ctx.reply('Ro\'yxatdan o\'tish yoki kirish?', { 
      reply_markup: { 
        inline_keyboard: [
          [
            // @ts-ignore
            { text: ctx.i18n.t('auth.register'), callback_data: 'auth_register' },
            // @ts-ignore  
            { text: ctx.i18n.t('auth.login'), callback_data: 'auth_login' }
          ]
        ] 
      } 
    } as any);
  });

  bot.action('auth_register', async (ctx) => {
    await ctx.answerCbQuery();
    const u = await prisma.user.findUnique({ where: { id: (ctx.state as any).userId } });
    if (u?.isActive) {
      // @ts-ignore
      return ctx.reply(ctx.i18n.t('auth.already_registered'));
    }
    await ctx.scene.enter('onboarding:individual');
  });

  bot.action('auth_login', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('auth:login');
  });

  // Keep old handlers for backward compatibility
  bot.hears([/📝 Ro'yxatdan o'tish/, /📝 Регистрация/], async (ctx) => {
    const u = await prisma.user.findUnique({ where: { id: (ctx.state as any).userId } });
    if (u?.isActive) {
      // @ts-ignore
      return ctx.reply(ctx.i18n.t('auth.already_registered'));
    }
    await ctx.scene.enter('onboarding:individual');
  });

  bot.hears([/🔐 Kirish/, /🔐 Войти/], async (ctx) => {
    await ctx.scene.enter('auth:login');
  });

  bot.action('go_individual', async (ctx) => {
    await ctx.scene.enter('onboarding:individual');
  });
  // Removed team registration from onboarding entry; team creation will be under captain tools after login

  bot.hears([/⚽ Haftalik o'yinlar/, /⚽ Еженедельные матчи/], async (ctx) => {
    if (!requireAuth(ctx)) return;
    
    await ctx.reply('Ro\'yxatdan o\'tish turi?', { 
      reply_markup: { 
        inline_keyboard: [
          [
            { text: '✍️ Shaxsiy', callback_data: 'sr_type_ind' }, 
            { text: '👥 Jamoa', callback_data: 'sr_type_team' }
          ]
        ] 
      } 
    } as any);
  });

  // Session registration flow
  async function showWeeklySessions(ctx: any) {
    try { await ctx.answerCbQuery?.(); } catch {}
    const now = new Date();
    const start = new Date(now); // start from current time
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const type = (ctx.session as any).srType === 'TEAM' ? 'TEAM' : 'INDIVIDUAL';
    const sessions = type === 'TEAM'
      ? await listSessionsForTeamSignup(prisma as any, start, end)
      : await listAvailableSessions(prisma as any, start, end);
    if (!sessions.length) {
      await ctx.reply('Bu hafta uchun mos sessiya topilmadi.');
      return;
    }
    const rows = sessions.map((s: any) => {
      const d = new Date(s.startAt);
      const endAt = new Date(s.endAt);
      const label = `${formatUzDayAndTimeRange(d, endAt)} (${uzTypeLabel(s.type)})`;
      return [{ text: label, callback_data: `sr_pick_${s.id}` }];
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
    
    // Handle admin rejection comment
    if (sess.pendingRejectionId && (ctx.state as any).isAdmin) {
      const rejectionComment = (ctx.message as any)?.text?.trim();
      const registrationId = sess.pendingRejectionId;
      delete sess.pendingRejectionId;
      
      if (!rejectionComment) {
        await ctx.reply('Sabab yozilmadi. Qaytadan urinib ko\'ring.');
        return;
      }
      
      // Get registration details for notification
      const reg = await (prisma as any).sessionRegistration.findUnique({ 
        where: { id: registrationId }, 
        include: { session: true, user: true, team: { include: { members: { include: { user: true } } } }, payment: true } 
      });
      
      if (!reg) {
        await ctx.reply('Ro\'yxatdan o\'tish topilmadi.');
        return;
      }
      
      // Update registration status with rejection comment
      await (prisma as any).sessionRegistration.update({ 
        where: { id: registrationId }, 
        data: { status: 'REJECTED', rejectionReason: rejectionComment } 
      });
      
      await ctx.reply('❌ Sessiya ro\'yxatdan o\'tish rad etildi');
      
      // Notify affected users
      try {
        const s = reg.session!;
        const { formatUzDayAndTimeRange } = await import('../utils/format');
        const when = formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt));
        const msg = `❌ Ro'yxatdan o'tish rad etildi\n🗓️ ${when}\n🏟️ ${(s as any).stadium || '-'}\n📍 ${(s as any).place || '-'}\n\n💬 Sabab: ${rejectionComment}`;
        
        if (reg.type === 'TEAM' && reg.team) {
          for (const tm of reg.team.members) {
            const tgId = tm.user?.telegramId;
            if (tgId) { 
              try { 
                await (ctx.telegram as any).sendMessage(tgId, msg); 
              } catch {} 
            }
          }
        } else if (reg.user?.telegramId) {
          try { 
            await (ctx.telegram as any).sendMessage(reg.user.telegramId, msg); 
          } catch {}
        }
      } catch (e) {
        console.error('Error notifying rejection:', e);
      }
      
      return;
    }
    
    // Legacy typed-date flow only if explicitly enabled
    if (sess.srDayAsk && sess.srType && !sess.srDay) {
      const day = (ctx.message as any).text.trim();
      sess.srDay = day;
      const startDay = new Date(`${day}T00:00:00`);
      const endDay = new Date(`${day}T23:59:59`);
      const list = await (prisma as any).session.findMany({ where: { startAt: { gte: startDay }, endAt: { lte: endDay }, status: 'PLANNED' }, orderBy: { startAt: 'asc' } });
      if (!list.length) { await ctx.reply('Ushbu kunda sessiya yo\'q'); sess.srType = undefined; sess.srDay = undefined; return; }
      const rows = list.map((s: any) => [{ text: `${s.startAt.toISOString().slice(11,16)}–${s.endAt.toISOString().slice(11,16)} (${s.type})`, callback_data: `sr_pick_${s.id}` }]);
      await ctx.reply('Sessiyani tanlang', { reply_markup: { inline_keyboard: rows } } as any);
      return;
    }
    if (sess.awaitReceiptForRegId) {
      // ignore plain text while awaiting photo
      return ctx.reply('Iltimos, to\'lov cheki suratini yuboring');
    }
    return next();
  });

  bot.action(/sr_pick_(.*)/, async (ctx) => {
    const sessionId = (ctx.match as any)[1] as string;
    const sess = (ctx.session as any) || {};
    const s = await (prisma as any).session.findUnique({ where: { id: sessionId }, include: { teams: { include: { team: { include: { members: { include: { user: true } } } } } } } });
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
      // If user has preferred number, check against first NABOR team with space
      const userId = (ctx.state as any).userId as string;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const preferred = user?.preferredNumber || null;
      if (preferred) {
        const nabor = sessionTeams.find((st: any) => (st.team?.name || '').startsWith('FOT NABOR') && (st.team?.members?.length || 0) < 7);
        if (nabor) {
          const used = new Set<number>();
          for (const m of (nabor.team?.members || []) as any[]) {
            const num = m.number ?? m.user?.preferredNumber ?? null;
            if (typeof num === 'number') used.add(num);
          }
          if (used.has(preferred)) {
            // Ask to choose another number before registration
            const available: number[] = [];
            for (let i = 1; i <= 25; i++) if (!used.has(i)) available.push(i);
            const rows: any[] = [];
            for (let i = 0; i < available.length; i += 5) {
              rows.push(available.slice(i, i + 5).map((n) => ({ text: String(n), callback_data: `sr_num_pick_${n}_${sessionId}` })));
            }
            rows.push([{ text: '⬅️ Orqaga', callback_data: 'sr_back' }]);
            await ctx.reply('Bu NABOR jamoasida sizning raqamingiz band. Iltimos, boshqasini tanlang:', { reply_markup: { inline_keyboard: rows } } as any);
            return;
          }
        }
      }
      reg = await (prisma as any).sessionRegistration.create({ data: { sessionId, userId: (ctx.state as any).userId, type, status: 'PENDING' } });
    } else {
      const team = await prisma.team.findFirst({ where: { captainId: (ctx.state as any).userId }, include: { members: { include: { user: true } } } });
      if (!team) return ctx.reply('Avval jamoa yarating: /team');
      const count = team.members.length;
      if (count !== 7) return ctx.reply(`❌ Jamoada aniq 7 o'yinchi bo'lishi kerak. Hozir: ${count}`);
      // Check number duplicates within team (TeamMember.number or fallback to user's preferredNumber)
      const seen = new Map<number, string[]>();
      for (const m of team.members as any[]) {
        const num = (m as any).number ?? (m as any).user?.preferredNumber ?? null;
        if (typeof num === 'number') {
          const arr = seen.get(num) || [];
          arr.push(`${m.user.firstName} ${m.user.lastName || ''}`.trim());
          seen.set(num, arr);
        }
      }
      const conflicts = Array.from(seen.entries()).filter(([_, arr]) => arr.length > 1);
      if (conflicts.length) {
        const lines = conflicts.map(([num, arr]) => `#${num}: ${arr.join(', ')}`).join('\n');
        return ctx.reply(`❌ Jamoada bir xil raqamlar bor. Iltimos, raqamlarni o'zgartiring:\n${lines}`);
      }
      reg = await (prisma as any).sessionRegistration.create({ data: { sessionId, teamId: team.id, type, status: 'PENDING' } });
    }
    const count = type === 'TEAM' && reg?.teamId ? (await prisma.teamMember.count({ where: { teamId: reg.teamId } })) : 1;
    const amount = 40000 * count;
    const pay = await (prisma as any).payment.create({ data: { sessionRegistrationId: reg.id, amount, method: process.env.PAYMENT_METHOD || 'MANUAL', status: 'PENDING', userId: (ctx.state as any).userId, teamId: reg.teamId || null } });
    sess.awaitReceiptForRegId = reg.id;
    await ctx.reply(`To‘lov summasi: ${amount} UZS\n${require('../services/payments').paymentInstructions()}`);
    await ctx.reply('Iltimos, to‘lov chekini surat qilib yuboring');
  });

  // Number pick during single registration conflict
  bot.action(/sr_num_pick_(\d+)_(.*)/, async (ctx) => {
    if (!requireAuth(ctx)) return;
    const n = parseInt((ctx.match as any)[1], 10);
    const sessionId = (ctx.match as any)[2] as string;
    const userId = (ctx.state as any).userId as string;
    if (n < 1 || n > 25) { await ctx.answerCbQuery('Noto\'g\'ri'); return; }
    await prisma.user.update({ where: { id: userId }, data: { preferredNumber: n } });
    await ctx.answerCbQuery('Raqam o\'zgartirildi');
    // Proceed to create registration now
    const reg = await (prisma as any).sessionRegistration.create({ data: { sessionId, userId, type: 'INDIVIDUAL', status: 'PENDING' } });
    const amount = 40000;
    await (prisma as any).payment.create({ data: { sessionRegistrationId: reg.id, amount, method: process.env.PAYMENT_METHOD || 'MANUAL', status: 'PENDING', userId } });
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

  // User: show approved upcoming session registrations
  bot.hears(['📅 Mening sessiyalarim'], async (ctx) => {
    const userId = (ctx.state as any).userId as string;
    const now = new Date();
    const regs = await (prisma as any).sessionRegistration.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          { userId },
          { team: { members: { some: { userId } } } },
        ],
        session: { startAt: { gte: now } },
      },
      include: { session: true, team: true },
      orderBy: { session: { startAt: 'asc' } },
      take: 10,
    });
    if (!regs.length) return ctx.reply('Kelgusi sessiyalar tasdiqlanmagan.');
    const lines = regs.map((r: any) => {
      const s = r.session!;
      const label = formatUzDayAndTimeRange(new Date(s.startAt), new Date(s.endAt));
      const who = r.type === 'TEAM' ? `Jamoa: ${r.team?.name}` : 'Yakka';
      return `• ${label} · ${who}`;
    }).join('\n');
    await ctx.reply(`📅 Tasdiqlangan sessiyalarim:\n${lines}`);
  });

  bot.hears([/👤 Profil/, /👤 Профиль/], async (ctx) => {
    if (!requireAuth(ctx)) return;
    
    const userId = (ctx.state as any).userId as string;
    const u = await prisma.user.findUnique({ where: { id: userId }, include: { stats: true } });
    const ps = u?.stats?.[0];
    await ctx.reply(`👤 ${u?.firstName || ''}\n📞 ${u?.phone || '-'}\n⭐️ ${ps?.rating ?? 0} | ⚽ ${ps?.goals ?? 0} | 🅰️ ${ps?.assists ?? 0} | 🏆 ${ps?.wins ?? 0}`);
    await ctx.reply('⚙️ Sozlamalar / Настройки', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Ma\'lumotni o\'zgartirish / Изменить данные', callback_data: 'profile_edit' }],
          [{ text: `🔢 O'yinchi raqami: ${u?.preferredNumber ?? '—'}`, callback_data: 'profile_number' }],
          [{ text: '🔐 Parolni o\'zgartirish / Сменить пароль', callback_data: 'profile_password' }],
          [{ text: '🚪 Chiqish / Выйти', callback_data: 'profile_logout' }],
        ],
      },
    } as any);
  });

  // Number selection grid 1..25
  function numberKeyboard(selected?: number) {
    const rows: any[] = [];
    const makeBtn = (n: number) => ({ text: selected === n ? `✅ ${n}` : String(n), callback_data: `profile_num_pick_${n}` });
    for (let r = 0; r < 5; r++) {
      const row: any[] = [];
      for (let c = 1; c <= 5; c++) {
        const n = r * 5 + c;
        row.push(makeBtn(n));
      }
      rows.push(row);
    }
    rows.push([{ text: '⬅️ Orqaga', callback_data: 'profile_number_back' }]);
    return { inline_keyboard: rows } as any;
  }

  bot.action('profile_number', async (ctx) => {
    if (!requireAuth(ctx)) return;
    const userId = (ctx.state as any).userId as string;
    const u = await prisma.user.findUnique({ where: { id: userId } });
    await ctx.answerCbQuery();
    await ctx.reply('Raqamni tanlang (1–25):', { reply_markup: numberKeyboard(u?.preferredNumber || undefined) } as any);
  });

  bot.action(/profile_num_pick_(\d+)/, async (ctx) => {
    if (!requireAuth(ctx)) return;
    const n = parseInt((ctx.match as any)[1], 10);
    const userId = (ctx.state as any).userId as string;
    if (n < 1 || n > 25) { await ctx.answerCbQuery('Noto\'g\'ri'); return; }
    await prisma.user.update({ where: { id: userId }, data: { preferredNumber: n } });
    await ctx.answerCbQuery('Saqlandi');
    await ctx.editMessageReplyMarkup(numberKeyboard(n) as any).catch(async () => {
      await ctx.reply('Saqlandi', { reply_markup: numberKeyboard(n) } as any);
    });
  });

  bot.action('profile_number_back', async (ctx) => { try { await ctx.answerCbQuery(); } catch {} });

  // Add handler for "Mening sessiyalarim" button 
  bot.hears([/📅 Mening sessiyalarim/, /📅 Мои сессии/], async (ctx) => {
    if (!requireAuth(ctx)) return;
    
    const userId = (ctx.state as any).userId as string;
    const regs = await (prisma as any).sessionRegistration.findMany({
      where: { 
        OR: [
          { userId, status: 'APPROVED' },
          { team: { captainId: userId }, status: 'APPROVED' }
        ]
      },
      include: { session: true, team: true },
      orderBy: { session: { startAt: 'asc' } }
    });
    
    if (!regs.length) {
      return ctx.reply('📅 Sizda hozircha tasdiqlangan sessiyalar yo\'q');
    }
    
    const lines = regs.map((r: any) => {
      const label = formatUzDayAndTimeRange(r.session.startAt, r.session.endAt);
      const who = r.type === 'TEAM' ? `Jamoa: ${r.team?.name}` : 'Yakka';
      return `• ${label} · ${who}`;
    }).join('\n');
    await ctx.reply(`📅 Tasdiqlangan sessiyalarim:\n${lines}`);
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

  // CRITICAL: Global stats entry handler (moved here to ensure it works outside scenes)
  bot.action(/sess_stats_entry_(.*)/, async (ctx) => {
    console.log('DEBUG: MAIN handler sess_stats_entry triggered');
    if (!(ctx.state as any).isAdmin) {
      console.log('DEBUG: MAIN handler - Not admin, returning');
      return;
    }
    const id = (ctx.match as any)[1];
    console.log('DEBUG: MAIN handler - Session ID:', id);
    
    const s = await (prisma as any).session.findUnique({ where: { id } });
    if (!s || (s as any).status !== 'STARTED') {
      console.log('DEBUG: MAIN handler - Session not found or not started');
      return ctx.answerCbQuery('Session not started');
    }
    
    console.log('DEBUG: MAIN handler - About to answer callback and enter scene');
    await ctx.answerCbQuery();
    console.log('DEBUG: MAIN handler - Entering admin:sessionMatchStats scene with sessionId:', id);
    console.log('DEBUG: MAIN handler - scene state being passed:', { sessionId: id });
    try {
      await ctx.scene.enter('admin:sessionMatchStats', { sessionId: id });
      console.log('DEBUG: MAIN handler - Scene enter call completed');
    } catch (error) {
      console.error('DEBUG: MAIN handler - Scene enter failed:', error);
      await ctx.reply('Scene enter failed: ' + String(error));
    }
  });
}


