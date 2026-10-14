export type DashboardWindow = {
  timezone: string;
  startDate: string;
  endDate: string;
  startInclusiveUtc: string;
  endExclusiveUtc: string;
  dates: string[];
};

function localDateAt(instant: Date, timeZone: string): string {
  let formatter = localDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    localDateFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value('year').padStart(4, '0')}-${value('month')}-${value('day')}`;
}

const localDateFormatters = new Map<string, Intl.DateTimeFormat>();
const localDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const localDayBoundaryCache = new Map<string, string>();

function utcTimestamp(year: number, monthIndex: number, day: number, hour = 0, minute = 0, second = 0): number {
  const result = new Date(0);
  result.setUTCFullYear(year, monthIndex, day);
  result.setUTCHours(hour, minute, second, 0);
  return result.getTime();
}

function localWallTimeAsUtc(instant: Date, timeZone: string): number {
  let formatter = localDateTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    localDateTimeFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return utcTimestamp(
    Number(value('year')),
    Number(value('month')) - 1,
    Number(value('day')),
    Number(value('hour')),
    Number(value('minute')),
    Number(value('second')),
  );
}

function addDays(date: string, count: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(utcTimestamp(year!, month! - 1, day! + count));
  return `${result.getUTCFullYear().toString().padStart(4, '0')}-${(result.getUTCMonth() + 1)
    .toString().padStart(2, '0')}-${result.getUTCDate().toString().padStart(2, '0')}`;
}

function firstInstantOnLocalDate(date: string, timeZone: string): Date | null {
  const [year, month, day] = date.split('-').map(Number);
  const target = utcTimestamp(year!, month! - 1, day!);
  const hourMs = 60 * 60 * 1000;
  const offsets = new Set<number>();

  // Sample both sides of the civil midnight in case a rollback makes the
  // local-date predicate non-monotonic around the boundary.
  for (let offsetFromTarget = -24 * hourMs; offsetFromTarget <= 24 * hourMs; offsetFromTarget += hourMs) {
    const sample = new Date(target + offsetFromTarget);
    offsets.add(localWallTimeAsUtc(sample, timeZone) - sample.getTime());
  }

  const candidates = [...offsets]
    .map((offset) => new Date(target - offset))
    .filter((candidate) => localDateAt(candidate, timeZone) === date)
    .sort((left, right) => left.getTime() - right.getTime());
  return candidates[0] ?? null;
}

function firstInstantOnOrAfterLocalDate(date: string, timeZone: string): Date {
  const cacheKey = `${timeZone}\u0000${date}`;
  const cached = localDayBoundaryCache.get(cacheKey);
  if (cached) return new Date(cached);

  let candidateDate = date;
  // A civil date can be skipped by a timezone offset change. Resolve that
  // request to the next local date that actually exists.
  for (let daysAhead = 0; daysAhead <= 370; daysAhead += 1) {
    const candidate = firstInstantOnLocalDate(candidateDate, timeZone);
    if (candidate) {
      if (localDayBoundaryCache.size >= 512) {
        const oldestKey = localDayBoundaryCache.keys().next().value;
        if (oldestKey !== undefined) localDayBoundaryCache.delete(oldestKey);
      }
      localDayBoundaryCache.set(cacheKey, candidate.toISOString());
      return candidate;
    }
    candidateDate = addDays(candidateDate, 1);
  }
  throw new RangeError('No local date boundary found');
}

function assertCalendarDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new RangeError('Invalid dashboard calendar date');
  }
}

export function getCalendarDayWindow(date: string, timeZone: string): { startAt: string; endAt: string } {
  assertCalendarDate(date);
  new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(`${date}T12:00:00.000Z`));
  return {
    startAt: firstInstantOnOrAfterLocalDate(date, timeZone).toISOString(),
    endAt: firstInstantOnOrAfterLocalDate(addDays(date, 1), timeZone).toISOString(),
  };
}

export function getDashboardWindow(now: Date, timeZone: string): DashboardWindow {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid current instant');
  // Force timezone validation even for zones whose formatter might otherwise be skipped.
  new Intl.DateTimeFormat('en-US', { timeZone }).format(now);
  return getDashboardWindowForDate(localDateAt(now, timeZone), timeZone);
}

export function getDashboardWindowForDate(endDate: string, timeZone: string): DashboardWindow {
  assertCalendarDate(endDate);
  new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(`${endDate}T12:00:00.000Z`));
  const startDate = addDays(endDate, -6);
  const endExclusiveDate = addDays(endDate, 1);
  return {
    timezone: timeZone,
    startDate,
    endDate,
    startInclusiveUtc: firstInstantOnOrAfterLocalDate(startDate, timeZone).toISOString(),
    endExclusiveUtc: firstInstantOnOrAfterLocalDate(endExclusiveDate, timeZone).toISOString(),
    dates: Array.from({ length: 7 }, (_, index) => addDays(startDate, index)),
  };
}
