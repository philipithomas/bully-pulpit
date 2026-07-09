ALTER TABLE "sms_subscribers" ADD COLUMN "bell_contact_card_claim_id" uuid;--> statement-breakpoint
ALTER TABLE "sms_subscribers" ADD COLUMN "bell_contact_card_processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_subscribers" ADD COLUMN "bell_contact_card_sent_at" timestamp with time zone;--> statement-breakpoint
UPDATE "sms_subscribers"
SET "bell_contact_card_sent_at" = "confirmed_at"
WHERE "confirmed_at" IS NOT NULL;
