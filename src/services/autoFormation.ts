import type { PrismaClient } from '@prisma/client';

// Assign groupIndex 1..N for teams of size capacityPerTeam
export async function autoFormTeams(prisma: PrismaClient, matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return;
  const registrations = await prisma.registration.findMany({
    where: { matchId, status: 'APPROVED', type: 'INDIVIDUAL' },
    orderBy: { createdAt: 'asc' },
  });
  let idx = 0;
  for (const r of registrations) {
    const group = Math.floor(idx / (match.capacityPerTeam || 7)) + 1;
    await prisma.registration.update({ where: { id: r.id }, data: { groupIndex: group } });
    idx++;
  }
}


