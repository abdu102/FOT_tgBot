import type { PrismaClient } from '@prisma/client';

export async function generateTeamInvite(prisma: PrismaClient, teamId: string) {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const team = await prisma.team.update({ where: { id: teamId }, data: { inviteToken: token, inviteExpiresAt: expires } });
  return { token, expires, team };
}

export async function tryJoinByInvite(prisma: PrismaClient, token: string, userId: string) {
  const team = await prisma.team.findFirst({ where: { inviteToken: token, inviteExpiresAt: { gt: new Date() } } });
  if (!team) return null;
  await prisma.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId } }, update: {}, create: { teamId: team.id, userId, role: 'player' } });
  return team;
}

export function buildInviteDeepLink(token: string): string {
  const username = (process.env.BOT_USERNAME || 'FOT_Tashkent_Bot').replace(/^@/, '');
  if (username) {
    return `https://t.me/${username}?start=join_${token}`;
  }
  // Fallback to tg:// scheme if username is missing but Telegram can still resolve
  return `tg://resolve?domain=${username}&start=join_${token}`;
}


