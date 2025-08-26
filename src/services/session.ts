import type { PrismaClient } from '@prisma/client';
import redis from '../config/redis';

type Totals = { points: number; gf: number; ga: number };

const cache = redis;

export async function computeSessionTable(prisma: PrismaClient, sessionId: string) {
  const cacheKey = `sess:table:${sessionId}`;
  try {
    if (cache) {
      const cached = await cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch {}
  const matches = await prisma.match.findMany({ where: { sessionId } as any });
  const totals = new Map<string, Totals>();
  const bump = (teamId: string, d: Partial<Totals>) => {
    const t = totals.get(teamId) || { points: 0, gf: 0, ga: 0 };
    totals.set(teamId, { points: t.points + (d.points || 0), gf: t.gf + (d.gf || 0), ga: t.ga + (d.ga || 0) });
  };
  for (const m of matches) {
    const homeId = (m as any).homeTeamId as string | undefined;
    const awayId = (m as any).awayTeamId as string | undefined;
    const homeScore = (m as any).homeScore as number | undefined;
    const awayScore = (m as any).awayScore as number | undefined;
    const result = (m as any).result as 'HOME' | 'AWAY' | 'DRAW' | null | undefined;
    if (!homeId || !awayId) continue;
    if (typeof homeScore === 'number' && typeof awayScore === 'number') {
      bump(homeId, { gf: homeScore, ga: awayScore });
      bump(awayId, { gf: awayScore, ga: homeScore });
    }
    if (result === 'HOME') {
      bump(homeId, { points: 3 });
    } else if (result === 'AWAY') {
      bump(awayId, { points: 3 });
    } else if (result === 'DRAW') {
      bump(homeId, { points: 1 });
      bump(awayId, { points: 1 });
    }
  }
  // Upsert rows
  for (const [teamId, t] of totals.entries()) {
    const existing = await (prisma as any).sessionTeam.findUnique({ where: { sessionId_teamId: { sessionId, teamId } } });
    if (existing) {
      await (prisma as any).sessionTeam.update({ where: { id: existing.id }, data: { points: t.points, goalsFor: t.gf, goalsAgainst: t.ga } });
    } else {
      await (prisma as any).sessionTeam.create({ data: { sessionId, teamId, points: t.points, goalsFor: t.gf, goalsAgainst: t.ga } });
    }
  }
  // Return table sorted
  const table = await (prisma as any).sessionTeam.findMany({ where: { sessionId }, include: { team: true }, orderBy: [{ points: 'desc' }, { goalsFor: 'desc' }] });
  try { if (cache) await cache.setex(cacheKey, 300, JSON.stringify(table)); } catch {}
  return table as Array<{ team: { name: string }, points: number, goalsFor: number, goalsAgainst: number }>
}

export async function getSessionTopPlayers(prisma: PrismaClient, sessionId: string) {
  const cacheKey = `sess:top:${sessionId}`;
  try {
    if (cache) {
      const cached = await cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch {}
  const matches = await prisma.match.findMany({ where: { sessionId } as any });
  const matchIds = matches.map((m) => m.id);
  if (!matchIds.length) return { topScorers: [], topAssists: [] };
  const stats = await prisma.matchStat.findMany({ where: { matchId: { in: matchIds } }, include: { user: true } });
  const goalsMap = new Map<string, { userId: string; name: string; goals: number }>();
  const assistsMap = new Map<string, { userId: string; name: string; assists: number }>();
  for (const s of stats) {
    const name = `${s.user.firstName}${s.user.lastName ? ' ' + s.user.lastName : ''}`;
    const g = goalsMap.get(s.userId) || { userId: s.userId, name, goals: 0 };
    g.goals += s.goals;
    goalsMap.set(s.userId, g);
    const a = assistsMap.get(s.userId) || { userId: s.userId, name, assists: 0 };
    a.assists += s.assists;
    assistsMap.set(s.userId, a);
  }
  const topScorers = Array.from(goalsMap.values()).sort((x, y) => y.goals - x.goals).slice(0, 10);
  const topAssists = Array.from(assistsMap.values()).sort((x, y) => y.assists - x.assists).slice(0, 10);
  const payload = { topScorers, topAssists };
  try { if (cache) await cache.setex(cacheKey, 300, JSON.stringify(payload)); } catch {}
  return payload;
}


// List only sessions in [start..end] that are not full.
// A session is considered full when it already has `maxTeams` teams and every one has at least 7 members.
export async function listAvailableSessions(
  prisma: PrismaClient,
  startInclusive: Date,
  endInclusive: Date
) {
  const key = `sess:list:${startInclusive.toISOString().slice(0,10)}:${endInclusive.toISOString().slice(0,10)}`;
  try {
    if (cache) {
      const cached = await cache.get(key);
      if (cached) return JSON.parse(cached);
    }
  } catch {}
  const sessions = await (prisma as any).session.findMany({
    where: {
      startAt: { gte: startInclusive, lte: endInclusive },
      status: 'PLANNED',
    },
    include: {
      teams: {
        include: {
          team: {
            include: { members: true },
          },
        },
      },
    },
    orderBy: { startAt: 'asc' },
    take: 200,
  });

  const notFull = (s: any) => {
    const maxTeams: number = typeof s.maxTeams === 'number' ? s.maxTeams : 4;
    const sessionTeams: any[] = Array.isArray(s.teams) ? s.teams : [];
    if (sessionTeams.length < maxTeams) return true;
    const fullTeams = sessionTeams.filter((st: any) => ((st.team?.members?.length || 0) >= 7)).length;
    return fullTeams < maxTeams;
  };

  const result = sessions.filter(notFull);
  try { if (cache) await cache.setex(key, 60, JSON.stringify(result)); } catch {}
  return result;
}

// List sessions that can accept a full team (at least one empty slot and capacity for a 7-player team)
export async function listSessionsForTeamSignup(
  prisma: PrismaClient,
  startInclusive: Date,
  endInclusive: Date
) {
  const key = `sess:listTeam:${startInclusive.toISOString().slice(0,10)}:${endInclusive.toISOString().slice(0,10)}`;
  try {
    if (cache) {
      const cached = await cache.get(key);
      if (cached) return JSON.parse(cached);
    }
  } catch {}
  const sessions = await (prisma as any).session.findMany({
    where: {
      startAt: { gte: startInclusive, lte: endInclusive },
      status: 'PLANNED',
    },
    include: {
      teams: { include: { team: { include: { members: true } } } },
    },
    orderBy: { startAt: 'asc' },
    take: 200,
  });

  const hasSlotForFullTeam = (s: any) => {
    const maxTeams: number = typeof s.maxTeams === 'number' ? s.maxTeams : 4;
    const sessionTeams: any[] = Array.isArray(s.teams) ? s.teams : [];
    if (sessionTeams.length >= maxTeams) return false;
    // If there is at least one available team slot, a full team can join
    return true;
  };

  const result = sessions.filter(hasSlotForFullTeam);
  try { if (cache) await cache.setex(key, 60, JSON.stringify(result)); } catch {}
  return result;
}


