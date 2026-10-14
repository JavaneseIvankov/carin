CREATE TABLE "catalog_capability_manifest" (
	"catalog_version" text PRIMARY KEY NOT NULL,
	"manifest" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_capability_manifest" ADD CONSTRAINT "catalog_capability_manifest_catalog_version_catalog_version_version_fk" FOREIGN KEY ("catalog_version") REFERENCES "public"."catalog_version"("version") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER catalog_capability_manifest_immutable BEFORE UPDATE OR DELETE ON catalog_capability_manifest FOR EACH ROW EXECUTE FUNCTION carin_reject_snapshot_update();
