import type { Context } from 'telegraf';

export async function safeAnswerCb(ctx: any, text?: string) {
  try {
    await ctx.answerCbQuery?.(text);
  } catch {}
}

export async function editOrReply(ctx: any, text: string, extra?: any) {
  try {
    // Prefer editing the originating message if possible
    if ((ctx as any).callbackQuery) {
      await (ctx as any).editMessageText(text, extra);
      return;
    }
  } catch {}
  try {
    await ctx.reply(text, extra);
  } catch {}
}


