CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"title_source" text DEFAULT 'auto' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chats_title_check" CHECK (char_length("chats"."title") BETWEEN 1 AND 120),
	CONSTRAINT "chats_title_source_check" CHECK ("chats"."title_source" IN ('auto', 'user'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_check" CHECK (char_length("projects"."name") BETWEEN 1 AND 80),
	CONSTRAINT "projects_description_check" CHECK (char_length("projects"."description") <= 300)
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question" text NOT NULL,
	"standalone_question" text,
	"answer" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turns_chat_position_key" UNIQUE("chat_id","position"),
	CONSTRAINT "turns_position_check" CHECK ("turns"."position" >= 0),
	CONSTRAINT "turns_status_check" CHECK ("turns"."status" IN ('done', 'not_found', 'stopped', 'error'))
);
--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_updated_at_idx" ON "chats" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chats_project_idx" ON "chats" USING btree ("project_id");