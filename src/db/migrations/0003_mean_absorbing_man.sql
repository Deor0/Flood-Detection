CREATE TABLE "flood_climatology" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cell_key" text NOT NULL,
	"picked_lat" double precision,
	"picked_lng" double precision,
	"no_river" boolean DEFAULT false NOT NULL,
	"mean_discharge" double precision,
	"neighbour_empty_count" integer DEFAULT 0 NOT NULL,
	"annual_maxima" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"years" integer DEFAULT 0 NOT NULL,
	"history_start" text NOT NULL,
	"history_end" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flood_climatology_cell_key_unique" UNIQUE("cell_key")
);
