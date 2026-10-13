ALTER TABLE "analysis_job" ADD COLUMN "started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "analysis_job" ADD COLUMN "finished_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "analysis_job"
SET "started_at" = "created_at"
WHERE "started_at" IS NULL
  AND ("attempts" > 0 OR "status" = 'completed');
--> statement-breakpoint
UPDATE "analysis_job"
SET "finished_at" = "updated_at"
WHERE "finished_at" IS NULL
  AND "status" IN ('completed', 'failed', 'cancelled');
