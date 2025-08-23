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
  await prisma.match.create({ data: { sessionId: session.id, homeTeamId: t1.id, awayTeamId: t2.id, dateTime: startAt, location: 'Session' } as any });
  await prisma.match.create({ data: { sessionId: session.id, homeTeamId: t3.id, awayTeamId: t4.id, dateTime: new Date(startAt.getTime() + 30 * 60 * 1000), location: 'Session' } as any });
  return { sessionId: session.id };
}
