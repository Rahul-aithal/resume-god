CREATE TABLE "tailor_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text,
	"target_title" text DEFAULT '' NOT NULL,
	"company_label" text DEFAULT '' NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"role_id" integer,
	"error" text,
	"warning" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"heartbeat_at" timestamp,
	"created_at" timestamp NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "tailor_jobs" ADD CONSTRAINT "tailor_jobs_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailor_jobs" ADD CONSTRAINT "tailor_jobs_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tailor_jobs_user_created_idx" ON "tailor_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tailor_jobs_status_idx" ON "tailor_jobs" USING btree ("status","created_at");