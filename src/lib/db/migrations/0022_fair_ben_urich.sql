CREATE TABLE "cron_job_health" (
	"job_name" text PRIMARY KEY NOT NULL,
	"monitoring_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"last_failure_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
