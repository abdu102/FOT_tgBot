import { Markup } from 'telegraf';
import type { Scenes } from 'telegraf';

export function buildMainKeyboard(ctx: Scenes.WizardContext) {
  // @ts-ignore
  const uz = ctx.i18n.locale() === 'uz';
  return Markup.keyboard([
    [uz ? '⚽ Haftalik o‘yinlar' : '⚽ Еженедельные матчи'],
    [uz ? '👥 Jamoa' : '👥 Команда'],
    [uz ? '📅 Mening sessiyalarim' : '📅 Мои сессии'],
    [uz ? '👤 Profil' : '👤 Профиль'],
    [uz ? '🌐 Til: UZ/RU' : '🌐 Язык: UZ/RU'],
  ]).resize();
}

export function buildAuthKeyboard(ctx: Scenes.WizardContext, opts?: { showRegister?: boolean }) {
  // @ts-ignore
  const uz = ctx.i18n.locale() === 'uz';
  const rows: string[][] = [];
  const showRegister = opts?.showRegister !== false;
  if (showRegister) rows.push([uz ? '📝 Ro‘yxatdan o‘tish' : '📝 Регистрация']);
  rows.push([uz ? '🔐 Kirish' : '🔐 Войти']);
  return Markup.keyboard(rows).resize();
}


