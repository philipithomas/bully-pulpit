-- Existing subscribers did not consent to Umami. The storage default stays
-- false for expand/contract safety; new-code signup paths opt new readers in
-- explicitly after the migration is available.
ALTER TABLE "sms_subscribers" ADD COLUMN "subscribed_umami" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "subscribed_umami" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "umami_opt_in_notification_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_sms_subscribers_umami_created" ON "sms_subscribers" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "sms_subscribers"."subscribed_umami" = true;--> statement-breakpoint
CREATE INDEX "idx_subscribers_umami_created" ON "subscribers" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "subscribers"."subscribed_umami" = true;
