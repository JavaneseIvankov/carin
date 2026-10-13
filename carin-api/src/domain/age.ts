const SIGNUP_TIMEZONE = 'Asia/Jakarta';

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('Expected an ISO date in YYYY-MM-DD format');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError('Invalid calendar date');
  }
  return { year, month, day };
}

export function calculateCalendarAge(dateOfBirth: string, asOfDate: string): number {
  const birth = parseIsoDate(dateOfBirth);
  const current = parseIsoDate(asOfDate);
  if (dateOfBirth > asOfDate) throw new RangeError('Date of birth cannot be in the future');

  const hasHadBirthday =
    current.month > birth.month ||
    (current.month === birth.month && current.day >= birth.day) ||
    (birth.month === 2 && birth.day === 29 && current.month === 3 && current.day === 1);
  return current.year - birth.year - (hasHadBirthday ? 0 : 1);
}

export function isSignupAgeEligible(dateOfBirth: string, registeredAt: Date): boolean {
  if (!Number.isFinite(registeredAt.getTime())) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SIGNUP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(registeredAt);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
    const asOfDate = `${part('year')}-${part('month')}-${part('day')}`;
    const age = calculateCalendarAge(dateOfBirth, asOfDate);
    return age >= 18 && age <= 50;
  } catch {
    return false;
  }
}
