CREATE TABLE "send_runs" (
	"post_slug" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
