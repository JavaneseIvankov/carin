-- settings_revision was generated from the canonical Better Auth additional
-- field. The application owns the positive revision invariant, as with profiles.
ALTER TABLE "user" ADD CONSTRAINT user_settings_revision_positive CHECK (settings_revision >= 1);
