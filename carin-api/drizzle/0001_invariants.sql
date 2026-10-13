-- Hand-reviewed application invariants; auth tables above are CLI-generated.
CREATE FUNCTION carin_reject_snapshot_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable historical data must be replaced with a new revision' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profile_snapshot_immutable BEFORE UPDATE ON profile_snapshot FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
--> statement-breakpoint
CREATE TRIGGER analysis_result_immutable BEFORE UPDATE ON analysis_result FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
--> statement-breakpoint
CREATE TRIGGER consumption_snapshot_immutable BEFORE UPDATE ON consumption_snapshot FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
--> statement-breakpoint
CREATE TRIGGER catalog_food_immutable BEFORE UPDATE OR DELETE ON catalog_food FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
--> statement-breakpoint
CREATE TRIGGER catalog_serving_immutable BEFORE UPDATE OR DELETE ON catalog_serving FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
--> statement-breakpoint
CREATE TRIGGER consent_event_immutable BEFORE UPDATE ON consent_event FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
--> statement-breakpoint
CREATE FUNCTION carin_guard_job_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.user_id, NEW.operation_id, NEW.kind, NEW.input_snapshot, NEW.profile_snapshot_id, NEW.target_revision, NEW.target_generation)
    IS DISTINCT FROM
    (OLD.user_id, OLD.operation_id, OLD.kind, OLD.input_snapshot, OLD.profile_snapshot_id, OLD.target_revision, OLD.target_generation) THEN
    RAISE EXCEPTION 'Job input/generation snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER analysis_job_snapshot_immutable BEFORE UPDATE ON analysis_job FOR EACH ROW EXECUTE FUNCTION carin_guard_job_snapshot();
--> statement-breakpoint
CREATE FUNCTION carin_guard_account_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.birth_date, NEW.accepted_terms_version, NEW.accepted_privacy_version, NEW.accepted_at)
    IS DISTINCT FROM (OLD.birth_date, OLD.accepted_terms_version, OLD.accepted_privacy_version, OLD.accepted_at) THEN
    RAISE EXCEPTION 'Registration metadata is read-only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_registration_metadata_immutable BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION carin_guard_account_metadata();
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_birth_date_format CHECK (birth_date ~ '^\d{4}-\d{2}-\d{2}$' AND birth_date::date::text = birth_date);
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_deletion_status CHECK (deletion_status IN ('active','deleting'));
--> statement-breakpoint
CREATE FUNCTION carin_guard_idempotency_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM session WHERE id = NEW.session_id AND user_id = NEW.user_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session does not belong to resource owner' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER idempotency_session_owner BEFORE INSERT OR UPDATE OF user_id, session_id ON idempotency_record FOR EACH ROW EXECUTE FUNCTION carin_guard_idempotency_owner();
--> statement-breakpoint
-- A nullable source pointer uses a scalar SET NULL FK plus composite NO ACTION
-- ownership FK. PostgreSQL checks the latter after scalar detachment; user_id
-- stays non-null. Source provenance lives in consumption_snapshot, not the FK.
CREATE FUNCTION carin_detach_photo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scan_id IS NULL THEN NEW.photo_available = false; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER consumption_photo_detachment BEFORE INSERT OR UPDATE OF scan_id ON consumption FOR EACH ROW EXECUTE FUNCTION carin_detach_photo();
--> statement-breakpoint
-- Snapshot/revision publication can be assembled in any order inside one
-- transaction, but must be consistent by commit.
ALTER TABLE consumption ALTER CONSTRAINT consumption_user_id_id_revision_current_snapshot_id_consumption_snapshot_user_id_consumption_id_revision_id_fk DEFERRABLE INITIALLY DEFERRED;

--> statement-breakpoint
ALTER TABLE consumption ALTER CONSTRAINT consumption_current_snapshot_id_consumption_snapshot_id_fk DEFERRABLE INITIALLY DEFERRED;
