import { Scenes } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { addMatchStat } from '../services/stats';

export function matchStatsScene(prisma: PrismaClient) {
  const scene = new Scenes.WizardScene<Scenes.WizardContext>(
    'admin:sessionMatchStats',
    // Step 1: Show teams in session
    async (ctx) => {
      console.log('DEBUG: sessionMatchStats scene step 1 entered');
      
      if (!(ctx.state as any).isAdmin) { 
        console.log('DEBUG: User is not admin');
        // @ts-ignore
        await ctx.reply(ctx.i18n.t('admin.only_admin')); 
        return ctx.scene.leave(); 
      }
      
      // Get sessionId from scene entry parameters - the second parameter to ctx.scene.enter becomes ctx.scene.state
      // Avoid logging full ctx.scene to prevent circular structure errors
      const sessionId = (ctx.scene.state as any)?.sessionId;
      console.log('DEBUG: Extracted sessionId:', sessionId);
      
      if (!sessionId) { 
        console.error('DEBUG: No sessionId found in scene params');
        // @ts-ignore
        await ctx.reply(ctx.i18n.t('admin.session_not_found')); 
        return ctx.scene.leave(); 
      }
      
      console.log('DEBUG: Stats entry scene working with sessionId:', sessionId);
      
      // Get teams in the session
      const sessionTeams = await (prisma as any).sessionTeam.findMany({
        where: { sessionId },
        include: {
          team: {
            include: {
              members: {
                include: { user: true }
              }
            }
          }
        }
      });
      
      if (!sessionTeams.length) { 
        await ctx.reply('Bu sessiyada jamoalar yo\'q'); 
        return ctx.scene.leave(); 
      }
      
      const teamButtons = sessionTeams.map((st: any) => [{
        text: `${st.team.name} (${st.team.members.length} o\'yinchi)`,
        callback_data: `stats_team_${st.team.id}`
      }]);
      
      teamButtons.push([{ text: '⬅️ Orqaga', callback_data: 'back_to_session' }]);
      
      await ctx.reply('Jamoa tanlang:', { 
        reply_markup: { inline_keyboard: teamButtons } 
      } as any);
      
      (ctx.wizard.state as any).sessionId = sessionId;
      return ctx.wizard.next();
    },
    // Step 2: Show players in selected team
    async (ctx) => { return; },
    // Step 3: Show goal/assist options for selected player  
    async (ctx) => { return; }
  );

  // Handler for team selection
  (scene as any).action(/stats_team_(.*)/, async (ctx: any) => {
    const teamId = (ctx.match as any)[1];
    await ctx.answerCbQuery();
    
    // Get team members
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: { user: true }
        }
      }
    });
    
    if (!team || !team.members.length) {
      await ctx.reply('Bu jamoada o\'yinchilar yo\'q');
      return;
    }
    
    const playerButtons = team.members.map((member: any) => [{
      text: `${member.user.firstName} ${member.user.lastName || ''}`.trim(),
      callback_data: `stats_player_${member.user.id}`
    }]);
    
    playerButtons.push([{ text: '⬅️ Jamoalar', callback_data: 'back_to_teams' }]);
    
    await ctx.editMessageText(`${team.name} - O'yinchi tanlang:`, { 
      reply_markup: { inline_keyboard: playerButtons } 
    } as any);
    
    (ctx.wizard.state as any).selectedTeamId = teamId;
    (ctx.wizard.state as any).selectedTeamName = team.name;
  });

  // Handler for player selection
  (scene as any).action(/stats_player_(.*)/, async (ctx: any) => {
    const userId = (ctx.match as any)[1];
    await ctx.answerCbQuery();
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      await ctx.reply('O\'yinchi topilmadi');
      return;
    }
    
    const actionButtons = [
      [
        { text: '⚽ Gol qo\'shish', callback_data: `stats_goal_${userId}` },
        { text: '🅰️ Assist qo\'shish', callback_data: `stats_assist_${userId}` }
      ],
      [{ text: '⬅️ O\'yinchilar', callback_data: `back_to_players_${(ctx.wizard.state as any).selectedTeamId}` }]
    ];
    
    await ctx.editMessageText(`${user.firstName} ${user.lastName || ''}`.trim() + ' - Harakat tanlang:', { 
      reply_markup: { inline_keyboard: actionButtons } 
    } as any);
    
    (ctx.wizard.state as any).selectedUserId = userId;
    (ctx.wizard.state as any).selectedUserName = `${user.firstName} ${user.lastName || ''}`.trim();
  });

  // Handler for adding goal
  (scene as any).action(/stats_goal_(.*)/, async (ctx: any) => {
    const userId = (ctx.match as any)[1];
    await ctx.answerCbQuery();
    
    // Find an active match to add stats to (simplified - you may want to let admin select match)
    const sessionId = (ctx.wizard.state as any).sessionId;
    const matches = await prisma.match.findMany({ 
      where: { sessionId } as any,
      include: { homeTeam: true, awayTeam: true }
    });
    
    if (!matches.length) {
      await ctx.reply('Bu sessiyada matchlar yo\'q');
      return;
    }
    
    // For now, use the first match (you may want to let admin select)
    const match = matches[0] as any;
    
    try {
      await addMatchStat(prisma, {
        matchId: match.id,
        userId,
        goals: 1,
        assists: 0,
        won: false // This will be updated when match result is set
      });
      
      const userName = (ctx.wizard.state as any).selectedUserName;
      await ctx.reply(`✅ ${userName}ga gol qo\'shildi!`);
    } catch (error) {
      console.error('Error adding goal:', error);
      await ctx.reply('❌ Gol qo\'shishda xatolik');
    }
  });

  // Handler for adding assist
  (scene as any).action(/stats_assist_(.*)/, async (ctx: any) => {
    const userId = (ctx.match as any)[1];
    await ctx.answerCbQuery();
    
    // Find an active match to add stats to
    const sessionId = (ctx.wizard.state as any).sessionId;
    const matches = await prisma.match.findMany({ 
      where: { sessionId } as any,
      include: { homeTeam: true, awayTeam: true }
    });
    
    if (!matches.length) {
      await ctx.reply('Bu sessiyada matchlar yo\'q');
      return;
    }
    
    const match = matches[0] as any;
    
    try {
      await addMatchStat(prisma, {
        matchId: match.id,
        userId,
        goals: 0,
        assists: 1,
        won: false
      });
      
      const userName = (ctx.wizard.state as any).selectedUserName;
      await ctx.reply(`✅ ${userName}ga assist qo\'shildi!`);
    } catch (error) {
      console.error('Error adding assist:', error);
      await ctx.reply('❌ Assist qo\'shishda xatolik');
    }
  });

  // Navigation handlers
  (scene as any).action('back_to_teams', async (ctx: any) => {
    await ctx.answerCbQuery();
    // Go back to step 1 - show teams
    const sessionId = (ctx.wizard.state as any).sessionId;
    const sessionTeams = await (prisma as any).sessionTeam.findMany({
      where: { sessionId },
      include: {
        team: {
          include: {
            members: {
              include: { user: true }
            }
          }
        }
      }
    });
    
    const teamButtons = sessionTeams.map((st: any) => [{
      text: `${st.team.name} (${st.team.members.length} o'yinchi)`,
      callback_data: `stats_team_${st.team.id}`
    }]);
    
    teamButtons.push([{ text: '⬅️ Orqaga', callback_data: 'back_to_session' }]);
    
    await ctx.editMessageText('Jamoa tanlang:', { 
      reply_markup: { inline_keyboard: teamButtons } 
    } as any);
  });

  (scene as any).action(/back_to_players_(.*)/, async (ctx: any) => {
    const teamId = (ctx.match as any)[1];
    await ctx.answerCbQuery();
    
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: { user: true }
        }
      }
    });
    
    if (!team) return;
    
    const playerButtons = team.members.map((member: any) => [{
      text: `${member.user.firstName} ${member.user.lastName || ''}`.trim(),
      callback_data: `stats_player_${member.user.id}`
    }]);
    
    playerButtons.push([{ text: '⬅️ Jamoalar', callback_data: 'back_to_teams' }]);
    
    await ctx.editMessageText(`${team.name} - O'yinchi tanlang:`, { 
      reply_markup: { inline_keyboard: playerButtons } 
    } as any);
  });

  (scene as any).action('back_to_session', async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    // This will return to the session view
  });

  // Remove the old handlers that are no longer needed
  // (scene as any).action?.(/mstat_(.*)/, ...) - REMOVED
  // (scene as any).on?.('text', ...) - REMOVED
  (scene as any).action?.(/mom_(.*)/, async (ctx: any) => {
    const mid = (ctx.match as any)[1];
    const m = await prisma.match.findUnique({ where: { id: mid } });
    if (!m) return;
    const rows = [] as any[];
    if ((m as any).homeTeamId) rows.push([{ text: 'Home team', callback_data: `mom_team_${mid}_${(m as any).homeTeamId}` }]);
    if ((m as any).awayTeamId) rows.push([{ text: 'Away team', callback_data: `mom_team_${mid}_${(m as any).awayTeamId}` }]);
    await ctx.reply('Jamoani tanlang', { reply_markup: { inline_keyboard: rows } } as any);
  });

  (scene as any).action?.(/mom_team_(.*)_(.*)/, async (ctx: any) => {
    const mid = (ctx.match as any)[1];
    const teamId = (ctx.match as any)[2];
    const members = await prisma.teamMember.findMany({ where: { teamId }, include: { user: true } });
    const rows = members.map((tm: any) => [{ text: tm.user.firstName, callback_data: `mom_pick_${mid}_${tm.userId}` }]);
    await ctx.reply('O‘yinchini tanlang', { reply_markup: { inline_keyboard: rows } } as any);
  });

  (scene as any).action?.(/mom_pick_(.*)_(.*)/, async (ctx: any) => {
    const mid = (ctx.match as any)[1];
    const userId = (ctx.match as any)[2];
    await prisma.match.update({ where: { id: mid }, data: { manOfTheMatchUserId: userId } as any });
    await ctx.answerCbQuery('MoM belgilandi');
  });

  return scene;
}


