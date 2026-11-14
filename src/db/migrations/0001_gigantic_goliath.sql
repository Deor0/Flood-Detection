CREATE TABLE "missing_person_edit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"missing_person_id" uuid NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"base_updated_at" timestamp with time zone NOT NULL,
	"proposed" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"reason" text,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missing_person_events" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "reviewed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "missing_person_edit_requests" ADD CONSTRAINT "missing_person_edit_requests_missing_person_id_missing_persons_id_fk" FOREIGN KEY ("missing_person_id") REFERENCES "public"."missing_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_events" ADD CONSTRAINT "program_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edit_requests_person_idx" ON "missing_person_edit_requests" USING btree ("missing_person_id");--> statement-breakpoint
CREATE INDEX "edit_requests_status_idx" ON "missing_person_edit_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "program_events_program_idx" ON "program_events" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "programs_status_idx" ON "programs" USING btree ("status");
--> statement-breakpoint
-- Programs that exist before this migration were already public: keep them approved.
UPDATE "programs" SET "status" = 'approved';
