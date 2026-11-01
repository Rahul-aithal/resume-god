CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role_id" integer NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"job_url" text DEFAULT '' NOT NULL,
	"salary" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"jd_text" text DEFAULT '' NOT NULL,
	"resume_pdf" text DEFAULT '' NOT NULL,
	"plan_json" text DEFAULT '' NOT NULL,
	"applied_on" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role_id" integer,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kg_achievement_metrics" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kg_achievement_skills" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"skill_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kg_achievements" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"parent_id" text NOT NULL,
	"text" text NOT NULL,
	"date_range" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kg_achievements_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "kg_certifications" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text DEFAULT '' NOT NULL,
	"issued_on" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kg_certifications_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "kg_contact" (
	"user_id" text PRIMARY KEY NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"linkedin" text DEFAULT '' NOT NULL,
	"github" text DEFAULT '' NOT NULL,
	"personal_site" text DEFAULT '' NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kg_education" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"institution" text NOT NULL,
	"credential" text DEFAULT '' NOT NULL,
	"date_range" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kg_education_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "kg_parents" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"date_range" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kg_parents_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "kg_skill_aliases" (
	"user_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kg_skill_implies" (
	"user_id" text NOT NULL,
	"from_skill_id" text NOT NULL,
	"to_skill_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kg_skills" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kg_skills_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "kg_soft_skills" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kg_soft_skills_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" integer NOT NULL,
	"target_title" text NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"job_url" text DEFAULT '' NOT NULL,
	"salary" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"llm_order" text DEFAULT 'gemini,glm,openai' NOT NULL,
	"gemini_model" text DEFAULT 'gemini-3-flash-preview' NOT NULL,
	"glm_model" text DEFAULT 'glm-4.6' NOT NULL,
	"openai_model" text DEFAULT 'gpt-4.1' NOT NULL,
	"default_font" text DEFAULT 'Calibri' NOT NULL,
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_achievement_metrics" ADD CONSTRAINT "kg_achievement_metrics_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_achievement_skills" ADD CONSTRAINT "kg_achievement_skills_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_achievements" ADD CONSTRAINT "kg_achievements_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_achievements" ADD CONSTRAINT "kg_achievements_parent_fk" FOREIGN KEY ("user_id","parent_id") REFERENCES "public"."kg_parents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_certifications" ADD CONSTRAINT "kg_certifications_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_contact" ADD CONSTRAINT "kg_contact_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_education" ADD CONSTRAINT "kg_education_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_parents" ADD CONSTRAINT "kg_parents_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_skill_aliases" ADD CONSTRAINT "kg_skill_aliases_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_skill_implies" ADD CONSTRAINT "kg_skill_implies_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_skills" ADD CONSTRAINT "kg_skills_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_soft_skills" ADD CONSTRAINT "kg_soft_skills_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_role_idx" ON "applications" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "auth_account_user_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_user_name_uq" ON "companies" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "kg_achievement_metrics_a_idx" ON "kg_achievement_metrics" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "kg_achievement_skills_a_idx" ON "kg_achievement_skills" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "kg_achievement_skills_s_idx" ON "kg_achievement_skills" USING btree ("user_id","skill_id");--> statement-breakpoint
CREATE INDEX "kg_achievements_parent_idx" ON "kg_achievements" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE INDEX "kg_parents_user_kind_idx" ON "kg_parents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "kg_skill_aliases_skill_idx" ON "kg_skill_aliases" USING btree ("user_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kg_skill_implies_uq" ON "kg_skill_implies" USING btree ("user_id","from_skill_id","to_skill_id");--> statement-breakpoint
CREATE INDEX "kg_skills_name_idx" ON "kg_skills" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_company_title_uq" ON "roles" USING btree ("company_id","target_title");--> statement-breakpoint
CREATE INDEX "roles_user_idx" ON "roles" USING btree ("user_id");