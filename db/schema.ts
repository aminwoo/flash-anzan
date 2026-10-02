import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const lobbies = sqliteTable('lobbies', {
 id: text('id').primaryKey(),
 state: text('state').notNull(),
 revision: integer('revision').notNull().default(0),
});
