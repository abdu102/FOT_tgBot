import type { PrismaClient } from '@prisma/client';

export async function createPaymentForRegistration(prisma: PrismaClient, regId: string, userId?: string, teamId?: string) {
  const reg = await prisma.registration.findUnique({ where: { id: regId }, include: { match: true, team: { include: { members: true } } } });
  if (!reg) return null;
  const count = reg.type === 'TEAM' && reg.team ? reg.team.members.length : 1;
  const amount = (reg.match?.pricePerUser || 40000) * count;
  const payment = await prisma.payment.create({
    data: {
      registrationId: regId,
      amount,
      method: process.env.PAYMENT_METHOD || 'MANUAL',
      status: 'PENDING',
      userId,
      teamId,
    },
  });
  return payment;
}

export function paymentInstructions(): string {
  const org = process.env.ORGANIZER_NAME || 'Organizer';
  const req = process.env.ORGANIZER_REQUISITES || 'Requisites';
  return `💳 To‘lov / Оплата\nTashkilotchi: ${org}\n${req}\n\nTo‘lovdan so‘ng chekni yuboring va admin tasdiqlaydi.`;
}

export async function createPaymentForSessionRegistration(prisma: any, regId: string, userId?: string, teamId?: string) {
  const reg = await prisma.sessionRegistration.findUnique({ where: { id: regId }, include: { session: true, team: { include: { members: true } } } });
  if (!reg) return null;
  // For sessions, per-user price comes from matches or default. Use 40000 per participant.
  const type = reg.type as 'INDIVIDUAL' | 'TEAM';
  const count = type === 'TEAM' && reg.team ? reg.team.members.length : 1;
  const amount = 40000 * count;
  const payment = await prisma.payment.create({
    data: {
      sessionRegistrationId: regId,
      amount,
      method: process.env.PAYMENT_METHOD || 'MANUAL',
      status: 'PENDING',
      userId,
      teamId,
    },
  });
  return payment;
}


