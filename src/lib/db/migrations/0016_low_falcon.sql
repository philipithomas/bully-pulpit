ALTER TABLE "sms_sends" DROP CONSTRAINT "sms_sends_sms_subscriber_id_sms_subscribers_id_fk";
--> statement-breakpoint
ALTER TABLE "sms_sends" ADD CONSTRAINT "sms_sends_sms_subscriber_id_sms_subscribers_id_fk" FOREIGN KEY ("sms_subscriber_id") REFERENCES "public"."sms_subscribers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
WITH inactive_subscribers AS MATERIALIZED (
	SELECT "id", "phone_number"
	FROM "sms_subscribers"
	WHERE "confirmed_at" IS NULL
), deleted_bell_conversations AS (
	DELETE FROM "bell_conversations"
	WHERE "sms_subscriber_id" IN (SELECT "id" FROM inactive_subscribers)
		OR "id" IN (
			SELECT DISTINCT "bell_messages"."conversation_id"
			FROM "bell_messages"
			INNER JOIN "text_messages"
				ON "bell_messages"."source_text_message_id" = "text_messages"."id"
			WHERE "text_messages"."from_number" IN (
				SELECT "phone_number" FROM inactive_subscribers
			)
				OR "text_messages"."to_number" IN (
					SELECT "phone_number" FROM inactive_subscribers
				)
		)
), deleted_text_messages AS (
	DELETE FROM "text_messages"
	WHERE "from_number" IN (SELECT "phone_number" FROM inactive_subscribers)
		OR "to_number" IN (SELECT "phone_number" FROM inactive_subscribers)
)
DELETE FROM "sms_subscribers"
WHERE "id" IN (SELECT "id" FROM inactive_subscribers);
