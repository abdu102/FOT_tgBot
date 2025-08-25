export const UZ_WEEKDAYS = [
  'yakshanba',
  'dushanba',
  'seshanba',
  'chorshanba',
  'payshanba',
  'juma',
  'shanba',
];

function pad2(n: number): string { return String(n).padStart(2, '0'); }

export function uzWeekdayName(date: Date): string {
  return UZ_WEEKDAYS[date.getDay()] || '';
}

export function formatUzTimeRange(start: Date, end: Date): string {
  return `${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
}

export function formatUzDayAndTimeRange(start: Date, end: Date): string {
  const day = uzWeekdayName(start);
  const cap = day ? day[0].toUpperCase() + day.slice(1) : '';
  return `${cap} ${formatUzTimeRange(start, end)}`;
}

export function uzTypeLabel(type: any): string {
  return type === 'SIX_V_SIX' ? '6v6' : '5v5';
}

export function uzPaymentStatus(status?: string | null): string {
  switch (status) {
    case 'CONFIRMED': return 'tasdiqlangan';
    case 'FAILED': return 'xato';
    case 'REFUNDED': return 'qaytarilgan';
    case 'PENDING':
    default:
      return 'kutilmoqda';
  }
}


