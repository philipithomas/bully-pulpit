CREATE TABLE "bell_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_conversation_id" uuid,
	"surface" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"subscriber_id" bigint,
	"sms_subscriber_id" bigint,
	"network_identity_hash" text,
	"network_identity_period" text,
	"sms_phone_hash" text,
	"first_page_path" text,
	"first_page_title" text,
	"last_page_path" text,
	"last_page_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bell_conversations_client_conversation_id_unique" UNIQUE("client_conversation_id"),
	CONSTRAINT "bell_conversations_surface_check" CHECK ("bell_conversations"."surface" IN ('web', 'sms')),
	CONSTRAINT "bell_conversations_status_check" CHECK ("bell_conversations"."status" IN ('active', 'completed', 'error'))
);
--> statement-breakpoint
CREATE TABLE "bell_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"conversation_id" uuid NOT NULL,
	"user_message_id" uuid,
	"assistant_message_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"model" text,
	"provider" text,
	"call_id" text,
	"gateway_generation_id" text,
	"trace_id" text,
	"workflow_run_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"cached_input_tokens" integer,
	"reasoning_tokens" integer,
	"cost_usd" double precision,
	"latency_ms" integer,
	"finish_reason" text,
	"tools_used" jsonb,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bell_generations_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "bell_generations_status_check" CHECK ("bell_generations"."status" IN ('queued', 'running', 'completed', 'aborted', 'error'))
);
--> statement-breakpoint
CREATE TABLE "bell_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"author_kind" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"parts" jsonb,
	"client_message_id" text,
	"source_text_message_id" bigint,
	"reply_to_message_id" uuid,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"redacted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bell_messages_role_check" CHECK ("bell_messages"."role" IN ('user', 'assistant', 'system')),
	CONSTRAINT "bell_messages_author_kind_check" CHECK ("bell_messages"."author_kind" IN ('visitor', 'bell', 'admin', 'system')),
	CONSTRAINT "bell_messages_status_check" CHECK ("bell_messages"."status" IN ('received', 'generating', 'completed', 'aborted', 'error', 'redacted'))
);
--> statement-breakpoint
ALTER TABLE "bell_conversations" ADD CONSTRAINT "bell_conversations_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_conversations" ADD CONSTRAINT "bell_conversations_sms_subscriber_id_sms_subscribers_id_fk" FOREIGN KEY ("sms_subscriber_id") REFERENCES "public"."sms_subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_generations" ADD CONSTRAINT "bell_generations_conversation_id_bell_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."bell_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_generations" ADD CONSTRAINT "bell_generations_user_message_id_bell_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."bell_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_generations" ADD CONSTRAINT "bell_generations_assistant_message_id_bell_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."bell_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_messages" ADD CONSTRAINT "bell_messages_conversation_id_bell_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."bell_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_messages" ADD CONSTRAINT "bell_messages_source_text_message_id_text_messages_id_fk" FOREIGN KEY ("source_text_message_id") REFERENCES "public"."text_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bell_conversations_updated" ON "bell_conversations" USING btree ("updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_bell_conversations_subscriber" ON "bell_conversations" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_bell_conversations_sms_subscriber" ON "bell_conversations" USING btree ("sms_subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_bell_conversations_network_identity" ON "bell_conversations" USING btree ("network_identity_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bell_conversations_sms_phone" ON "bell_conversations" USING btree ("sms_phone_hash");--> statement-breakpoint
CREATE INDEX "idx_bell_conversations_expiry" ON "bell_conversations" USING btree ("expires_at") WHERE "bell_conversations"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_bell_generations_conversation_created" ON "bell_generations" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_bell_generations_status" ON "bell_generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bell_generations_workflow" ON "bell_generations" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "idx_bell_messages_conversation_created" ON "bell_messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bell_messages_client_id" ON "bell_messages" USING btree ("conversation_id","client_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bell_messages_source_text" ON "bell_messages" USING btree ("source_text_message_id");
