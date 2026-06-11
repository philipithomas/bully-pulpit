CREATE TABLE "text_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"direction" text NOT NULL,
	"twilio_sid" text,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "text_messages_twilio_sid_unique" UNIQUE("twilio_sid"),
	CONSTRAINT "text_messages_direction_check" CHECK ("text_messages"."direction" IN ('inbound', 'outbound'))
);
--> statement-breakpoint
CREATE INDEX "idx_text_messages_from_created" ON "text_messages" USING btree ("from_number","created_at");--> statement-breakpoint
CREATE INDEX "idx_text_messages_to_created" ON "text_messages" USING btree ("to_number","created_at");