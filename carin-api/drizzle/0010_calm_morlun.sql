ALTER TABLE "deletion_task" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "deletion_task" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "deletion_task" ADD CONSTRAINT "deletion_request_hash" CHECK ("deletion_task"."request_hash" IS NULL OR "deletion_task"."request_hash" ~ '^[a-f0-9]{64}$');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION carin_guard_account_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.birth_date, NEW.accepted_terms_version, NEW.accepted_privacy_version, NEW.accepted_at)
    IS DISTINCT FROM (OLD.birth_date, OLD.accepted_terms_version, OLD.accepted_privacy_version, OLD.accepted_at)
    AND NOT (
      OLD.deletion_status = 'active' AND NEW.deletion_status = 'deleting'
      AND NEW.name = 'Deleted account'
      AND NEW.email = OLD.id::text || '@deleted.invalid'
      AND NEW.email_verified = false AND NEW.image IS NULL
      AND NEW.birth_date = '1900-01-01'
      AND NEW.accepted_terms_version = 'deleted'
      AND NEW.accepted_privacy_version = 'deleted'
    ) THEN
    RAISE EXCEPTION 'Registration metadata is read-only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION carin_guard_active_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "user" WHERE id = NEW.user_id AND deletion_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot create a session for an inactive account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER session_requires_active_user BEFORE INSERT ON "session" FOR EACH ROW EXECUTE FUNCTION carin_guard_active_session();
