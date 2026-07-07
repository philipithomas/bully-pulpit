CREATE TABLE "sms_sends" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sms_subscriber_id" bigint NOT NULL,
	"post_slug" text NOT NULL,
	"newsletter" text,
	"body" text NOT NULL,
	"twilio_sid" text,
	"twilio_status" text,
	"send_error" text,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_sends_twilio_sid_unique" UNIQUE("twilio_sid")
);
--> statement-breakpoint
CREATE TABLE "sms_subscribers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"phone_number" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"subscribed_postcard" boolean DEFAULT true NOT NULL,
	"subscribed_contraption" boolean DEFAULT true NOT NULL,
	"subscribed_workshop" boolean DEFAULT true NOT NULL,
	"subscribed_tsundoku" boolean DEFAULT true NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_subscribers_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
ALTER TABLE "sms_sends" ADD CONSTRAINT "sms_sends_sms_subscriber_id_sms_subscribers_id_fk" FOREIGN KEY ("sms_subscriber_id") REFERENCES "public"."sms_subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sms_sends_subscriber" ON "sms_sends" USING btree ("sms_subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_sms_sends_post_slug" ON "sms_sends" USING btree ("post_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sms_sends_subscriber_post" ON "sms_sends" USING btree ("sms_subscriber_id","post_slug");--> statement-breakpoint
CREATE INDEX "idx_sms_sends_queue" ON "sms_sends" USING btree ("next_attempt_at") WHERE sent_at IS NULL AND send_error IS NULL;--> statement-breakpoint
CREATE INDEX "idx_sms_subscribers_phone_number" ON "sms_subscribers" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "idx_sms_subscribers_confirmed_at" ON "sms_subscribers" USING btree ("confirmed_at");--> statement-breakpoint
CREATE INDEX "idx_sms_subscribers_postcard_created" ON "sms_subscribers" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "sms_subscribers"."subscribed_postcard" = true;--> statement-breakpoint
CREATE INDEX "idx_sms_subscribers_contraption_created" ON "sms_subscribers" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "sms_subscribers"."subscribed_contraption" = true;--> statement-breakpoint
CREATE INDEX "idx_sms_subscribers_workshop_created" ON "sms_subscribers" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "sms_subscribers"."subscribed_workshop" = true;--> statement-breakpoint
CREATE INDEX "idx_sms_subscribers_tsundoku_created" ON "sms_subscribers" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "sms_subscribers"."subscribed_tsundoku" = true;