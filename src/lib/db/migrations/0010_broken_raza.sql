ALTER TABLE "phone_webhook_events" ADD COLUMN "processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "text_messages" ADD COLUMN "reply_to_message_id" bigint;--> statement-breakpoint
ALTER TABLE "text_messages" ADD CONSTRAINT "text_messages_reply_to_message_id_unique" UNIQUE("reply_to_message_id");