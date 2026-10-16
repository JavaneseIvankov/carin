import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { components } from '../contracts/generated/app-api.js';
import type { ProfileFields } from '../modules/profile/validation.js';

type Schemas = components['schemas'];
export type DemoExamination = Schemas['ExaminationInput'];
export type DemoConsumption = Schemas['ConsumptionCreate'];

export type PhotoPlan = {
  filename: string;
  sha256: string;
  seedKey: string;
  bytes: Buffer;
};

export type DemoSeedData = {
  profile: ProfileFields;
  examinations: DemoExamination[];
  consumptions: DemoConsumption[];
};

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function stableUuid(name: string): string {
  const bytes = createHash('sha256').update(`carin-demo-seed:v1:${name}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeComponent(displayName: string, idName: string): DemoConsumption['components'][number] {
  return {
    id: stableUuid(idName),
    displayName,
    catalogFoodId: null,
    preparation: null,
    portion: { kind: 'unknown' },
  };
}

function examinationDate(anchorDate: string, daysBefore: number, time: string): Pick<DemoExamination, 'measuredOn' | 'measuredTime' | 'timezone' | 'note'> {
  return {
    measuredOn: shiftDate(anchorDate, -daysBefore),
    measuredTime: time,
    timezone: 'Asia/Jakarta',
    note: null,
  };
}

export function buildDemoData(anchorDate: string): DemoSeedData {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate) || shiftDate(anchorDate, 0) !== anchorDate) {
    throw new Error('DEMO_SEED_ANCHOR_DATE_INVALID');
  }

  const profile: ProfileFields = {
    heightCm: 162,
    weightKg: 58,
    sexForReference: 'female',
    diagnoses: { state: 'none_known', entries: [] },
    familyHistory: { state: 'unknown', entries: [] },
    allergies: { state: 'unknown', entries: [] },
    clinicianNotes: null,
    activity: 'light',
    smoking: 'never',
  };

  const exams: DemoExamination[] = [];
  for (const [daysBefore, values] of [[8, { systolic: 118, diastolic: 76 }], [2, { systolic: 116, diastolic: 74 }]] as const) {
    exams.push({ ...examinationDate(anchorDate, daysBefore, '08:00'), type: 'pressure', unit: 'mmHg', ...values });
  }
  for (const [daysBefore, value] of [[8, 92], [2, 89]] as const) {
    exams.push({ ...examinationDate(anchorDate, daysBefore, '08:15'), type: 'glucose', unit: 'mg/dL', context: 'fasting', value });
  }
  const cholesterol = [
    { daysBefore: 8, values: { total: 178, ldl: 105, hdl: 54 } },
    { daysBefore: 2, values: { total: 172, ldl: 101, hdl: 55 } },
  ] as const;
  for (const point of cholesterol) {
    for (const subtype of ['total', 'ldl', 'hdl'] as const) {
      exams.push({
        ...examinationDate(anchorDate, point.daysBefore, '08:30'),
        type: 'cholesterol',
        unit: 'mg/dL',
        subtype,
        value: point.values[subtype],
      });
    }
  }

  const meals = [
    { dayOffset: 0, time: '08:00:00', names: ['Roti gandum', 'Telur'] },
    { dayOffset: 0, time: '13:00:00', names: ['Nasi', 'Ayam panggang', 'Sayur'] },
    { dayOffset: 0, time: '19:00:00', names: ['Nasi', 'Ikan', 'Sayur'] },
    { dayOffset: -1, time: '08:00:00', names: ['Oat', 'Pisang'] },
    { dayOffset: -1, time: '13:00:00', names: ['Nasi', 'Tempe', 'Sayur'] },
    { dayOffset: -2, time: '19:00:00', names: ['Nasi', 'Ayam', 'Tumis sayur'] },
  ];
  const consumptions: DemoConsumption[] = meals.map(({ dayOffset, time, names }, mealIndex) => {
    const mealDate = shiftDate(anchorDate, dayOffset);
    return {
      source: 'manual',
      scanId: null,
      sourceAnalysisResultId: null,
      occurrence: 'new_occurrence',
      consumedAt: `${mealDate}T${time}+07:00`,
      timezone: 'Asia/Jakarta',
      components: names.map((name, componentIndex) => makeComponent(name, `meal:${mealIndex}:${componentIndex}`)),
      catalogVersion: 'unavailable',
    };
  });
  return { profile, examinations: exams, consumptions };
}

export async function loadPhotoPlans(directory: URL | string): Promise<PhotoPlan[]> {
  const dirPath = directory instanceof URL ? directory.pathname : directory;
  const filenames = (await readdir(dirPath)).filter((name) => name.endsWith('.jpeg')).sort();
  if (filenames.length !== 6) throw new Error('DEMO_PHOTO_SET_INVALID');
  const plans = await Promise.all(filenames.map(async (filename) => {
    const bytes = await readFile(join(dirPath, filename));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { filename, sha256, seedKey: `photo:${filename}:${sha256}`, bytes };
  }));
  return plans;
}
