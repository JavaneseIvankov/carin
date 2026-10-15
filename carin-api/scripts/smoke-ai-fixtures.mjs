import assert from 'node:assert/strict';
import { env, stdout } from 'node:process';
import { loadConfig } from '../dist/config.js';
import { createAiClient } from '../dist/integrations/ai/index.js';

const config = loadConfig({
  ...env,
  APP_ENV: env.APP_ENV ?? 'dev',
  AI_MODE: env.AI_MODE ?? 'fixture',
  DATABASE_URL: env.DATABASE_URL ?? 'postgresql://smoke:smoke@127.0.0.1:5432/carin',
});
const client = createAiClient(config);
const profile = {
  profileVersion: 7,
  ageYears: null,
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
};
const result = await client.analyzePhoto({
  contractVersion: '2.0.0',
  operationId: '123e4567-e89b-42d3-a456-426614174000',
  catalogVersion: 'synthetic-catalog-1',
  ruleSetVersion: 'synthetic-rules-1',
  profile,
  image: {
    downloadUrl: 'http://minio.internal.invalid/meal.jpg',
    mimeType: 'image/jpeg',
    sha256: 'a'.repeat(64),
  },
});
assert.equal(result.dataMode, 'synthetic');
assert.equal(result.supportStatus, 'complete');
assert.equal((await client.getCapabilities()).dataMode, 'synthetic');
assert.equal((await client.getCatalog({ version: 'synthetic-catalog-1' })).items[0]?.id, 'fixture-food-001');
stdout.write('Built AI fixture adapter loaded the packaged synthetic fixtures.\n');
