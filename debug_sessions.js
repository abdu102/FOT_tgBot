const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('=== Checking all sessions in database ===');
    const allSessions = await prisma.session.findMany({
      orderBy: { startAt: 'asc' },
      include: {
        teams: {
          include: {
            team: {
              include: { members: true }
            }
          }
        }
      }
    });
    
    console.log(`Found ${allSessions.length} total sessions`);
    
    allSessions.forEach((session, i) => {
      console.log(`\nSession ${i + 1}:`);
      console.log(`  ID: ${session.id}`);
      console.log(`  Start: ${session.startAt}`);
      console.log(`  End: ${session.endAt}`);
      console.log(`  Status: ${session.status}`);
      console.log(`  MaxTeams: ${session.maxTeams}`);
      console.log(`  Stadium: ${session.stadium}`);
      console.log(`  Place: ${session.place}`);
      console.log(`  Type: ${session.type}`);
      console.log(`  Teams: ${session.teams.length}`);
      
      session.teams.forEach((sessionTeam, j) => {
        console.log(`    Team ${j + 1}: ${sessionTeam.team.name} (${sessionTeam.team.members.length} members)`);
      });
    });
    
    console.log('\n=== Checking date ranges ===');
    const now = new Date();
    const twoWeeksLater = new Date(now);
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
    
    const oneWeekLater = new Date(now);
    oneWeekLater.setDate(oneWeekLater.getDate() + 7);
    
    console.log(`Now: ${now.toISOString()}`);
    console.log(`Two weeks later: ${twoWeeksLater.toISOString()}`);
    console.log(`One week later: ${oneWeekLater.toISOString()}`);
    
    const sessionsTwoWeeks = await prisma.session.findMany({
      where: {
        startAt: { gte: now, lte: twoWeeksLater }
      }
    });
    
    const sessionsOneWeek = await prisma.session.findMany({
      where: {
        startAt: { gte: now, lte: oneWeekLater }
      }
    });
    
    const plannedSessionsTwoWeeks = await prisma.session.findMany({
      where: {
        startAt: { gte: now, lte: twoWeeksLater },
        status: 'PLANNED'
      }
    });
    
    const plannedSessionsOneWeek = await prisma.session.findMany({
      where: {
        startAt: { gte: now, lte: oneWeekLater },
        status: 'PLANNED'
      }
    });
    
    console.log(`\nSessions in next 2 weeks: ${sessionsTwoWeeks.length}`);
    console.log(`Sessions in next 1 week: ${sessionsOneWeek.length}`);
    console.log(`PLANNED sessions in next 2 weeks: ${plannedSessionsTwoWeeks.length}`);
    console.log(`PLANNED sessions in next 1 week: ${plannedSessionsOneWeek.length}`);
    
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
