CREATE TABLE "missing_person_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"missing_person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"actor_phone" text,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missing_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "missing_persons_public_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"age" integer,
	"last_seen_location" text,
	"lat" double precision,
	"lng" double precision,
	"notes" text,
	"contact" text,
	"status" text DEFAULT 'missing' NOT NULL,
	"reporter_user_id" text,
	"reporter_phone" text,
	"found_by_user_id" text,
	"found_by_phone" text,
	"found_note" text,
	"found_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missing_persons_public_number_unique" UNIQUE("public_number")
);
--> statement-breakpoint
CREATE TABLE "program_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "program_registrations_user_program" UNIQUE("program_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"organizer" text NOT NULL,
	"location" text NOT NULL,
	"topics" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_phone" text NOT NULL,
	"raw_body" text NOT NULL,
	"command" text NOT NULL,
	"parsed_json" jsonb,
	"reply" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "missing_person_events" ADD CONSTRAINT "missing_person_events_missing_person_id_missing_persons_id_fk" FOREIGN KEY ("missing_person_id") REFERENCES "public"."missing_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_registrations" ADD CONSTRAINT "program_registrations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missing_person_events_person_idx" ON "missing_person_events" USING btree ("missing_person_id");--> statement-breakpoint
CREATE INDEX "missing_persons_name_idx" ON "missing_persons" USING btree ("name_normalized");--> statement-breakpoint
CREATE INDEX "missing_persons_status_idx" ON "missing_persons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "programs_starts_at_idx" ON "programs" USING btree ("starts_at");