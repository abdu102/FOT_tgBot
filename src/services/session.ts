import type { PrismaClient } from '@prisma/client';

type Totals = { points: number; gf: number; ga: number };

export async function computeSessionTable(prisma: PrismaClient, sessionId: string) {
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
  return table as Array<{ team: { name: string }, points: number, goalsFor: number, goalsAgainst: number }>
}


