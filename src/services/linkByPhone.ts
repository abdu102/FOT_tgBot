import type { PrismaClient } from '@prisma/client';

export async function linkTelegramUserByPhone(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.phone) return;
  // If there exists a placeholder user with same phone (unlinked_), merge team memberships
  const placeholder = await prisma.user.findFirst({
    where: {
      phone: user.phone,
      telegramId: { startsWith: 'unlinked_' },
    },
    include: { teams: true },
  });
  if (!placeholder) return;
  for (const tm of placeholder.teams) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: tm.teamId, userId } },
      update: {},
      create: { teamId: tm.teamId, userId, role: tm.role || 'player' },
    });
  }
  await prisma.teamMember.deleteMany({ where: { userId: placeholder.id } });
  await prisma.user.delete({ where: { id: placeholder.id } });
}


