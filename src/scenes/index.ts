import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { onboardingIndividualScene } from './onboardingIndividual';
import { onboardingTeamScene } from './onboardingTeam';
import { createMatchScene } from './matchCreate';
import { statsEntryScene } from './statsEntry';
import { winnersScene } from './winners';
import { sessionsScene } from './sessions';
import { sessionViewScene } from './sessionView';
import { matchAddScene } from './sessionMatchAdd';
import { matchStatsScene } from './sessionMatchStats';
import { loginScene } from './login';
import { teamCreateScene } from './teamCreate';

export function registerScenes(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  const stage = new Scenes.Stage<Scenes.WizardContext>([
    onboardingIndividualScene(prisma),
    onboardingTeamScene(prisma),
    createMatchScene(prisma),
    statsEntryScene(prisma),
    winnersScene(prisma),
    sessionsScene(prisma),
    sessionViewScene(prisma),
    matchAddScene(prisma),
    matchStatsScene(prisma),
    loginScene(prisma),
    teamCreateScene(prisma),
  ]);
  bot.use(stage.middleware());
}


