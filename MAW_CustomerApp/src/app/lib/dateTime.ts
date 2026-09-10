const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';

export function parseMalaysiaDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+08:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return new Date(`${value.replace(' ', 'T')}+08:00`);
  }
  return new Date(value);
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: MALAYSIA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(parseMalaysiaDate(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: MALAYSIA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parseMalaysiaDate(value));
}

export function isFutureBooking(date: string | undefined, status: string, now = new Date()): boolean {
  if (!date || !['confirmed', 'pending'].includes(status)) return false;
  return parseMalaysiaDate(date).getTime() > now.getTime();
}

export function getReminderDateState(dueDate: string, now = new Date()) {
  const due = parseMalaysiaDate(dueDate);
  const todayMalaysia = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const today = parseMalaysiaDate(todayMalaysia);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  return {
    status: days < 0 ? 'overdue' as const : 'due_soon' as const,
    days: Math.abs(days),
  };
}

export function getMileageState(currentMileage: number, dueMileage: number) {
  const difference = dueMileage - currentMileage;
  return {
    status: difference < 0 ? 'overdue' as const : 'remaining' as const,
    kilometres: Math.abs(difference),
  };
}
