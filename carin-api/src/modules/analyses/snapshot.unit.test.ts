import { describe, expect, it } from 'vitest';
import { buildProfileContext, type ProfileSnapshotSource } from './snapshot.js';

describe('buildProfileContext', () => {
  it('freezes only sanitized profile fields and computes age in the account timezone', () => {
    const profile: ProfileSnapshotSource = {
      version: 4,
      heightCm: '168',
      weightKg: '65.25',
      sexForReference: 'female',
      diagnosisState: 'reported',
      conditions: [
        { conditionId: 'condition-diabetes', label: 'Diabetes' },
        { conditionId: null, label: 'Other condition' },
      ],
      allergyState: 'reported',
      allergies: ['peanut'],
      activity: 'moderate',
      smoking: 'former',
    };
    const result = buildProfileContext(
      { birthDate: '1990-10-15', timezone: 'Asia/Jakarta' },
      profile,
      new Date('2026-10-14T20:00:00.000Z'),
    );
    expect(result).toEqual({
      profileVersion: 4,
      ageYears: 36,
      heightCm: 168,
      weightKg: 65.25,
      sexForReference: 'female',
      diagnosisState: 'reported',
      conditionIds: ['condition-diabetes'],
      unsupportedConditionLabels: ['Other condition'],
      allergyState: 'reported',
      allergies: ['peanut'],
      activity: 'moderate',
      smoking: 'former',
    });
    expect(result).not.toHaveProperty('birthDate');
    expect(result).not.toHaveProperty('clinicianNotes');
  });

  it('represents an absent profile as version zero with explicit unknown fields', () => {
    expect(buildProfileContext(
      { birthDate: '1995-01-01', timezone: 'Asia/Jakarta' },
      null,
      new Date('2026-10-14T00:00:00.000Z'),
    )).toEqual({
      profileVersion: 0,
      ageYears: 31,
      heightCm: null,
      weightKg: null,
      sexForReference: null,
      diagnosisState: 'not_provided',
      conditionIds: [],
      unsupportedConditionLabels: [],
      allergyState: 'not_provided',
      allergies: [],
      activity: null,
      smoking: null,
    });
  });
});
