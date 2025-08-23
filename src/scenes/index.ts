import { Scenes, Telegraf } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import { onboardingIndividualScene } from './onboardingIndividual';
import { onboardingTeamScene } from './onboardingTeam';
import { createMatchScene } from './matchCreate';
import { statsEntryScene } from './statsEntry';
import { loginScene } from './login';
import { teamCreateScene } from './teamCreate';

export function registerScenes(bot: Telegraf<Scenes.WizardContext>, prisma: PrismaClient) {
  const stage = new Scenes.Stage<Scenes.WizardContext>([
    onboardingIndividualScene(prisma),
    onboardingTeamScene(prisma),
    createMatchScene(prisma),
    statsEntryScene(prisma),
    loginScene(prisma),
    teamCreateScene(prisma),
  ]);
  bot.use(stage.middleware());
}


