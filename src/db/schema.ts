import {
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** E.164, e.g. +15551234567 */
  phone: text('phone').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const missingPersons = pgTable('missing_persons', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  nameNormalized: text('name_normalized').notNull(),
  age: integer('age'),
  lastSeenLocation: text('last_seen_location'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  status: text('status', { enum: ['missing', 'found'] })
    .notNull()
    .default('missing'),
  reporterPhone: text('reporter_phone').notNull(),
  foundByPhone: text('found_by_phone'),
  foundAt: timestamp('found_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only: never update or delete rows. */
export const smsLog = pgTable('sms_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromPhone: text('from_phone').notNull(),
  rawBody: text('raw_body').notNull(),
  command: text('command').notNull(),
  parsedJson: jsonb('parsed_json'),
  reply: text('reply').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
});

export const communityPosts = pgTable('community_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  location: text('location'),
  eventDate: timestamp('event_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
