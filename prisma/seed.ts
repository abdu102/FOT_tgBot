import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function ensureUser(i: number) {
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

async function ensureTeam(idx: number, memberStart: number, membersCount: number) {
  const captain = await ensureUser(memberStart);
  const team = await prisma.team.create({ data: { name: `Demo Team ${idx}`, captainId: captain.id } });
  // add captain first
  await prisma.teamMember.create({ data: { teamId: team.id, userId: captain.id } });
  for (let j = 1; j < membersCount; j++) {
    const u = await ensureUser(memberStart + j);
    await prisma.teamMember.create({ data: { teamId: team.id, userId: u.id } });
  }
  return team;
}

async function main() {
  // Create a session for tomorrow 18:00-20:00, 5v5
  const startAt = new Date();
  startAt.setDate(startAt.getDate() + 1);
  startAt.setHours(18, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { startAt, endAt, type: 'FIVE_V_FIVE', status: 'PLANNED', maxTeams: 4 },
  });

  // Create 4 demo teams with 6 members each (meets 5v5 min size)
  const t1 = await ensureTeam(1, 1, 6);
  const t2 = await ensureTeam(2, 7, 6);
  const t3 = await ensureTeam(3, 13, 6);
  const t4 = await ensureTeam(4, 19, 6);

  // Attach teams to session
  for (const t of [t1, t2, t3, t4]) {
    await (prisma as any).sessionTeam.create({ data: { sessionId: session.id, teamId: t.id } });
  }

  // Optionally pre-create two matches inside session
  await prisma.match.create({ data: { sessionId: session.id, homeTeamId: t1.id, awayTeamId: t2.id, dateTime: startAt, location: 'Session' } as any });
  await prisma.match.create({ data: { sessionId: session.id, homeTeamId: t3.id, awayTeamId: t4.id, dateTime: new Date(startAt.getTime() + 30 * 60 * 1000), location: 'Session' } as any });

  console.log(`Seeded session ${session.id} with 4 teams (Demo Team 1..4).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


