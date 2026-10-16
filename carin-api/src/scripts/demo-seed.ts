import {
  DemoApiError,
  demoCredentialConfigurationMessage,
  parseDemoSeedEnvironment,
} from '../demo/api-client.js';
import { createDemoSeedDatabase, runDemoSeed } from '../demo/seed.js';

function safeFailure(error: unknown): string {
  if (error instanceof DemoApiError) return error.message;
  if (error instanceof Error && /^DEMO_[A-Z0-9_:-]+$/.test(error.message)) return error.message;
  return 'DEMO_SEED_FAILED';
}

async function main(): Promise<void> {
  let database: ReturnType<typeof createDemoSeedDatabase> | undefined;
  try {
    const credentialsMessage = demoCredentialConfigurationMessage(process.env);
    if (credentialsMessage) {
      console.error(credentialsMessage);
      process.exitCode = 1;
      return;
    }
    const env = parseDemoSeedEnvironment(process.env);
    database = createDemoSeedDatabase(env.databaseUrl);
    const result = await runDemoSeed(env, database.db);
    console.log(JSON.stringify({ status: 'complete', ...result }));
  } catch (error) {
    console.error(safeFailure(error));
    process.exitCode = 1;
  } finally {
    await database?.pool.end();
  }
}

await main();
