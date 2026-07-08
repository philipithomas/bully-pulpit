import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Ported from printing-press migrations 001–007. Column names and types are kept
// identical to the Rust/sqlx schema so existing subscriber data can be imported later.

export const subscribers = pgTable(
  'subscribers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    uuid: uuid('uuid').notNull().unique().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    subscribedPostcard: boolean('subscribed_postcard').notNull().default(true),
    subscribedContraption: boolean('subscribed_contraption')
      .notNull()
      .default(true),
    subscribedWorkshop: boolean('subscribed_workshop').notNull().default(true),
    subscribedTsundoku: boolean('subscribed_tsundoku').notNull().default(false),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_subscribers_email').on(table.email),
    index('idx_subscribers_uuid').on(table.uuid),
    // Eligibility and active-count queries filter on confirmed_at IS NOT NULL.
    index('idx_subscribers_confirmed_at').on(table.confirmedAt),
    index('idx_subscribers_postcard_created')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.subscribedPostcard} = true`),
    index('idx_subscribers_contraption_created')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.subscribedContraption} = true`),
    index('idx_subscribers_workshop_created')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.subscribedWorkshop} = true`),
    index('idx_subscribers_tsundoku_created')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.subscribedTsundoku} = true`),
  ]
)

export const emailSends = pgTable(
  'email_sends',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    subscriberId: bigint('subscriber_id', { mode: 'number' })
      .notNull()
      .references(() => subscribers.id),
    postSlug: text('post_slug').notNull(),
    unsubscribeToken: uuid('unsubscribe_token')
      .notNull()
      .unique()
      .defaultRandom(),
    sendError: text('send_error'),
    triggeredUnsubscribeAt: timestamp('triggered_unsubscribe_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    subject: text('subject'),
    htmlContent: text('html_content'),
    textContent: text('text_content'),
    newsletter: text('newsletter'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    previewText: text('preview_text'),
  },
  (table) => [
    index('idx_email_sends_subscriber').on(table.subscriberId),
    index('idx_email_sends_unsubscribe_token').on(table.unsubscribeToken),
    index('idx_email_sends_post_slug').on(table.postSlug),
    // DB backstop against duplicate enqueues: one row per recipient per post,
    // no matter how many workflow runs race. Inserts go through
    // bulkCreateQueued's onConflictDoNothing so a conflict is a no-op, not an
    // error. This guards enqueue duplication only; SES delivery stays
    // at-least-once.
    uniqueIndex('idx_email_sends_subscriber_post').on(
      table.subscriberId,
      table.postSlug
    ),
    index('idx_email_sends_queue')
      .on(table.nextAttemptAt)
      .where(sql`sent_at IS NULL AND send_error IS NULL`),
  ]
)

// One row per post that has had a send started, holding the runId of the most
// recent sendNewsletterWorkflow run. The send/retry guards look the runId up and
// ask the Workflow runtime for its status: a run that is pending/running blocks a
// second start (which would double-send), while a completed/failed/cancelled run
// means any leftover pending email_sends rows are a STALLED send that retry is
// meant to resume. Pending rows alone cannot tell those two states apart.
export const sendRuns = pgTable('send_runs', {
  postSlug: text('post_slug').primaryKey(),
  runId: text('run_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const logins = pgTable(
  'logins',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    subscriberId: bigint('subscriber_id', { mode: 'number' })
      .notNull()
      .references(() => subscribers.id),
    token: text('token').notNull().unique(),
    tokenType: text('token_type').notNull(),
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_logins_token').on(table.token),
    index('idx_logins_subscriber').on(table.subscriberId),
    check(
      'logins_token_type_check',
      sql`${table.tokenType} IN ('code', 'magic_link')`
    ),
  ]
)

export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').notNull().unique(),
    reason: text('reason').notNull(),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_email_suppressions_email').on(table.email)]
)

// Ported from junk-drawer's text_messages table: one row per inbound or
// outbound SMS on the Twilio numbers. twilio_sid is unique so a webhook retry
// cannot duplicate an inbound message.
export const textMessages = pgTable(
  'text_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    fromNumber: text('from_number').notNull(),
    toNumber: text('to_number').notNull(),
    body: text('body').notNull().default(''),
    direction: text('direction').notNull(),
    twilioSid: text('twilio_sid').unique(),
    status: text('status').notNull().default('received'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_text_messages_from_created').on(
      table.fromNumber,
      table.createdAt
    ),
    index('idx_text_messages_to_created').on(table.toNumber, table.createdAt),
    check(
      'text_messages_direction_check',
      sql`${table.direction} IN ('inbound', 'outbound')`
    ),
  ]
)

