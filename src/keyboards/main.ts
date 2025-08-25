import { Markup } from 'telegraf';
import type { Scenes } from 'telegraf';

export function buildMainKeyboard(ctx: Scenes.WizardContext) {
  // @ts-ignore
  return Markup.keyboard([
    [ctx.i18n.t('menu.weekly_games')],
    [ctx.i18n.t('menu.team')],
    [ctx.i18n.t('menu.my_sessions')],
    [ctx.i18n.t('menu.profile')],
    [ctx.i18n.t('menu.language')],
  ]).resize();
}

export function buildAuthKeyboard(ctx: Scenes.WizardContext, opts?: { showRegister?: boolean }) {
  // @ts-ignore
  const rows: string[][] = [];
  const showRegister = opts?.showRegister !== false;
  if (showRegister) rows.push([ctx.i18n.t('auth.register')]);
  rows.push([ctx.i18n.t('auth.login')]);
  rows.push([ctx.i18n.t('menu.language')]);
  return Markup.keyboard(rows).resize();
}

export function buildWelcomeKeyboard(ctx: Scenes.WizardContext) {
  // @ts-ignore  
  return Markup.keyboard([
    [ctx.i18n.t('menu.weekly_games')],
    [ctx.i18n.t('menu.team')],
    [ctx.i18n.t('menu.my_sessions')],
    [ctx.i18n.t('menu.create_account')],
    [ctx.i18n.t('menu.language')],
  ]).resize();
}


