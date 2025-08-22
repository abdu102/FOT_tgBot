import { Markup } from 'telegraf';
import type { Scenes } from 'telegraf';

export function buildMainKeyboard(ctx: Scenes.WizardContext) {
  // @ts-ignore - i18n provided by middleware augmentation
  const uz = ctx.i18n.locale() === 'uz';
  return Markup.keyboard([
    [uz ? '📝 Ro‘yxatdan o‘tish' : '📝 Регистрация'],
    [uz ? '⚽ Haftalik o‘yinlar' : '⚽ Еженедельные матчи'],
    [uz ? '👤 Profil' : '👤 Профиль'],
    [uz ? '🌐 Til: UZ/RU' : '🌐 Язык: UZ/RU'],
  ]).resize();
}


