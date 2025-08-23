import type { PrismaClient } from '@prisma/client';

function getTeamSizeByType(type: any): number {
  return type === 'SIX_V_SIX' ? 6 : 5;
}

export async function autoFormSessionTeams(prisma: PrismaClient, sessionId: string) {
  const session = await (prisma as any).session.findUnique({ where: { id: sessionId } });
  if (!session) return { lockedTeams: [] as string[] };
  const teamSize = getTeamSizeByType((session as any).type);

  // Approved team registrations (optional if table exists)
  let teamRegs: any[] = [];
  try {
    teamRegs = await (prisma as any).sessionRegistration.findMany({ where: { sessionId, status: 'APPROVED', type: 'TEAM' }, include: { team: { include: { members: true } } } });
  } catch {
    teamRegs = [];
  }
  // Filter teams that meet minimum size requirement
  const eligibleTeamIds = teamRegs
    .filter((r: any) => (r.team?.members?.length || 0) >= teamSize)
    .map((r: any) => r.teamId as string);

  // Approved singles (optional)
  let singles: any[] = [];
  try {
    singles = await (prisma as any).sessionRegistration.findMany({ where: { sessionId, status: 'APPROVED', type: 'INDIVIDUAL' } });
  } catch {
    singles = [];
  }
  const singleUserIds = singles.map((r: any) => r.userId as string).filter(Boolean);

  const lockedTeams: string[] = [];

  // Lock existing eligible teams first (up to 4)
  for (const teamId of eligibleTeamIds) {
    if (lockedTeams.length >= 4) break;
    const exists = await (prisma as any).sessionTeam.findUnique({ where: { sessionId_teamId: { sessionId, teamId } } });
    if (!exists) {
      await (prisma as any).sessionTeam.create({ data: { sessionId, teamId } });
    }
    lockedTeams.push(teamId);
  }

  // Create ephemeral teams from singles to fill remaining slots
  let idx = 0;
  while (lockedTeams.length < 4 && idx < singleUserIds.length) {
    const group = singleUserIds.slice(idx, idx + teamSize);
    if (!group.length) break;
    const captainId = group[0];
    const team = await (prisma as any).team.create({ data: { name: `Singles ${sessionId.slice(0, 4)}-${lockedTeams.length + 1}`, captainId } });
    for (const uid of group) {
      await (prisma as any).teamMember.create({ data: { teamId: team.id, userId: uid } });
    }
    await (prisma as any).sessionTeam.create({ data: { sessionId, teamId: team.id } });
    lockedTeams.push(team.id);
    idx += teamSize;
  }

  return { lockedTeams };
}


