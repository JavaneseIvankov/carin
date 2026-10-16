import { describe, expect, it } from 'vitest';
import { buildDemoData, loadPhotoPlans } from './seed-data.js';

describe('demo seed data', () => {
  const anchorDate = '2026-10-16';

  it('fills profile knowledge states and produces multiple measurements per chart series', () => {
    const data = buildDemoData(anchorDate);
    expect(data.profile.heightCm).toBeGreaterThan(0);
    expect(data.profile.weightKg).toBeGreaterThan(0);
    expect(data.profile.diagnoses.state).not.toBe('reported');
    expect(data.profile.familyHistory.state).toBe('unknown');
    expect(data.profile.allergies.state).toBe('unknown');
    const componentIds = data.consumptions.flatMap((meal) => meal.components.map(({ id }) => id));
    expect(componentIds.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
    expect(componentIds).toEqual(buildDemoData(anchorDate).consumptions.flatMap((meal) => meal.components.map(({ id }) => id)));
    expect(data.examinations.filter((entry) => entry.type === 'pressure')).toHaveLength(2);
    expect(data.examinations.filter((entry) => entry.type === 'glucose')).toHaveLength(2);
    expect(data.examinations.filter((entry) => entry.type === 'cholesterol')).toHaveLength(6);
  });

  it('anchors meal timestamps to the supplied Jakarta day and leaves portion and catalog unknown', () => {
    const data = buildDemoData(anchorDate);
    expect(data.consumptions.length).toBeGreaterThanOrEqual(3);
    for (const meal of data.consumptions) {
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(meal.consumedAt));
      expect([anchorDate, '2026-10-15', '2026-10-14']).toContain(localDate);
      expect(meal.timezone).toBe('Asia/Jakarta');
      expect(meal.catalogVersion).toBe('unavailable');
      expect(meal.source).toBe('manual');
      expect(meal.components.every((component) => component.portion.kind === 'unknown')).toBe(true);
    }
  });

  it('plans the six provided photos in stable filename order with content-derived keys', async () => {
    const directory = new URL('../../fixtures/demo/', import.meta.url);
    const plans = await loadPhotoPlans(directory);
    expect(plans).toHaveLength(6);
    expect(plans.map(({ filename }) => filename)).toEqual([...plans.map(({ filename }) => filename)].sort());
    expect(plans.every(({ seedKey, sha256 }) => seedKey.includes(sha256))).toBe(true);
    expect(await loadPhotoPlans(directory)).toEqual(plans);
  }, 15_000);
});
