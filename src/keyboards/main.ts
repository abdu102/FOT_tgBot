import { Markup } from 'telegraf';
import type { Scenes } from 'telegraf';

export function buildMainKeyboard(ctx: Scenes.WizardContext, opts?: { showRegister?: boolean }) {
  // @ts-ignore - i18n provided by middleware augmentation
  const uz = ctx.i18n.locale() === 'uz';
  const rows: string[][] = [];
  const wantRegister = opts?.showRegister !== false;
  if (wantRegister) rows.push([uz ? '📝 Ro‘yxatdan o‘tish' : '📝 Регистрация']);
  rows.push([uz ? '⚽ Haftalik o‘yinlar' : '⚽ Еженедельные матчи']);
  rows.push([uz ? '👤 Profil' : '👤 Профиль']);
  rows.push([uz ? '🌐 Til: UZ/RU' : '🌐 Язык: UZ/RU']);
  return Markup.keyboard(rows).resize();
}


