import type { components } from '../../contracts/generated/ai-service.js';
import { calculateCalendarAge } from '../../domain/age.js';

type ProfileContext = components['schemas']['ProfileContext'];

export type ProfileSnapshotSource = {
  version: number;
  heightCm: string | null;
  weightKg: string | null;
  sexForReference: string | null;
  diagnosisState: string;
  conditions: unknown;
  allergyState: string;
  allergies: unknown;
  activity: string | null;
  smoking: string | null;
};

type ProfileOwner = { birthDate: string; timezone: string };

function ageOnAccountDate(birthDate: string, timezone: string, now: Date): number {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Snapshot time is invalid');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new RangeError('Account-local date could not be computed');
  return calculateCalendarAge(birthDate, `${year}-${month}-${day}`);
}

function measurement(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new RangeError('Stored profile measurement is invalid');
  return parsed;
}

function entries(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    : [];
}

function isDiagnosisState(value: string): value is ProfileContext['diagnosisState'] {
  return ['not_provided', 'none_known', 'never_examined', 'reported'].includes(value);
}

function isAllergyState(value: string): value is ProfileContext['allergyState'] {
  return ['not_provided', 'unknown', 'none_known', 'reported'].includes(value);
}

function nullableEnum<T extends string>(value: string | null, choices: readonly T[]): T | null {
  return value !== null && choices.includes(value as T) ? value as T : null;
}

export function buildProfileContext(
  owner: ProfileOwner,
  profile: ProfileSnapshotSource | null,
  now: Date,
): ProfileContext {
  const conditions = entries(profile?.conditions);
  const conditionIds = [...new Set(conditions.flatMap((entry) =>
    typeof entry.conditionId === 'string' && entry.conditionId.trim() ? [entry.conditionId] : [],
  ))];
  const unsupportedConditionLabels = conditions.flatMap((entry) =>
    entry.conditionId == null && typeof entry.label === 'string' && entry.label.trim() ? [entry.label] : [],
  );
  const allergies = Array.isArray(profile?.allergies)
    ? profile.allergies.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  return {
    profileVersion: profile?.version ?? 0,
    ageYears: ageOnAccountDate(owner.birthDate, owner.timezone, now),
    heightCm: measurement(profile?.heightCm ?? null),
    weightKg: measurement(profile?.weightKg ?? null),
    sexForReference: nullableEnum(profile?.sexForReference ?? null, ['female', 'male']),
    diagnosisState: profile && isDiagnosisState(profile.diagnosisState) ? profile.diagnosisState : 'not_provided',
    conditionIds,
    unsupportedConditionLabels,
    allergyState: profile && isAllergyState(profile.allergyState) ? profile.allergyState : 'not_provided',
    allergies,
    activity: nullableEnum(profile?.activity ?? null, ['sedentary', 'light', 'moderate', 'high']),
    smoking: nullableEnum(profile?.smoking ?? null, ['never', 'former', 'current']),
  };
}
