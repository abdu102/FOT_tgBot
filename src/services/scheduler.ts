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

	// Sessions: day-before reminder at 10:00
	cron.schedule('0 10 * * *', async () => {
		const start = dayjs().add(1, 'day').startOf('day');
		const end = start.endOf('day');
		const sessions = await (prisma as any).session.findMany({
			where: { startAt: { gte: start.toDate(), lte: end.toDate() } },
		});
		for (const s of sessions) {
			const regs = await (prisma as any).sessionRegistration.findMany({ where: { sessionId: s.id, status: 'APPROVED' }, include: { user: true, team: { include: { members: { include: { user: true } } } } } });
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
					await telegram.sendMessage(tgId, `⏰ Eslatma: ertaga sessiya bor!`);
				} catch {}
			}
		}
	}, { timezone: tz });

	// Sessions: 5 hours before start, every 30 minutes check windows in next 5 hours and send message if crossing threshold
	cron.schedule('*/30 * * * *', async () => {
		const now = dayjs();
		const inFiveHours = now.add(5, 'hour').toDate();
		const sessions = await (prisma as any).session.findMany({ where: { startAt: { gte: now.toDate(), lte: inFiveHours } } });
		for (const s of sessions) {
			const regs = await (prisma as any).sessionRegistration.findMany({ where: { sessionId: s.id, status: 'APPROVED' }, include: { user: true, team: { include: { members: { include: { user: true } } } } } });
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
					await telegram.sendMessage(tgId, `❗️O’YINDAN 5-10 MINUT OLDIN KELING, VAQT QO’SHILIB BERILMAYDI\nTishli butsi kiymaganiz yaxshiroq!`);
				} catch {}
			}
		}
	}, { timezone: tz });
}


