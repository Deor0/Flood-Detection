CREATE TABLE "flood_alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flood_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"place" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"severity" text NOT NULL,
	"return_period" double precision,
	"status" text DEFAULT 'detected' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flood_alert_events" ADD CONSTRAINT "flood_alert_events_alert_id_flood_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."flood_alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flood_alert_events_alert_idx" ON "flood_alert_events" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "flood_alerts_status_idx" ON "flood_alerts" USING btree ("status");