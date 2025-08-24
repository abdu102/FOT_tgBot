import type { PrismaClient } from '@prisma/client';

const NABOR_PREFIX = 'FOT NABOR';

export async function ensureTeamInSession(prisma: PrismaClient, sessionId: string, teamId: string) {
  const exists = await (prisma as any).sessionTeam.findUnique({ where: { sessionId_teamId: { sessionId, teamId } } });
  if (!exists) await (prisma as any).sessionTeam.create({ data: { sessionId, teamId } });
  return teamId;
}

export async function allocateIndividualToSession(prisma: PrismaClient, sessionId: string, userId: string) {
  // Find existing NABOR teams in this session and pick one with < 7 members
  const naborTeams = await (prisma as any).sessionTeam.findMany({ where: { sessionId }, include: { team: { include: { members: true } } } });
  let targetTeamId: string | null = null;
  for (const st of naborTeams) {
    if (st.team?.name?.startsWith(NABOR_PREFIX)) {
      const size = st.team.members.length;
      if (size < 7) { targetTeamId = st.teamId as string; break; }
    }
  }
  // If none, create a new NABOR team if slots available (< 4 teams)
  const teamCount = await (prisma as any).sessionTeam.count({ where: { sessionId } });
  if (!targetTeamId) {
    if (teamCount >= 4) return false;
    const idx = (naborTeams.filter((x: any) => x.team?.name?.startsWith(NABOR_PREFIX)).length || 0) + 1;
    const captainId = userId; // first individual becomes captain nominally
    const t = await (prisma as any).team.create({ data: { name: `${NABOR_PREFIX} ${idx}`, captainId } });
    await (prisma as any).teamMember.create({ data: { teamId: t.id, userId } });
    await (prisma as any).sessionTeam.create({ data: { sessionId, teamId: t.id } });
    return true;
  }
  // Add user to existing team if not already member
  const existsMember = await (prisma as any).teamMember.findUnique({ where: { teamId_userId: { teamId: targetTeamId, userId } } }).catch(() => null);
  if (!existsMember) await (prisma as any).teamMember.create({ data: { teamId: targetTeamId, userId } });
  return true;
}


