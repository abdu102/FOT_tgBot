import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Create an upcoming match as sample
  const exists = await prisma.match.findFirst();
  if (!exists) {
    await prisma.match.create({
      data: {
        dateTime: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        location: 'Sport Arena, Tashkent',
        pricePerUser: 40000,
        capacityPerTeam: 7,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


