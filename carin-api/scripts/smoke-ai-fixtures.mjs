import assert from 'node:assert/strict';
import { stdout } from 'node:process';
import { createFixtureAiClient } from '../dist/integrations/ai/index.js';

const client = createFixtureAiClient({ environment: 'test', scenario: 'complete' });
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
  contractVersion: '1.0.0',
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
