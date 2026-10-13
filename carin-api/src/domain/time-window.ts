export type DashboardWindow = {
  timezone: string;
  startDate: string;
  endDate: string;
  startInclusiveUtc: string;
  endExclusiveUtc: string;
  dates: string[];
};

function localDateAt(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(date: string, count: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year!, month! - 1, day! + count));
  return `${result.getUTCFullYear().toString().padStart(4, '0')}-${(result.getUTCMonth() + 1)
    .toString().padStart(2, '0')}-${result.getUTCDate().toString().padStart(2, '0')}`;
}

function localMidnightAsUtc(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  let candidate = target;

  // Iterate because the UTC offset can differ on either side of a DST change.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(candidate));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)!.value);
    const localAsUtc = Date.UTC(
      part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'),
    );
    const adjustment = target - localAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate);
}

export function getDashboardWindow(now: Date, timeZone: string): DashboardWindow {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid current instant');
  // Force timezone validation even for zones whose formatter might otherwise be skipped.
  new Intl.DateTimeFormat('en-US', { timeZone }).format(now);

  const endDate = localDateAt(now, timeZone);
  const startDate = addDays(endDate, -6);
  const endExclusiveDate = addDays(endDate, 1);
  return {
    timezone: timeZone,
    startDate,
    endDate,
    startInclusiveUtc: localMidnightAsUtc(startDate, timeZone).toISOString(),
    endExclusiveUtc: localMidnightAsUtc(endExclusiveDate, timeZone).toISOString(),
    dates: Array.from({ length: 7 }, (_, index) => addDays(startDate, index)),
  };
}
