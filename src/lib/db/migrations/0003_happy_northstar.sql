-- Safety net before the unique index lands: collapse duplicate
-- (subscriber_id, post_slug) rows that a past enqueue race may have left.
-- Only never-sent rows are deleted (no email went out, so no emailed
-- unsubscribe token breaks): keep a sent sibling when one exists, otherwise
-- keep the lowest id. Two sent duplicates would mean a delivered double-send;
-- the index creation then fails loudly for a human to resolve.
DELETE FROM "email_sends" a
USING "email_sends" b
WHERE a."subscriber_id" = b."subscriber_id"
  AND a."post_slug" = b."post_slug"
  AND a."id" <> b."id"
  AND a."sent_at" IS NULL
  AND (b."sent_at" IS NOT NULL OR b."id" < a."id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_email_sends_subscriber_post" ON "email_sends" USING btree ("subscriber_id","post_slug");
