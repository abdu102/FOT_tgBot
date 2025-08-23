import { Scenes, Markup } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { buildMainKeyboard } from '../keyboards/main';
import { generateTeamInvite, buildInviteDeepLink } from '../services/invite';

type MemberDraft = { name: string; phone?: string; age?: number; username?: string };

export function teamCreateScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'team:create',
    async (ctx) => {
      (ctx.wizard.state as any).members = [] as MemberDraft[];
      await ctx.reply('👥 Jamoa nomi? / Название команды?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      (ctx.wizard.state as any).teamName = (ctx.message as any)?.text?.trim();
      const userId = (ctx.state as any).userId as string;
      const name = (ctx.wizard.state as any).teamName as string;
      let team = await prisma.team.findFirst({ where: { captainId: userId } });
      if (team) team = await prisma.team.update({ where: { id: team.id }, data: { name } });
      else team = await prisma.team.create({ data: { name, captainId: userId } });
      // Ensure captain is a member
      await prisma.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId } }, update: {}, create: { teamId: team.id, userId, role: 'captain' } });
      const { token, expires } = await generateTeamInvite(prisma, team.id);
      const url = buildInviteDeepLink(token);
      await ctx.reply('✅ Team created.', Markup.removeKeyboard());
      await ctx.reply(`Share this invite link with your players:\n${url}\nExpires: ${expires.toISOString().slice(0,16).replace('T',' ')}`);
      await ctx.reply('You can always regenerate the link from 👥 Team → 🔗 Invite link.');
      await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx));
      return ctx.scene.leave();
    }
  );

  // invite-only flow; no manual add in this scene
  scene.action('team_back_menu', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('📋 Asosiy menyu', buildMainKeyboard(ctx)); return ctx.scene.leave(); });

  return scene;
}