export const phoneWebhookEvents = pgTable(
  'phone_webhook_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventKey: text('event_key').notNull().unique(),
    eventType: text('event_type').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_phone_webhook_events_processed_at').on(table.processedAt),
  ]
)

export const smsSubscribers = pgTable(
  'sms_subscribers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    phoneNumber: text('phone_number').notNull().unique(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    subscribedPostcard: boolean('subscribed_postcard').notNull().default(true),
    subscribedContraption: boolean('subscribed_contraption')
      .notNull()
      .default(true),
    subscribedWorkshop: boolean('subscribed_workshop').notNull().default(true),
    subscribedTsundoku: boolean('subscribed_tsundoku').notNull().default(true),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_sms_subscribers_phone_number').on(table.phoneNumber),
    index('idx_sms_subscribers_confirmed_at').on(table.confirmedAt),
    index('idx_sms_subscribers_postcard_created')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.subscribedPostcard} = true`),
    index('idx_sms_subscribers_contraption_created')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.subscribedContraption} = true`),
    index('idx_sms_subscribers_workshop_created')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.subscribedWorkshop} = true`),
    index('idx_sms_subscribers_tsundoku_created')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.subscribedTsundoku} = true`),
  ]
)

export const smsSends = pgTable(
  'sms_sends',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    smsSubscriberId: bigint('sms_subscriber_id', { mode: 'number' })
      .notNull()
      .references(() => smsSubscribers.id),
    postSlug: text('post_slug').notNull(),
    newsletter: text('newsletter'),
    body: text('body').notNull(),
    twilioSid: text('twilio_sid').unique(),
    twilioStatus: text('twilio_status'),
    sendError: text('send_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_sms_sends_subscriber').on(table.smsSubscriberId),
    index('idx_sms_sends_post_slug').on(table.postSlug),
    uniqueIndex('idx_sms_sends_subscriber_post').on(
      table.smsSubscriberId,
      table.postSlug
    ),
    index('idx_sms_sends_queue')
      .on(table.nextAttemptAt)
      .where(sql`sent_at IS NULL AND send_error IS NULL`),
  ]
)

export type Subscriber = typeof subscribers.$inferSelect
export type NewSubscriber = typeof subscribers.$inferInsert
export type EmailSend = typeof emailSends.$inferSelect
export type NewEmailSend = typeof emailSends.$inferInsert
export type Login = typeof logins.$inferSelect
export type NewLogin = typeof logins.$inferInsert
export type EmailSuppression = typeof emailSuppressions.$inferSelect
export type SendRun = typeof sendRuns.$inferSelect
export type NewSendRun = typeof sendRuns.$inferInsert
export type TextMessage = typeof textMessages.$inferSelect
export type NewTextMessage = typeof textMessages.$inferInsert
export type PhoneWebhookEvent = typeof phoneWebhookEvents.$inferSelect
export type NewPhoneWebhookEvent = typeof phoneWebhookEvents.$inferInsert
export type SmsSubscriber = typeof smsSubscribers.$inferSelect
export type NewSmsSubscriber = typeof smsSubscribers.$inferInsert
export type SmsSend = typeof smsSends.$inferSelect
export type NewSmsSend = typeof smsSends.$inferInsert
