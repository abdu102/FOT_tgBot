import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildMainKeyboard, buildAuthKeyboard } from '../keyboards/main';
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
    const matches = await prisma.match.findMany({ orderBy: { dateTime: 'asc' }, take: 10 });
    if (!matches.length) return ctx.reply('Hozircha yo‘q / Пока нет', isAuth ? buildMainKeyboard(ctx) : buildAuthKeyboard(ctx));
    for (const m of matches) {
      const inline = [
        [{ text: '✍️ Shaxsiy / Индивидуально', callback_data: `signup_ind_${m.id}` }],
      ];
      const team = await prisma.team.findFirst({ where: { captainId: (ctx.state as any).userId } });
      if (team) inline.push([{ text: '👥 Jamoa bilan / Командой', callback_data: `signup_team_${m.id}` }]);
      await ctx.reply(`📅 ${m.dateTime.toISOString().slice(0,16).replace('T',' ')}\n📍 ${m.location}\n💰 ${m.pricePerUser} UZS`, { reply_markup: { inline_keyboard: inline } } as any);
    }
  });

  bot.action(/signup_ind_(.*)/, async (ctx) => {
    const matchId = (ctx.match as any)[1] as string;
    const userId = (ctx.state as any).userId as string;
    await prisma.registration.create({ data: { matchId, userId, type: 'INDIVIDUAL', status: 'PENDING' } });
    await ctx.reply('🧾 To‘lov uchun ma’lumot yuborildi. Admin tasdiqlaydi.');
  });

  bot.action(/signup_team_(.*)/, async (ctx) => {
    const matchId = (ctx.match as any)[1] as string;
    const userId = (ctx.state as any).userId as string;
    const team = await prisma.team.findFirst({ where: { captainId: userId } });
    if (!team) return ctx.reply('Avval jamoa yarating: /team');
    await prisma.registration.create({ data: { matchId, teamId: team.id, type: 'TEAM', status: 'PENDING' } });
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


