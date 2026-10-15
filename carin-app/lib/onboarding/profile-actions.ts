export type ProfileDraftComparison<TFields> = {
  currentFields: TFields | null;
  draftFields: TFields | null;
  currentHeightCm: number | null;
  currentWeightKg: number | null;
  heightInput: string | null;
  weightInput: string | null;
  conditionInput?: string;
  pendingTextInputs?: readonly string[];
};

function measurementChanged(value: string | null, current: number | null): boolean {
  if (value === null) return false;
  const trimmed = value.trim();
  if (!trimmed) return current !== null;
  const parsed = Number(trimmed);
  return !Number.isFinite(parsed) || parsed <= 0 || parsed !== current;
}

export function hasUnsavedProfileChanges<TFields>(
  input: ProfileDraftComparison<TFields>
): boolean {
  const fieldsChanged =
    input.draftFields !== null &&
    (input.currentFields === null ||
      JSON.stringify(input.draftFields) !== JSON.stringify(input.currentFields));
  const measurementChangedInForm =
    measurementChanged(input.heightInput, input.currentHeightCm) ||
    measurementChanged(input.weightInput, input.currentWeightKg);
  const hasPendingDetails =
    (input.conditionInput?.trim().length ?? 0) > 0 ||
    (input.pendingTextInputs?.some((value) => value.trim().length > 0) ?? false);
  return fieldsChanged || measurementChangedInForm || hasPendingDetails;
}
