CREATE TABLE "morning_report_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_date" text NOT NULL,
	"recipient" text NOT NULL,
	"sent_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"skip_reason" text
);
--> statement-breakpoint
CREATE TABLE "morning_reports" (
	"report_date" text PRIMARY KEY NOT NULL,
	"enqueue_token" text,
	"enqueue_at" timestamp with time zone,
	"workflow_run_id" text,
	"content" jsonb,
	"email" jsonb,
	"recipients" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "morning_report_deliveries" ADD CONSTRAINT "morning_report_deliveries_report_date_morning_reports_report_date_fk" FOREIGN KEY ("report_date") REFERENCES "public"."morning_reports"("report_date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_morning_report_date_recipient" ON "morning_report_deliveries" USING btree ("report_date","recipient");