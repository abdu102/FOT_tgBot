import type { PrismaClient } from '@prisma/client';
import redis from '../config/redis';

export async function addMatchStat(
  prisma: PrismaClient,
  params: { matchId: string; userId: string; goals: number; assists: number; won: boolean }
) {
  const { matchId, userId, goals, assists, won } = params;
  await prisma.matchStat.upsert({
    where: { matchId_userId: { matchId, userId } },
    update: { 
      goals: { increment: goals },
      assists: { increment: assists },
      won 
    },
    create: { matchId, userId, goals, assists, won },
  });
  await updatePlayerAggregates(prisma, userId);
  // Invalidate caches for the session that includes this match
  try {
    const match = await prisma.match.findUnique({ where: { id: matchId } as any });
    const sessionId = (match as any)?.sessionId as string | undefined;
    if (sessionId) {
      await redis.del(`sess:top:${sessionId}`);
      await redis.del(`sess:table:${sessionId}`);
    }
  } catch {}
}

export async function updatePlayerAggregates(prisma: PrismaClient, userId: string) {
  const agg = await prisma.matchStat.aggregate({
    where: { userId },
    _sum: { goals: true, assists: true },
    _count: { _all: true },
  });
  const wins = await prisma.matchStat.count({ where: { userId, won: true } });
  const goals = agg._sum.goals || 0;
  const assists = agg._sum.assists || 0;
  const rating = wins * 3 + goals * 1 + assists * 0.5;
  await prisma.playerStat.upsert({
    where: { userId },
    update: { goals, assists, wins, rating },
    create: { userId, goals, assists, wins, rating },
  });
}


