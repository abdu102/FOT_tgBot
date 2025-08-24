import type { PrismaClient } from '@prisma/client';

async function ensureUser(prisma: PrismaClient, i: number) {
  const telegramId = `seed_u_${i}`;
  let user = await prisma.user.findUnique({ where: { telegramId } }).catch(() => null);
  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        firstName: `Seed${i}`,
        lastName: `User${i}`,
        username: `seed_${i}`,
        language: 'uz',
        isActive: true,
      },
    });
  }
  return user;
}

async function ensureTeam(prisma: PrismaClient, idx: number, memberStart: number, membersCount: number) {
  const captain = await ensureUser(prisma, memberStart);
  const team = await prisma.team.create({ data: { name: `Demo Team ${idx}`, captainId: captain.id } });
  await prisma.teamMember.create({ data: { teamId: team.id, userId: captain.id } });
  for (let j = 1; j < membersCount; j++) {
    const u = await ensureUser(prisma, memberStart + j);
    await prisma.teamMember.create({ data: { teamId: team.id, userId: u.id } });
  }
  return team;
}

export async function createDemoSessionWithTeams(prisma: PrismaClient) {
  const startAt = new Date();
  startAt.setDate(startAt.getDate() + 1);
  startAt.setHours(18, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  const session = await (prisma as any).session.create({
    data: { startAt, endAt, type: 'FIVE_V_FIVE', status: 'PLANNED', maxTeams: 4 },
  });
  const t1 = await ensureTeam(prisma, 1, 1, 6);
  const t2 = await ensureTeam(prisma, 2, 7, 6);
  const t3 = await ensureTeam(prisma, 3, 13, 6);
  const t4 = await ensureTeam(prisma, 4, 19, 6);
  for (const t of [t1, t2, t3, t4]) {
    await (prisma as any).sessionTeam.create({ data: { sessionId: session.id, teamId: t.id } });
  }
  // Do not auto-create matches; admin will add matches manually
  return { sessionId: session.id };
}

export async function seedTwoTeamsAndSinglesPending(prisma: PrismaClient, opts?: { teams?: number; singles?: number }) {
  const teams = opts?.teams ?? 1; // number of full 7-player teams
  const singles = opts?.singles ?? 21; // number of single users
  const startAt = new Date();
  startAt.setDate(startAt.getDate() + 1);
  startAt.setHours(19, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  const session = await (prisma as any).session.create({ data: { startAt, endAt, type: 'FIVE_V_FIVE', status: 'PLANNED', maxTeams: 4, stadium: 'Demo Arena', place: 'Tashkent' } });

  // Create full 7-player teams as pending registrations
  let cursor = 1;
  for (let i = 1; i <= teams; i++) {
    const t = await ensureTeam(prisma, i, cursor, 7);
    cursor += 7;
    const reg = await (prisma as any).sessionRegistration.create({ data: { sessionId: session.id, teamId: t.id, type: 'TEAM', status: 'PENDING' } });
    const amount = 40000 * 7;
    await (prisma as any).payment.create({ data: { sessionRegistrationId: reg.id, amount, method: process.env.PAYMENT_METHOD || 'MANUAL', status: 'PENDING', teamId: t.id } });
  }

  // Create singles as pending registrations
  for (let i = 0; i < singles; i++) {
    const u = await ensureUser(prisma, 1000 + i);
    const reg = await (prisma as any).sessionRegistration.create({ data: { sessionId: session.id, userId: u.id, type: 'INDIVIDUAL', status: 'PENDING' } });
    await (prisma as any).payment.create({ data: { sessionRegistrationId: reg.id, amount: 40000, method: process.env.PAYMENT_METHOD || 'MANUAL', status: 'PENDING', userId: u.id } });
  }

  return { sessionId: session.id };
}
