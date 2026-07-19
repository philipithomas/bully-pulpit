import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'

const migrationsFolder = resolve('src/lib/db/migrations')
const migrationTag = '0020_rename_umami_to_tidbits'

type Journal = {
  entries: Array<{
    tag: string
    when: number
  }>
}

describe('0020 Umami to Tidbits migration', () => {
  it('renames storage without losing consent and updates only pending delivery snapshots', async () => {
    const client = new PGlite()
    const db = drizzle(client)

    try {
      const journal = JSON.parse(
        await readFile(resolve(migrationsFolder, 'meta/_journal.json'), 'utf8')
      ) as Journal
      const targetEntry = journal.entries.find(
        (entry) => entry.tag === migrationTag
      )
      if (!targetEntry)
        throw new Error(`${migrationTag} is missing from journal`)

      const migrations = readMigrationFiles({ migrationsFolder })
      const previousMigrations = migrations.filter(
        (migration) => migration.folderMillis < targetEntry.when
      )
      const targetMigration = migrations.find(
        (migration) => migration.folderMillis === targetEntry.when
      )
      if (!targetMigration) throw new Error(`${migrationTag} SQL is missing`)

      expect(previousMigrations).toHaveLength(20)
      for (const migration of previousMigrations) {
        for (const statement of migration.sql) {
          await db.execute(sql.raw(statement))
        }
      }

      const oldPendingEmailHtml =
        '<body class="email-body" style="background-color: #f1ebe5;"><table class="email-bg" style="background-color: #f1ebe5;"><tr><td><table class="email-card email-card-umami" style="background-color: #f1ebe5;"><tr><td><a href="https://www.philipithomas.com/umami"><img class="email-brand-umami" src="https://www.philipithomas.com/images/umami-email.png" alt="umami"></a></td></tr><tr><td class="content-cell content-cell-umami"><a href="https://www.philipithomas.com/sfmoma" style="color: #F2712C;">Read the post</a><p>The dish still has umami.</p></td></tr></table></td></tr></table></body>'
      const newPendingEmailHtml =
        '<body class="email-body" style="background-color: #f6eae9;"><table class="email-bg" style="background-color: #f6eae9;"><tr><td><table class="email-card email-card-tidbits" style="background-color: #f6eae9;"><tr><td><a href="https://www.philipithomas.com/tidbits"><img class="email-brand-tidbits" src="https://www.philipithomas.com/images/tidbits-email.png" alt="tidbits"></a></td></tr><tr><td class="content-cell content-cell-tidbits"><a href="https://www.philipithomas.com/sfmoma" style="color: #F41986;">Read the post</a><p>The dish still has umami.</p></td></tr></table></td></tr></table></body>'
      const oldPendingSmsBody =
        'New umami post:\nSFMOMA\nhttps://www.philipithomas.com/sfmoma?utm_source=sms\n\nA caption about umami.\n\n(Reply STOP to unsubscribe.)'
      const newPendingSmsBody =
        'New tidbits post:\nSFMOMA\nhttps://www.philipithomas.com/sfmoma?utm_source=sms\n\nA caption about umami.\n\n(Reply STOP to unsubscribe.)'
      const oldPendingMediaUrl =
        'https://www.philipithomas.com/api/phone/newsletter-cover/sfmoma?v=%2Fimages%2Fcovers%2Fumami%2Fsfmoma.jpg'
      const newPendingMediaUrl =
        'https://www.philipithomas.com/api/phone/newsletter-cover/sfmoma?v=%2Fimages%2Fcovers%2Ftidbits%2Fsfmoma.jpg'

      await db.execute(sql`
        INSERT INTO subscribers (
          id,
          email,
          subscribed_umami,
          umami_opt_in_notification_sent_at
        ) VALUES (
          101,
          'reader@example.com',
          true,
          '2026-07-18T12:34:56Z'
        )
      `)
      await db.execute(sql`
        INSERT INTO sms_subscribers (
          id,
          phone_number,
          confirmed_at,
          subscribed_umami
        ) VALUES (
          201,
          '+12125550123',
          '2026-07-18T12:34:56Z',
          true
        )
      `)
      await db.execute(sql`
        INSERT INTO email_sends (
          id,
          subscriber_id,
          post_slug,
          subject,
          html_content,
          text_content,
          preview_text,
          newsletter,
          sent_at
        ) VALUES
          (
            301,
            101,
            'sfmoma-pending',
            'Umami in an everyday sentence',
            ${oldPendingEmailHtml},
            'The dish still has umami.',
            'A preview about umami.',
            'umami',
            NULL
          ),
          (
            302,
            101,
            'sfmoma-sent',
            'Sent Umami archive',
            ${oldPendingEmailHtml},
            'Historical umami text.',
            'Historical umami preview.',
            'umami',
            '2026-07-18T13:00:00Z'
          )
      `)
      await db.execute(sql`
        INSERT INTO sms_sends (
          id,
          sms_subscriber_id,
          post_slug,
          newsletter,
          body,
          media_url,
          sent_at
        ) VALUES
          (
            401,
            201,
            'sfmoma-pending',
            'umami',
            ${oldPendingSmsBody},
            ${oldPendingMediaUrl},
            NULL
          ),
          (
            402,
            201,
            'sfmoma-sent',
            'umami',
            ${oldPendingSmsBody},
            ${oldPendingMediaUrl},
            '2026-07-18T13:00:00Z'
          )
      `)

      // Running twice proves the guarded DDL and snapshot rewrites are
      // idempotent, which matters if a deploy retries after losing its ack.
      for (let run = 0; run < 2; run += 1) {
        for (const statement of targetMigration.sql) {
          await db.execute(sql.raw(statement))
        }
      }

      const columns = await db.execute(sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('subscribers', 'sms_subscribers')
          AND (
            column_name LIKE '%umami%'
            OR column_name IN (
              'subscribed_tidbits',
              'tidbits_opt_in_notification_sent_at'
            )
          )
        ORDER BY table_name, column_name
      `)
      expect(columns.rows).toEqual([
        {
          table_name: 'sms_subscribers',
          column_name: 'subscribed_tidbits',
        },
        {
          table_name: 'subscribers',
          column_name: 'subscribed_tidbits',
        },
        {
          table_name: 'subscribers',
          column_name: 'tidbits_opt_in_notification_sent_at',
        },
      ])

      const indexes = await db.execute(sql`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND (indexname LIKE '%umami%' OR indexname LIKE '%tidbits%')
        ORDER BY indexname
      `)
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        'idx_sms_subscribers_tidbits_created',
        'idx_subscribers_tidbits_created',
      ])
      for (const row of indexes.rows) {
        expect(row.indexdef).toContain('WHERE (subscribed_tidbits = true)')
        expect(row.indexdef).not.toContain('umami')
      }

      const consent = await db.execute(sql`
        SELECT
          subscribed_tidbits,
          to_char(
            tidbits_opt_in_notification_sent_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) AS notification_sent_at
        FROM subscribers
        WHERE id = 101
      `)
      expect(consent.rows).toEqual([
        {
          subscribed_tidbits: true,
          notification_sent_at: '2026-07-18T12:34:56',
        },
      ])
      const smsConsent = await db.execute(sql`
        SELECT subscribed_tidbits
        FROM sms_subscribers
        WHERE id = 201
      `)
      expect(smsConsent.rows).toEqual([{ subscribed_tidbits: true }])

      const emailSnapshots = await db.execute(sql`
        SELECT
          post_slug,
          subject,
          html_content,
          text_content,
          preview_text,
          newsletter
        FROM email_sends
        ORDER BY id
      `)
      expect(emailSnapshots.rows).toEqual([
        {
          post_slug: 'sfmoma-pending',
          subject: 'Umami in an everyday sentence',
          html_content: newPendingEmailHtml,
          text_content: 'The dish still has umami.',
          preview_text: 'A preview about umami.',
          newsletter: 'tidbits',
        },
        {
          post_slug: 'sfmoma-sent',
          subject: 'Sent Umami archive',
          html_content: oldPendingEmailHtml,
          text_content: 'Historical umami text.',
          preview_text: 'Historical umami preview.',
          newsletter: 'tidbits',
        },
      ])

      const smsSnapshots = await db.execute(sql`
        SELECT post_slug, newsletter, body, media_url
        FROM sms_sends
        ORDER BY id
      `)
      expect(smsSnapshots.rows).toEqual([
        {
          post_slug: 'sfmoma-pending',
          newsletter: 'tidbits',
          body: newPendingSmsBody,
          media_url: newPendingMediaUrl,
        },
        {
          post_slug: 'sfmoma-sent',
          newsletter: 'tidbits',
          body: oldPendingSmsBody,
          media_url: oldPendingMediaUrl,
        },
      ])
    } finally {
      await client.close()
    }
  }, 30_000)
})
