import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** E.164, e.g. +15551234567 */
  phone: text('phone').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Records are never deleted: a person moves from 'missing' to 'found', and edits are logged. */
export const missingPersons = pgTable(
  'missing_persons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Shown to people as REG-<number>. */
    publicNumber: integer('public_number')
      .notNull()
      .unique()
      .generatedAlwaysAsIdentity({ startWith: 1001 }),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    age: integer('age'),
    lastSeenLocation: text('last_seen_location'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    notes: text('notes'),
    /** Who to contact about this case (free text). */
    contact: text('contact'),
    status: text('status', { enum: ['missing', 'found'] })
      .notNull()
      .default('missing'),
    /** Web reports carry the Clerk user id; SMS reports carry a phone. At least one is set. */
    reporterUserId: text('reporter_user_id'),
    reporterPhone: text('reporter_phone'),
    foundByUserId: text('found_by_user_id'),
    foundByPhone: text('found_by_phone'),
    foundNote: text('found_note'),
    foundAt: timestamp('found_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('missing_persons_name_idx').on(t.nameNormalized),
    index('missing_persons_status_idx').on(t.status),
  ],
);

/** Append-only history of a missing-person record. Never updated or deleted. */
export const missingPersonEvents = pgTable(
  'missing_person_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    missingPersonId: uuid('missing_person_id')
      .notNull()
      .references(() => missingPersons.id),
    kind: text('kind', {
      enum: [
        'reported',
        'edited',
        'found',
        'reopened',
        'edit_requested',
        'edit_approved',
        'edit_rejected',
      ],
    }).notNull(),
    /** Why (required for re-open and rejections). */
    reason: text('reason'),
    actorUserId: text('actor_user_id'),
    actorPhone: text('actor_phone'),
    /** For edits: { field: { from, to } }. For found: { note }. */
    changes: jsonb('changes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('missing_person_events_person_idx').on(t.missingPersonId)],
);

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

export const PROGRAM_CATEGORIES = [
  'first_aid_cpr',
  'flood_landslide_safety',
  'volunteer_briefing',
  'evacuation_drill',
  'water_sanitation',
] as const;
export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number];

export const PROGRAM_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

/** Community awareness programs (drills, workshops, briefings). */
export const programs = pgTable(
  'programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    category: text('category', { enum: PROGRAM_CATEGORIES }).notNull(),
    organizer: text('organizer').notNull(),
    location: text('location').notNull(),
    topics: text('topics'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** null = open access, no limit. */
    capacity: integer('capacity'),
    createdByUserId: text('created_by_user_id').notNull(),
    /** New programs wait as 'pending' until an admin approves them. */
    status: text('status', { enum: PROGRAM_STATUSES }).notNull().default('pending'),
    reviewedByUserId: text('reviewed_by_user_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('programs_starts_at_idx').on(t.startsAt),
    index('programs_status_idx').on(t.status),
  ],
);

/** A registration is cancelled by setting cancelled_at, never by deleting the row. */
export const programRegistrations = pgTable(
  'program_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [unique('program_registrations_user_program').on(t.programId, t.userId)],
);

/** Append-only history of a program: submitted, approved, rejected, edited, cancelled. */
export const programEvents = pgTable(
  'program_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id),
    kind: text('kind', {
      enum: ['submitted', 'approved', 'rejected', 'edited', 'cancelled'],
    }).notNull(),
    actorUserId: text('actor_user_id').notNull(),
    reason: text('reason'),
    /** For edits: { field: { from, to } }. */
    changes: jsonb('changes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('program_events_program_idx').on(t.programId)],
);

/** A suggested change to a missing-person record. The record is untouched until an admin approves. */
export const missingPersonEditRequests = pgTable(
  'missing_person_edit_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    missingPersonId: uuid('missing_person_id')
      .notNull()
      .references(() => missingPersons.id),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    /** The record's updated_at when the suggestion was made, to spot changes made since. */
    baseUpdatedAt: timestamp('base_updated_at', { withTimezone: true }).notNull(),
    /** The proposed values: { name, age, lastSeenLocation, notes, contact }. */
    proposed: jsonb('proposed').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    reviewedByUserId: text('reviewed_by_user_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('edit_requests_person_idx').on(t.missingPersonId),
    index('edit_requests_status_idx').on(t.status),
  ],
);

/** A flood alert. v1 alerts are simulations; nothing is ever sent. Never deleted. */
export const floodAlerts = pgTable('flood_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: ['simulated', 'real'] }).notNull(),
    place: text('place').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    severity: text('severity', {
      enum: ['normal', 'watch', 'warning', 'severe', 'unknown'],
    }).notNull(),
    returnPeriod: doublePrecision('return_period'),
    status: text('status', {
      enum: ['detected', 'verified', 'notified', 'acknowledged'],
    })
      .notNull()
      .default('detected'),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('flood_alerts_status_idx').on(t.status)],
);

/** Append-only history of an alert. */
export const floodAlertEvents = pgTable('flood_alert_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alertId: uuid('alert_id')
      .notNull()
      .references(() => floodAlerts.id),
    kind: text('kind', {
      enum: ['detected', 'verified', 'notified', 'acknowledged'],
    }).notNull(),
    actorUserId: text('actor_user_id').notNull(),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('flood_alert_events_alert_idx').on(t.alertId)],
);

/**
 * Per river-cell climatology cache: the yearly flood maxima from the 1984-to-now history, which
 * never changes day to day. Rows are never deleted; a stale row is refreshed in place. The flood
 * route works without this table (it falls back to fetching the full history).
 */
export const floodClimatology = pgTable('flood_climatology', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** `${round(lat/0.05)}:${round(lng/0.05)}` for the clicked point (GloFAS cells are 0.05 degrees). */
  cellKey: text('cell_key').notNull().unique(),
  pickedLat: doublePrecision('picked_lat'),
  pickedLng: doublePrecision('picked_lng'),
  noRiver: boolean('no_river').notNull().default(false),
  meanDischarge: doublePrecision('mean_discharge'),
  neighbourEmptyCount: integer('neighbour_empty_count').notNull().default(0),
  /** Hydrological-year maxima (number[]), current partial year already excluded. */
  annualMaxima: jsonb('annual_maxima').notNull().default([]),
  years: integer('years').notNull().default(0),
  historyStart: text('history_start').notNull(),
  historyEnd: text('history_end').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
