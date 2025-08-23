import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildMainKeyboard, buildAuthKeyboard } from '../keyboards/main';
import bcrypt from 'bcryptjs';

export function registerMainHandlers(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  bot.hears(['📝 Ro‘yxatdan o‘tish', '📝 Регистрация'], async (ctx) => {
    const u = await prisma.user.findUnique({ where: { id: (ctx.state as any).userId } });
    if (u?.phone) {
      return ctx.reply('Siz allaqachon ro‘yxatdan o‘tgansiz / Вы уже зарегистрированы');
    }
    // Ask which mode
    await ctx.reply('Qaysi turda? / Как?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 O‘yinchi / Игрок', callback_data: 'go_individual' }],
          [{ text: '👥 Jamoa / Команда', callback_data: 'go_team' }],
        ],
      },
    } as any);
  });

  bot.action('go_individual', async (ctx) => {
    await ctx.scene.enter('onboarding:individual');
  });
  bot.action('go_team', async (ctx) => {
    await ctx.scene.enter('onboarding:team');
  });

  bot.hears(['⚽ Haftalik o‘yinlar', '⚽ Еженедельные матчи'], async (ctx) => {
    const isAuth = Boolean((ctx.state as any).isAuthenticated);
    const matches = await prisma.match.findMany({ orderBy: { dateTime: 'asc' }, take: 10 });
    if (!matches.length) return ctx.reply('Hozircha yo‘q / Пока нет', isAuth ? buildMainKeyboard(ctx) : buildAuthKeyboard(ctx));
    for (const m of matches) {
      await ctx.reply(
        `📅 ${m.dateTime.toISOString().slice(0,16).replace('T',' ')}\n📍 ${m.location}\n💰 ${m.pricePerUser} UZS`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '✍️ Ro‘yxatga yozilish / Записаться', callback_data: `signup_${m.id}` }]],
          },
        } as any
      );
    }
  });

  bot.action(/signup_(.*)/, async (ctx) => {
    const matchId = (ctx.match as any)[1] as string;
    const userId = (ctx.state as any).userId as string;
    // Create registration pending
    await prisma.registration.create({
      data: {
        matchId,
        userId,
        type: 'INDIVIDUAL',
        status: 'PENDING',
      },
    });
    await ctx.reply('🧾 To‘lov uchun ma’lumot yuborildi. Admin tasdiqlaydi. / Данные для оплаты отправлены, ждите подтверждения.');
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


