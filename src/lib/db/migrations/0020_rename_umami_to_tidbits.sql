DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscribers'
      AND column_name = 'subscribed_umami'
  ) THEN
    ALTER TABLE "public"."subscribers"
      RENAME COLUMN "subscribed_umami" TO "subscribed_tidbits";
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscribers'
      AND column_name = 'subscribed_tidbits'
  ) THEN
    RAISE EXCEPTION 'subscribers subscription column is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscribers'
      AND column_name = 'umami_opt_in_notification_sent_at'
  ) THEN
    ALTER TABLE "public"."subscribers"
      RENAME COLUMN "umami_opt_in_notification_sent_at"
      TO "tidbits_opt_in_notification_sent_at";
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscribers'
      AND column_name = 'tidbits_opt_in_notification_sent_at'
  ) THEN
    RAISE EXCEPTION 'subscribers opt-in notification column is missing';
  END IF;

  IF to_regclass('public.idx_subscribers_umami_created') IS NOT NULL THEN
    ALTER INDEX "public"."idx_subscribers_umami_created"
      RENAME TO "idx_subscribers_tidbits_created";
  ELSIF to_regclass('public.idx_subscribers_tidbits_created') IS NULL THEN
    RAISE EXCEPTION 'subscribers newsletter index is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sms_subscribers'
      AND column_name = 'subscribed_umami'
  ) THEN
    ALTER TABLE "public"."sms_subscribers"
      RENAME COLUMN "subscribed_umami" TO "subscribed_tidbits";
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sms_subscribers'
      AND column_name = 'subscribed_tidbits'
  ) THEN
    RAISE EXCEPTION 'sms_subscribers subscription column is missing';
  END IF;

  IF to_regclass('public.idx_sms_subscribers_umami_created') IS NOT NULL THEN
    ALTER INDEX "public"."idx_sms_subscribers_umami_created"
      RENAME TO "idx_sms_subscribers_tidbits_created";
  ELSIF to_regclass('public.idx_sms_subscribers_tidbits_created') IS NULL THEN
    RAISE EXCEPTION 'sms_subscribers newsletter index is missing';
  END IF;

  -- Queued sends contain durable content snapshots. Rebrand unsent snapshots
  -- before changing their newsletter discriminator so a retry cannot deliver
  -- the retired name, colors, or asset paths. Sent snapshots stay byte-for-byte
  -- historical apart from the discriminator used by unsubscribe handling.
  UPDATE "public"."email_sends"
  SET "html_content" = replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      "html_content",
                      'email-brand-umami',
                      'email-brand-tidbits'
                    ),
                    'email-card-umami',
                    'email-card-tidbits'
                  ),
                  'content-cell-umami',
                  'content-cell-tidbits'
                ),
                '/images/umami-email.png',
                '/images/tidbits-email.png'
              ),
              '/images/covers/umami/',
              '/images/covers/tidbits/'
            ),
            '/umami',
            '/tidbits'
          ),
          'alt="umami"',
          'alt="tidbits"'
        ),
        '#f1ebe5',
        '#f6eae9'
      ),
      '#f2712c',
      '#f41986'
    ),
    '#F2712C',
    '#F41986'
  )
  WHERE "newsletter" = 'umami'
    AND "sent_at" IS NULL
    AND "html_content" IS NOT NULL;

  UPDATE "public"."sms_sends"
  SET
    "body" = replace("body", 'New umami post:', 'New tidbits post:'),
    "media_url" = replace(
      replace(
        "media_url",
        '/images/covers/umami/',
        '/images/covers/tidbits/'
      ),
      '%2Fimages%2Fcovers%2Fumami%2F',
      '%2Fimages%2Fcovers%2Ftidbits%2F'
    )
  WHERE "newsletter" = 'umami'
    AND "sent_at" IS NULL;

  UPDATE "public"."email_sends"
  SET "newsletter" = 'tidbits'
  WHERE "newsletter" = 'umami';

  UPDATE "public"."sms_sends"
  SET "newsletter" = 'tidbits'
  WHERE "newsletter" = 'umami';
END
$migration$;
