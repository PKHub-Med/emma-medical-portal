import { BadRequestException } from '@nestjs/common';

export const APP_TIMEZONE = process.env.APP_TIMEZONE?.trim() || 'Europe/Warsaw';

export function inspectionDayBoundaries(
  now = new Date(),
  timeZone = APP_TIMEZONE,
) {
  assertTimeZone(timeZone);
  const local = localParts(now, timeZone);
  const today = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const day31 = new Date(today);
  day31.setUTCDate(day31.getUTCDate() + 31);
  return {
    startToday: localMidnightUtc(today, timeZone),
    startDay31: localMidnightUtc(day31, timeZone),
  };
}

export function calendarDaysBetween(
  from: Date,
  to: Date,
  timeZone = APP_TIMEZONE,
) {
  assertTimeZone(timeZone);
  const fromLocal = localParts(from, timeZone);
  const toLocal = localParts(to, timeZone);
  const fromDay = Date.UTC(fromLocal.year, fromLocal.month - 1, fromLocal.day);
  const toDay = Date.UTC(toLocal.year, toLocal.month - 1, toLocal.day);
  return Math.round((toDay - fromDay) / 86_400_000);
}

export function portalDateBoundary(
  value: string | undefined,
  field: string,
  endExclusive: boolean,
  timeZone = APP_TIMEZONE,
) {
  if (!value?.trim()) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) invalidDate(field);
    return parsed;
  }
  const calendar = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (
    calendar.getUTCFullYear() !== +match[1] ||
    calendar.getUTCMonth() !== +match[2] - 1 ||
    calendar.getUTCDate() !== +match[3]
  ) invalidDate(field);
  if (endExclusive) calendar.setUTCDate(calendar.getUTCDate() + 1);
  return localMidnightUtc(calendar, timeZone);
}

function localMidnightUtc(calendar: Date, timeZone: string) {
  const desired = Date.UTC(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth(),
    calendar.getUTCDate(),
  );
  let timestamp = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = localParts(new Date(timestamp), timeZone);
    const represented = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour);
    timestamp += desired - represented;
  }
  return new Date(timestamp);
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
  };
}

function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('pl-PL', { timeZone }).format();
  } catch {
    throw new Error(`Nieprawidłowa strefa APP_TIMEZONE: ${timeZone}.`);
  }
}

function invalidDate(field: string): never {
  throw new BadRequestException(`Parametr ${field} ma nieprawidłową wartość.`);
}
