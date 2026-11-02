import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});

export const swarmRooms=sqliteTable('swarm_rooms',{
 code:text('code').primaryKey(),mode:text('mode').notNull(),seed:integer('seed').notNull(),
 seats:text('seats').notNull().default('[]'),started:integer('started').notNull().default(0),
 revision:integer('revision').notNull().default(0),nextTick:integer('next_tick').notNull().default(0),
 lastAt:integer('last_at').notNull().default(0),lease:text('lease'),leaseUntil:integer('lease_until').notNull().default(0),
 expires:integer('expires').notNull(),created:integer('created').notNull(),
},t=>[index('swarm_rooms_expires').on(t.expires)]);
export const swarmStates=sqliteTable('swarm_states',{
 code:text('code').primaryKey().references(()=>swarmRooms.code,{onDelete:'cascade'}),checkpoint:text('checkpoint').notNull(),
 snapshot:text('snapshot').notNull().default(''),revision:integer('revision').notNull().default(0),
 acks:text('acks').notNull().default('[]'),
});
export const swarmCommands=sqliteTable('swarm_commands',{
 id:integer('id').primaryKey({autoIncrement:true}),code:text('code').notNull().references(()=>swarmRooms.code,{onDelete:'cascade'}),
 seat:integer('seat').notNull(),sequence:integer('sequence').notNull(),body:text('body').notNull(),
 done:integer('done').notNull().default(0),
},t=>[uniqueIndex('swarm_command_identity').on(t.code,t.seat,t.sequence),index('swarm_command_room').on(t.code,t.done,t.id)]);
