const { PrismaClient } = require('@prisma/client');

async function main() {
  // First set a local DATABASE_URL for testing
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/fot_bot';
  
  const prisma = new PrismaClient();
  
  try {
    // Create a test session for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0); // 6 PM
    
    const endTime = new Date(tomorrow);
    endTime.setHours(20, 0, 0, 0); // 8 PM
    
    console.log('Creating test session...');
    const session = await prisma.session.create({
      data: {
        startAt: tomorrow,
        endAt: endTime,
        type: 'FIVE_V_FIVE',
        status: 'PLANNED',
        maxTeams: 4,
        stadium: 'Test Stadium',
        place: 'Test Place'
      }
    });
    
    console.log('Test session created:');
    console.log('ID:', session.id);
    console.log('Start:', session.startAt);
    console.log('End:', session.endAt);
    console.log('Status:', session.status);
    
    // Now check all sessions
    console.log('\n=== All sessions ===');
    const allSessions = await prisma.session.findMany({
      orderBy: { startAt: 'asc' }
    });
    
    allSessions.forEach((s, i) => {
      console.log(`${i + 1}. ${s.id} - ${s.startAt} - ${s.status}`);
    });
    
  } catch (error) {
    if (error.code === 'P1001') {
      console.log('Database connection failed. The app might be using a remote database.');
      console.log('This is expected for Railway deployment.');
      console.log('');
      console.log('Please test the bot directly to see the debug logs in the Railway logs.');
    } else {
      console.error('Error:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
