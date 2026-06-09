CREATE TABLE "email_sends" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"post_slug" text NOT NULL,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"send_error" text,
	"triggered_unsubscribe_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subject" text,
	"html_content" text,
	"newsletter" text,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"preview_text" text,
	CONSTRAINT "email_sends_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "logins" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"token" text NOT NULL,
	"token_type" text NOT NULL,
	"email_sent_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"expired_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	CONSTRAINT "logins_token_unique" UNIQUE("token"),
	CONSTRAINT "logins_token_type_check" CHECK ("logins"."token_type" IN ('code', 'magic_link'))
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"confirmed_at" timestamp with time zone,
	"subscribed_postcard" boolean DEFAULT true NOT NULL,
	"subscribed_contraption" boolean DEFAULT true NOT NULL,
	"subscribed_workshop" boolean DEFAULT true NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_uuid_unique" UNIQUE("uuid"),
	CONSTRAINT "subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logins" ADD CONSTRAINT "logins_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_sends_subscriber" ON "email_sends" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_email_sends_unsubscribe_token" ON "email_sends" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE INDEX "idx_email_sends_post_slug" ON "email_sends" USING btree ("post_slug");--> statement-breakpoint
CREATE INDEX "idx_email_sends_queue" ON "email_sends" USING btree ("next_attempt_at") WHERE sent_at IS NULL AND send_error IS NULL;--> statement-breakpoint
CREATE INDEX "idx_email_suppressions_email" ON "email_suppressions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_logins_token" ON "logins" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_logins_subscriber" ON "logins" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "idx_subscribers_email" ON "subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_subscribers_uuid" ON "subscribers" USING btree ("uuid");