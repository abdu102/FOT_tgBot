import type { PrismaClient } from '@prisma/client';

function getTeamSizeByType(type: any): number {
  return type === 'SIX_V_SIX' ? 6 : 5;
}

export async function autoFormSessionTeams(prisma: PrismaClient, sessionId: string) {
  const session = await (prisma as any).session.findUnique({ where: { id: sessionId } });
  if (!session) return { lockedTeams: [] as string[] };
  const teamSize = getTeamSizeByType((session as any).type);

  // Guard: if session already has 4 teams, do nothing (idempotent)
  const existingTeams = await (prisma as any).sessionTeam.findMany({ where: { sessionId }, include: { team: { include: { members: true } } } });
  if (existingTeams.length >= 4) return { lockedTeams: [] };

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
  // Exclude users already assigned to any session team
  const assignedUserIds = new Set<string>();
  for (const est of existingTeams) {
    for (const m of (est.team?.members || [])) assignedUserIds.add(m.userId);
  }
  const singleUserIds = singles.map((r: any) => r.userId as string).filter((uid: any) => Boolean(uid) && !assignedUserIds.has(uid as string));

  const lockedTeams: string[] = [];

  // Lock existing eligible teams first (up to 4)
  for (const teamId of eligibleTeamIds) {
    if (existingTeams.length + lockedTeams.length >= 4) break;
    const exists = await (prisma as any).sessionTeam.findUnique({ where: { sessionId_teamId: { sessionId, teamId } } });
    if (!exists) {
      await (prisma as any).sessionTeam.create({ data: { sessionId, teamId } });
    }
    lockedTeams.push(teamId);
  }

  // Create ephemeral teams from singles to fill remaining slots
  let idx = 0;
  const naborPrefix = 'FOT NABOR';
  const existingNaborCount = existingTeams.filter((x: any) => x.team?.name?.startsWith(naborPrefix)).length;
  while (existingTeams.length + lockedTeams.length < 4 && idx < singleUserIds.length) {
    const group = singleUserIds.slice(idx, idx + teamSize);
    if (!group.length) break;
    const captainId = group[0];
    const teamIndex = existingNaborCount + lockedTeams.length + 1;
    const team = await (prisma as any).team.create({ data: { name: `${naborPrefix} ${teamIndex}`, captainId } });
    for (const uid of group) {
      await (prisma as any).teamMember.create({ data: { teamId: team.id, userId: uid } });
    }
    await (prisma as any).sessionTeam.create({ data: { sessionId, teamId: team.id } });
    lockedTeams.push(team.id);
    idx += teamSize;
  }

  return { lockedTeams };
}


