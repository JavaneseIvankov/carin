import type { components } from '../../contracts/generated/app-api.js';

export type ExaminationInput = components['schemas']['ExaminationInput'];
export type Examination = components['schemas']['Examination'];
export type ExaminationPage = components['schemas']['ExaminationPage'];
export type ExamSeries = components['schemas']['ExamSeries'];

/** A validated wire record together with its persisted comparable-series identity. */
export type ExaminationRecord = ExaminationInput & { seriesKey: string };
