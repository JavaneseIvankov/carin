import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

export const demoSeedResource = pgTable(
  'demo_seed_resource',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    seedKey: text('seed_key').notNull(),
    resourceKind: text('resource_kind').notNull(),
    payloadHash: text('payload_hash').notNull(),
    resourceId: text('resource_id'),
    state: text('state').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('demo_seed_resource_user_key').on(table.userId, table.seedKey),
    index('demo_seed_resource_user_kind').on(table.userId, table.resourceKind),
    check('demo_seed_resource_state', sql`${table.state} IN ('pending','complete')`),
    check('demo_seed_resource_key_nonempty', sql`length(${table.seedKey}) > 0`),
  ],
);
