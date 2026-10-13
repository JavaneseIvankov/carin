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

function firstInstantOnOrAfterLocalDate(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  const dayMs = 24 * 60 * 60 * 1000;
  let before = target - dayMs;
  let after = target + dayMs;

  // Bracket the local-date boundary. Expanding the bracket avoids assumptions
  // about offset size or a fixed number of DST corrections.
  while (localDateAt(new Date(before), timeZone) >= date) before -= dayMs;
  while (localDateAt(new Date(after), timeZone) < date) after += dayMs;

  // Find the first millisecond whose local date is the requested date or later.
  // If a civil date was skipped entirely, this resolves to the next valid date.
  while (after - before > 1) {
    const middle = before + Math.floor((after - before) / 2);
    if (localDateAt(new Date(middle), timeZone) < date) before = middle;
    else after = middle;
  }
  return new Date(after);
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
    startInclusiveUtc: firstInstantOnOrAfterLocalDate(startDate, timeZone).toISOString(),
    endExclusiveUtc: firstInstantOnOrAfterLocalDate(endExclusiveDate, timeZone).toISOString(),
    dates: Array.from({ length: 7 }, (_, index) => addDays(startDate, index)),
  };
}
