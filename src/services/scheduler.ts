import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { Telegram } from 'telegraf';
import dayjs from 'dayjs';

export function setupCronJobs(telegram: Telegram, prisma: PrismaClient) {
  const tz = process.env.TIMEZONE || 'Asia/Tashkent';
  // Every day at 10:00 local time send reminders for matches happening next day
  cron.schedule('0 10 * * *', async () => {
    const now = dayjs();
    const tomorrowStart = now.add(1, 'day').startOf('day').toDate();
    const tomorrowEnd = now.add(1, 'day').endOf('day').toDate();
    const matches = await prisma.match.findMany({
      where: { dateTime: { gte: tomorrowStart, lte: tomorrowEnd } },
    });
    for (const m of matches) {
      const regs = await prisma.registration.findMany({
        where: { matchId: m.id, status: 'APPROVED' },
        include: { user: true, team: { include: { members: { include: { user: true } } } } },
      });
      const recipients = new Set<string>();
      for (const r of regs) {
        if (r.user?.telegramId) recipients.add(r.user.telegramId);
        if (r.team) {
          for (const tm of r.team.members) {
            if (tm.user.telegramId) recipients.add(tm.user.telegramId);
          }
        }
      }
      for (const tgId of recipients) {
        try {
          await telegram.sendMessage(
            tgId,
            `⏰ Eslatma / Напоминание\n\n📅 ${dayjs(m.dateTime).format('YYYY-MM-DD HH:mm')}\n📍 ${m.location}`
          );
        } catch {}
      }
    }
  }, { timezone: tz });
}


