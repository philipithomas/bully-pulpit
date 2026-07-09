CREATE TABLE "phone_webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_webhook_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE INDEX "idx_phone_webhook_events_processed_at" ON "phone_webhook_events" USING btree ("processed_at");