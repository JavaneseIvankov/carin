CREATE TABLE "catalog_condition" (
	"catalog_version" text NOT NULL,
	"condition_id" text NOT NULL,
	"display_name" text NOT NULL,
	"condition" jsonb NOT NULL,
	CONSTRAINT "catalog_condition_catalog_version_condition_id_pk" PRIMARY KEY("catalog_version","condition_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_search_cursor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_version" text NOT NULL,
	"query" text NOT NULL,
	"limit" integer NOT NULL,
	"after_display_name" text NOT NULL,
	"after_food_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_search_cursor_limit" CHECK ("catalog_search_cursor"."limit" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "catalog_version" (
	"version" text PRIMARY KEY NOT NULL,
	"nutrition_dataset_version" text NOT NULL,
	"rule_set_version" text NOT NULL,
	"data_mode" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"digest" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_version_data_mode" CHECK ("catalog_version"."data_mode" IN ('real','synthetic'))
);
--> statement-breakpoint
ALTER TABLE "catalog_food" ADD COLUMN "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_food" ADD COLUMN "nutrient_source_ids" jsonb DEFAULT '{"energyKcal":null,"carbohydrateG":null,"proteinG":null,"fatG":null,"fiberG":null,"sugarsG":null,"sodiumMg":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_condition" ADD CONSTRAINT "catalog_condition_catalog_version_catalog_version_version_fk" FOREIGN KEY ("catalog_version") REFERENCES "public"."catalog_version"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_search_cursor" ADD CONSTRAINT "catalog_search_cursor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_search_cursor" ADD CONSTRAINT "catalog_search_cursor_catalog_version_catalog_version_version_fk" FOREIGN KEY ("catalog_version") REFERENCES "public"."catalog_version"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_condition_search" ON "catalog_condition" USING btree ("catalog_version","display_name","condition_id");--> statement-breakpoint
CREATE INDEX "catalog_search_cursor_expiry" ON "catalog_search_cursor" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_version_one_current" ON "catalog_version" USING btree ("is_current") WHERE "catalog_version"."is_current";--> statement-breakpoint
ALTER TABLE "catalog_food" ADD CONSTRAINT "catalog_food_version_catalog_version_version_fk" FOREIGN KEY ("version") REFERENCES "public"."catalog_version"("version") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER catalog_condition_immutable BEFORE UPDATE OR DELETE ON catalog_condition FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
--> statement-breakpoint
CREATE FUNCTION carin_guard_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.version, NEW.nutrition_dataset_version, NEW.rule_set_version, NEW.data_mode, NEW.published_at, NEW.digest, NEW.created_at)
    IS DISTINCT FROM
    (OLD.version, OLD.nutrition_dataset_version, OLD.rule_set_version, OLD.data_mode, OLD.published_at, OLD.digest, OLD.created_at) THEN
    RAISE EXCEPTION 'Catalog version metadata is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER catalog_version_metadata_immutable BEFORE UPDATE ON catalog_version FOR EACH ROW EXECUTE FUNCTION carin_guard_catalog_version();
--> statement-breakpoint
CREATE TRIGGER catalog_version_delete_immutable BEFORE DELETE ON catalog_version FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
