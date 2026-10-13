ALTER TABLE "catalog_version" ADD COLUMN "activation_generation" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION carin_guard_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.version, NEW.nutrition_dataset_version, NEW.rule_set_version, NEW.data_mode, NEW.published_at, NEW.digest, NEW.created_at)
    IS DISTINCT FROM
    (OLD.version, OLD.nutrition_dataset_version, OLD.rule_set_version, OLD.data_mode, OLD.published_at, OLD.digest, OLD.created_at) THEN
    RAISE EXCEPTION 'Catalog version metadata is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.activation_generation IS DISTINCT FROM OLD.activation_generation THEN
    IF OLD.is_current OR NOT NEW.is_current OR NEW.activation_generation <= OLD.activation_generation THEN
      RAISE EXCEPTION 'Catalog activation generation must increase when activating a version' USING ERRCODE = '23514';
    END IF;
  ELSIF NOT OLD.is_current AND NEW.is_current THEN
    RAISE EXCEPTION 'Catalog activation must advance its generation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
