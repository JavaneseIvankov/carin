import { describe, expect, it } from 'vitest';
import { hasUnsavedProfileChanges } from './profile-actions';

const currentFields = {
  heightCm: 170,
  weightKg: 65,
  sexForReference: 'female',
  diagnoses: { state: 'none_known', entries: [] },
  allergies: { state: 'not_provided', entries: [] },
};

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    currentFields,
    draftFields: null,
    currentHeightCm: 170,
    currentWeightKg: 65,
    heightInput: null,
    weightInput: null,
    pendingTextInputs: [],
    ...overrides,
  };
}

describe('hasUnsavedProfileChanges', () => {
  it('does not ask for confirmation when the profile has not changed', () => {
    expect(hasUnsavedProfileChanges(snapshot())).toBe(false);
  });

  it('detects changed or invalid height and weight text', () => {
    expect(hasUnsavedProfileChanges(snapshot({ heightInput: '172' }))).toBe(true);
    expect(hasUnsavedProfileChanges(snapshot({ weightInput: 'not-a-number' }))).toBe(true);
  });

  it('detects choice-field and health-list changes in the profile draft', () => {
    expect(
      hasUnsavedProfileChanges(
        snapshot({ draftFields: { ...currentFields, sexForReference: 'male' } })
      )
    ).toBe(true);
    expect(
      hasUnsavedProfileChanges(
        snapshot({
          draftFields: {
            ...currentFields,
            diagnoses: { state: 'reported', entries: [{ id: 'entry-1', label: 'Contoh' }] },
          },
        })
      )
    ).toBe(true);
    expect(
      hasUnsavedProfileChanges(
        snapshot({
          draftFields: {
            ...currentFields,
            allergies: { state: 'reported', entries: ['Kacang'] },
          },
        })
      )
    ).toBe(true);
  });

  it('detects health details typed but not yet added to a list', () => {
    expect(hasUnsavedProfileChanges(snapshot({ pendingTextInputs: ['Kondisi lain'] }))).toBe(true);
    expect(hasUnsavedProfileChanges(snapshot({ pendingTextInputs: [' ', ''] }))).toBe(false);
  });

  it('detects a diagnosis search that has not been added to the profile', () => {
    expect(hasUnsavedProfileChanges(snapshot({ conditionInput: 'diabetes' }))).toBe(true);
    expect(hasUnsavedProfileChanges(snapshot({ conditionInput: '  ' }))).toBe(false);
  });
});
