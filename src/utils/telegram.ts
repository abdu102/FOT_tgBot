import type { Context } from 'telegraf';
import { Counter, Histogram } from 'prom-client';

export async function safeAnswerCb(ctx: any, text?: string) {
  try {
    await ctx.answerCbQuery?.(text);
  } catch {}
}

export async function editOrReply(ctx: any, text: string, extra?: any) {
  const start = Date.now();
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
  finally {
    const ms = Date.now() - start;
    try { responseTime.observe({ handler: 'editOrReply' }, ms / 1000); } catch {}
  }
}

// Basic metrics
export const messageCounter = new Counter({
  name: 'telegram_messages_total',
  help: 'Total number of telegram updates processed',
  labelNames: ['type']
});

export const responseTime = new Histogram({
  name: 'telegram_handler_duration_seconds',
  help: 'Handler response time in seconds',
  labelNames: ['handler']
});


