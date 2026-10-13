import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { DBAdapter, BetterAuthOptions } from 'better-auth';
import type { Database } from '../db/client.js';
import * as authSchema from '../db/schema/auth.js';

export type AuthTransactionDatabase = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

const transactionStore = new AsyncLocalStorage<AuthTransactionDatabase>();

const schema = {
  user: authSchema.user,
  session: authSchema.session,
  account: authSchema.account,
  verification: authSchema.verification,
  rateLimit: authSchema.rateLimit,
};

export function getAuthTransactionDatabase(): AuthTransactionDatabase {
  const transaction = transactionStore.getStore();
  if (!transaction) {
    throw new Error('Auth database hook is running outside its transaction');
  }
  return transaction;
}

export function getOptionalAuthTransactionDatabase(): AuthTransactionDatabase | undefined {
  return transactionStore.getStore();
}

export function createAuthDatabaseAdapter(
  db: Database,
): (options: BetterAuthOptions) => DBAdapter<BetterAuthOptions> {
  return (options) => {
    const adapterFactory = drizzleAdapter(db, {
      provider: 'pg',
      schema,
      transaction: false,
    });
    const adapter = adapterFactory(options);

    adapter.transaction = async <T>(callback: (transaction: DBAdapter<BetterAuthOptions>) => Promise<T>) =>
      db.transaction(async (transaction) => {
        const transactionAdapter = drizzleAdapter(transaction, {
          provider: 'pg',
          schema,
          transaction: false,
        })(options);
        return transactionStore.run(transaction, () => callback(transactionAdapter));
      });

    return adapter;
  };
}
