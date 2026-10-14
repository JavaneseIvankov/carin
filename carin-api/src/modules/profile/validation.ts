import { calculateCalendarAge } from '../../domain/age.js';
import type { components } from '../../contracts/generated/app-api.js';

export type ProfileFields = components['schemas']['Profile']['fields'];
export type ProfileCapabilityCondition = {
  id: string;
  personalizationSupported: boolean;
  requiredProfileFields: string[];
  supportedAgeMinimum: number | null;
  supportedAgeMaximum: number | null;
};
/** The provider returns this view only for a published imported manifest; null means unavailable. */
export type ProfileCapabilityManifest = {
  conditions: ProfileCapabilityCondition[];
};
export type ProfileCapabilityProvider = {
  /** Return null when no published/imported manifest is available. */
  getManifest(): ProfileCapabilityManifest | null | Promise<ProfileCapabilityManifest | null>;
};

export class ProfileValidationError extends Error {
  constructor() {
    super('Profile fields are invalid');
    this.name = 'ProfileValidationError';
  }
}

export const emptyCapabilityProvider: ProfileCapabilityProvider = {
  getManifest: () => null,
};

function hasValidKnowledgeState(
  state: string,
  entries: unknown,
  acceptedStates: readonly string[],
): boolean {
  if (!acceptedStates.includes(state) || !Array.isArray(entries)) return false;
  return (state === 'reported') === (entries.length > 0);
}

/** Validate domain invariants that cannot be expressed by the wire schema. */
export function validateProfileFields(fields: ProfileFields): void {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields))
    throw new ProfileValidationError();

  for (const measurement of [fields.heightCm, fields.weightKg]) {
    if (
      measurement !== null &&
      (typeof measurement !== 'number' || !Number.isFinite(measurement) || measurement <= 0)
    ) {
      throw new ProfileValidationError();
    }
  }

  if (
    !fields.diagnoses ||
    !hasValidKnowledgeState(fields.diagnoses.state, fields.diagnoses.entries, [
      'not_provided', 'none_known', 'never_examined', 'reported',
    ]) ||
    !fields.familyHistory ||
    !hasValidKnowledgeState(fields.familyHistory.state, fields.familyHistory.entries, [
      'not_provided', 'unknown', 'none_known', 'reported',
    ]) ||
    !fields.allergies ||
    !hasValidKnowledgeState(fields.allergies.state, fields.allergies.entries, [
      'not_provided', 'unknown', 'none_known', 'reported',
    ])
  ) {
    throw new ProfileValidationError();
  }
}

function localCalendarDate(now: Date, timezone: string): string | null {
  if (!Number.isFinite(now.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function isProfileFieldMissing(fields: ProfileFields, path: string): boolean {
  let value: unknown = fields;
  for (const segment of path.split('.')) {
    if (!segment || !value || typeof value !== 'object' || Array.isArray(value)) return true;
    value = (value as Record<string, unknown>)[segment];
  }

  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    const knowledge = value as { state?: unknown; entries?: unknown };
    if (typeof knowledge.state === 'string') {
      if (knowledge.state === 'not_provided' || knowledge.state === 'unknown') return true;
      if (knowledge.state === 'reported')
        return !Array.isArray(knowledge.entries) || knowledge.entries.length === 0;
      // Explicit states such as none_known and never_examined are meaningful
      // answers even though their entry lists are correctly empty.
      return false;
    }
    return Object.keys(value).length === 0;
  }
  return false;
}

function supportedAge(
  birthDate: string | null,
  timezone: string,
  now: Date,
): number | null {
  if (!birthDate) return null;
  const date = localCalendarDate(now, timezone);
  if (!date) return null;
  try {
    return calculateCalendarAge(birthDate, date);
  } catch {
    return null;
  }
}

/**
 * Compute only the capability information that can be proven by the imported
 * manifest. User labels and free-text entries remain untouched and unsupported.
 */
export function calculateProfilePersonalization(
  fields: ProfileFields,
  input: {
    birthDate: string | null;
    timezone: string;
    manifest: ProfileCapabilityManifest | null;
    now?: Date;
  },
): components['schemas']['Profile']['personalization'] {
  const manifest = input.manifest;
  const age = manifest ? supportedAge(input.birthDate, input.timezone, input.now ?? new Date()) : null;
  const missingFields = new Set<string>();
  const unsupportedConditions: string[] = [];

  for (const entry of fields.diagnoses.entries) {
    const condition = entry.conditionId
      ? manifest?.conditions.find(({ id }) => id === entry.conditionId)
      : undefined;
    const ageSupported =
      age !== null &&
      (condition?.supportedAgeMinimum === null ||
        (condition?.supportedAgeMinimum !== undefined && age >= condition.supportedAgeMinimum)) &&
      (condition?.supportedAgeMaximum === null ||
        (condition?.supportedAgeMaximum !== undefined && age <= condition.supportedAgeMaximum));

    if (!condition?.personalizationSupported || !ageSupported) {
      if (!unsupportedConditions.includes(entry.label)) unsupportedConditions.push(entry.label);
      continue;
    }

    for (const field of condition.requiredProfileFields) {
      if (isProfileFieldMissing(fields, field)) missingFields.add(field);
    }
  }

  return {
    missingFields: [...missingFields].sort(),
    unsupportedConditions,
  };
}
