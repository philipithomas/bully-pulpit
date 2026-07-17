-- SMS has one global all-posts audience. Keep the legacy newsletter flags true
-- for confirmed rows so the currently serving and rollback code agree while a
-- later contract migration removes these columns.
UPDATE "sms_subscribers"
SET
  "subscribed_postcard" = true,
  "subscribed_contraption" = true,
  "subscribed_workshop" = true,
  "subscribed_umami" = true,
  "subscribed_tsundoku" = true
WHERE "confirmed_at" IS NOT NULL
  AND NOT (
    "subscribed_postcard"
    AND "subscribed_contraption"
    AND "subscribed_workshop"
    AND "subscribed_umami"
    AND "subscribed_tsundoku"
  );
