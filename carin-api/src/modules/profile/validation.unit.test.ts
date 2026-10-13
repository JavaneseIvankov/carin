import { describe, expect, it } from 'vitest';
import type { components } from '../../contracts/generated/app-api.js';
import {
  calculateProfilePersonalization,
  isProfileFieldMissing,
  validateProfileFields,
  type ProfileCapabilityManifest,
} from './validation.js';

type ProfileFields = components['schemas']['Profile']['fields'];

const emptyFields: ProfileFields = {
  heightCm: null,
  weightKg: null,
  sexForReference: null,
  diagnoses: { state: 'not_provided', entries: [] },
  familyHistory: { state: 'not_provided', entries: [] },
  allergies: { state: 'not_provided', entries: [] },
  clinicianNotes: null,
  activity: null,
  smoking: null,
};

function manifest(
  condition: ProfileCapabilityManifest['conditions'][number],
): ProfileCapabilityManifest {
  return { conditions: [condition] };
}

describe('profile field validation', () => {
  it('requires reported knowledge states to have entries and other states to be empty', () => {
    expect(() => validateProfileFields({
      ...emptyFields,
      diagnoses: { state: 'reported', entries: [] },
    })).toThrow();
    expect(() => validateProfileFields({
      ...emptyFields,
      familyHistory: {
        state: 'unknown',
        entries: [{ conditionId: null, label: 'Reported history', relation: null }],
      },
    })).toThrow();
    expect(() => validateProfileFields({
      ...emptyFields,
      allergies: { state: 'reported', entries: [] },
    })).toThrow();
    expect(() => validateProfileFields(emptyFields)).not.toThrow();
  });

  it('rejects non-finite and non-positive measurements', () => {
    expect(() => validateProfileFields({ ...emptyFields, heightCm: Number.NaN })).toThrow();
    expect(() => validateProfileFields({ ...emptyFields, weightKg: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => validateProfileFields({ ...emptyFields, heightCm: 0 })).toThrow();
    expect(() => validateProfileFields({ ...emptyFields, weightKg: -1 })).toThrow();
    expect(() => validateProfileFields({ ...emptyFields, heightCm: 1e308 })).not.toThrow();
  });
});

describe('profile personalization capability', () => {
  const condition = {
    id: 'condition.manifest-exact-id',
    displayName: 'Manifest display label',
    personalizationSupported: true,
    requiredProfileFields: ['heightCm'],
    supportedAgeMinimum: 26,
    supportedAgeMaximum: 26,
  };

  it('only trusts an exact published condition and reports its missing fields', () => {
    const fields: ProfileFields = {
      ...emptyFields,
      diagnoses: {
        state: 'reported',
        entries: [{
          id: 'a5f34026-d615-4687-9351-4f46c8588269',
          conditionId: condition.id,
          label: 'User label',
        }],
      },
    };

    expect(calculateProfilePersonalization(fields, {
      birthDate: '2000-10-14',
      timezone: 'Asia/Jakarta',
      manifest: manifest(condition),
      now: new Date('2026-10-13T20:00:00.000Z'),
    })).toEqual({
      missingFields: ['heightCm'],
      unsupportedConditions: [],
    });
    expect(fields.diagnoses.entries[0].label).toBe('User label');
  });

  it('does not infer support from a label or when no published capability view is available', () => {
    const fields: ProfileFields = {
      ...emptyFields,
      diagnoses: {
        state: 'reported',
        entries: [
          { id: 'a5f34026-d615-4687-9351-4f46c8588269', conditionId: null, label: 'Free text' },
          { id: '9533a135-0834-4e6d-84a7-7105a2ef5cc1', conditionId: 'condition.manifest-exact-id', label: 'Age gated' },
        ],
      },
    };
    expect(calculateProfilePersonalization(fields, {
      birthDate: '2000-10-14',
      timezone: 'Asia/Jakarta',
      manifest: null,
      now: new Date('2026-10-13T20:00:00.000Z'),
    })).toEqual({
      missingFields: [],
      unsupportedConditions: ['Free text', 'Age gated'],
    });
    expect(calculateProfilePersonalization(fields, {
      birthDate: null,
      timezone: 'Asia/Jakarta',
      manifest: manifest(condition),
      now: new Date('2026-10-13T20:00:00.000Z'),
    }).unsupportedConditions).toEqual(['Free text', 'Age gated']);
  });

  it('counts explicit none-known and never-examined states as answered requirements', () => {
    const fields: ProfileFields = {
      ...emptyFields,
      diagnoses: { state: 'never_examined', entries: [] },
      familyHistory: { state: 'none_known', entries: [] },
      allergies: { state: 'none_known', entries: [] },
    };
    const stateCondition = {
      ...condition,
      requiredProfileFields: ['diagnoses', 'familyHistory', 'allergies'],
    };
    const withCondition: ProfileFields = {
      ...fields,
      diagnoses: {
        state: 'reported',
        entries: [{
          id: 'a5f34026-d615-4687-9351-4f46c8588269',
          conditionId: condition.id,
          label: 'Condition',
        }],
      },
    };

    expect(calculateProfilePersonalization(withCondition, {
      birthDate: '2000-10-14',
      timezone: 'Asia/Jakarta',
      manifest: manifest(stateCondition),
      now: new Date('2026-10-13T20:00:00.000Z'),
    }).missingFields).toEqual([]);
    expect(calculateProfilePersonalization({ ...emptyFields, diagnoses: {
      state: 'reported',
      entries: [{
        id: 'a5f34026-d615-4687-9351-4f46c8588269',
        conditionId: condition.id,
        label: 'Condition',
      }],
    } }, {
      birthDate: '2000-10-14',
      timezone: 'Asia/Jakarta',
      manifest: manifest(stateCondition),
      now: new Date('2026-10-13T20:00:00.000Z'),
    }).missingFields).toEqual(['allergies', 'familyHistory']);
  });

  it('treats explicit diagnosis knowledge states as answers even with empty entries', () => {
    for (const state of ['none_known', 'never_examined'] as const) {
      expect(isProfileFieldMissing({
        ...emptyFields,
        diagnoses: { state, entries: [] },
      }, 'diagnoses')).toBe(false);
    }
    expect(isProfileFieldMissing(emptyFields, 'diagnoses')).toBe(true);
    expect(isProfileFieldMissing({
      ...emptyFields,
      diagnoses: { state: 'reported', entries: [] },
    }, 'diagnoses')).toBe(true);
  });

  it('uses the account timezone date and inclusive age bounds', () => {
    const fields: ProfileFields = {
      ...emptyFields,
      diagnoses: {
        state: 'reported',
        entries: [{
          id: 'a5f34026-d615-4687-9351-4f46c8588269',
          conditionId: condition.id,
          label: 'Condition',
        }],
      },
    };

    const now = new Date('2026-10-13T20:00:00.000Z');
    expect(calculateProfilePersonalization(fields, {
      birthDate: '2000-10-14',
      timezone: 'Asia/Jakarta',
      manifest: manifest(condition),
      now,
    }).unsupportedConditions).toEqual([]);
    expect(calculateProfilePersonalization(fields, {
      birthDate: '2000-10-14',
      timezone: 'America/New_York',
      manifest: manifest(condition),
      now,
    }).unsupportedConditions).toEqual(['Condition']);
  });
});
