import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generateContracts, writeArtifacts } from '../generate-contracts.mjs';

test('generation is reproducible and detects edited or missing artifacts', async () => {
  const first = await generateContracts();
  assert.equal(Object.keys(first).length, 6);
  assert.deepEqual(await generateContracts(), first);
  const directory = await mkdtemp(join(tmpdir(), 'carin-contracts-'));
  try {
    await writeArtifacts(first, directory, false);
    await writeArtifacts(first, directory, true);
    const path = Object.keys(first)[0];
    const filename = join(directory, path);
    const original = await readFile(filename, 'utf8');
    await writeFile(filename, `${original}\n// drift`);
    await assert.rejects(writeArtifacts(first, directory, true), /Generated contract drift/);
    await rm(filename);
    await assert.rejects(writeArtifacts(first, directory, true), /Generated contract drift/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
