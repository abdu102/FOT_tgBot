import type { PrismaClient } from '@prisma/client';

const EPHEMERAL_PREFIXES = ['Singles ', 'FOT NABOR'];

function isEphemeralName(name?: string | null): boolean {
  if (!name) return false;
  return EPHEMERAL_PREFIXES.some((p) => name.startsWith(p));
}

export async function cleanupEphemeralTeams(prisma: PrismaClient) {
  const candidates = await (prisma as any).team.findMany({
    where: {
      OR: [
        { name: { startsWith: 'Singles ' } },
        { name: { startsWith: 'FOT NABOR' } },
      ],
      registrations: { none: {} },
      sessionRegistrations: { none: {} },
    },
    select: { id: true },
    take: 10000,
  });
  if (!candidates.length) return { deletedTeams: 0 };
  const teamIds = candidates.map((t: any) => t.id);
  await (prisma as any).teamMember.deleteMany({ where: { teamId: { in: teamIds } } });
  await (prisma as any).sessionTeam.deleteMany({ where: { teamId: { in: teamIds } } });
  const del = await (prisma as any).team.deleteMany({ where: { id: { in: teamIds } } });
  return { deletedTeams: del.count as number };
}

export async function enforceMaxTeamsForAllSessions(prisma: PrismaClient, maxTeams: number = 4) {
  const sessions = await (prisma as any).session.findMany({ select: { id: true }, take: 1000 });
  let deletedSessionTeams = 0;
  let deletedEphemeralTeams = 0;
  for (const s of sessions) {
    const sts = await (prisma as any).sessionTeam.findMany({ where: { sessionId: s.id }, include: { team: true }, orderBy: { id: 'asc' } });
    if (sts.length <= maxTeams) continue;
    const real = sts.filter((x: any) => !isEphemeralName(x.team?.name));
    const eph = sts.filter((x: any) => isEphemeralName(x.team?.name));
    const keep: any[] = [];
    for (const t of real) { if (keep.length < maxTeams) keep.push(t); }
    for (const t of eph) { if (keep.length < maxTeams) keep.push(t); }
    const keepIds = new Set(keep.map((x: any) => x.id));
    const drop = sts.filter((x: any) => !keepIds.has(x.id));
    if (drop.length) {
      const dropIds = drop.map((x: any) => x.id);
      await (prisma as any).sessionTeam.deleteMany({ where: { id: { in: dropIds } } });
      deletedSessionTeams += dropIds.length;
      // Remove orphan ephemeral teams of the dropped items
      const dropTeamIds = drop.filter((x: any) => isEphemeralName(x.team?.name)).map((x: any) => x.teamId);
      if (dropTeamIds.length) {
        await (prisma as any).teamMember.deleteMany({ where: { teamId: { in: dropTeamIds } } });
        const del = await (prisma as any).team.deleteMany({ where: { id: { in: dropTeamIds } } });
        deletedEphemeralTeams += del.count || 0;
      }
    }
  }
  return { deletedSessionTeams, deletedEphemeralTeams };
}


