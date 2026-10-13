CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"birth_date" text NOT NULL,
	"accepted_terms_version" text NOT NULL,
	"accepted_privacy_version" text NOT NULL,
	"accepted_at" timestamp NOT NULL,
	"deletion_status" text DEFAULT 'active' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"profile_snapshot_id" uuid NOT NULL,
	"scan_id" uuid,
	"consumption_id" uuid,
	"based_on_result_id" uuid,
	"target_revision" integer NOT NULL,
	"target_generation" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"deadline_at" timestamp with time zone DEFAULT now() + interval '5 minutes' NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_job_operation_id_unique" UNIQUE("operation_id"),
	CONSTRAINT "job_owner" UNIQUE("user_id","id"),
	CONSTRAINT "job_kind" CHECK ("analysis_job"."kind" IN ('photo_analysis','correction','consumption_evaluation')),
	CONSTRAINT "job_status" CHECK ("analysis_job"."status" IN ('queued','processing','completed','failed','cancelled')),
	CONSTRAINT "job_revision_attempt" CHECK ("analysis_job"."target_revision" >= 1 AND "analysis_job"."target_generation" >= 1 AND "analysis_job"."attempts" >= 0 AND "analysis_job"."max_attempts" > 0 AND "analysis_job"."attempts" <= "analysis_job"."max_attempts"),
	CONSTRAINT "job_target" CHECK (("analysis_job"."scan_id" IS NOT NULL AND "analysis_job"."consumption_id" IS NULL AND "analysis_job"."kind" IN ('photo_analysis','correction')) OR ("analysis_job"."scan_id" IS NULL AND "analysis_job"."consumption_id" IS NOT NULL AND "analysis_job"."kind" = 'consumption_evaluation')),
	CONSTRAINT "job_processing_lease" CHECK ("analysis_job"."status" <> 'processing' OR ("analysis_job"."lease_token" IS NOT NULL AND "analysis_job"."lease_expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "analysis_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"profile_snapshot_id" uuid NOT NULL,
	"catalog_version" text NOT NULL,
	"rule_version" text NOT NULL,
	"output" jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_result_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "result_owner" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "catalog_food" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"display_name" text NOT NULL,
	"preparation" text,
	"energy_kcal" numeric(20, 6),
	"carbohydrate_g" numeric(20, 6),
	"protein_g" numeric(20, 6),
	"fat_g" numeric(20, 6),
	"fiber_g" numeric(20, 6),
	"sugars_g" numeric(20, 6),
	"sodium_mg" numeric(20, 6),
	"source_refs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_food_version_id_pk" PRIMARY KEY("version","id"),
	CONSTRAINT "catalog_nutrients_nonnegative" CHECK (("catalog_food"."energy_kcal" IS NULL OR "catalog_food"."energy_kcal" >= 0 AND "catalog_food"."energy_kcal" <> 'NaN'::numeric) AND ("catalog_food"."carbohydrate_g" IS NULL OR "catalog_food"."carbohydrate_g" >= 0 AND "catalog_food"."carbohydrate_g" <> 'NaN'::numeric) AND ("catalog_food"."protein_g" IS NULL OR "catalog_food"."protein_g" >= 0 AND "catalog_food"."protein_g" <> 'NaN'::numeric) AND ("catalog_food"."fat_g" IS NULL OR "catalog_food"."fat_g" >= 0 AND "catalog_food"."fat_g" <> 'NaN'::numeric) AND ("catalog_food"."fiber_g" IS NULL OR "catalog_food"."fiber_g" >= 0 AND "catalog_food"."fiber_g" <> 'NaN'::numeric) AND ("catalog_food"."sugars_g" IS NULL OR "catalog_food"."sugars_g" >= 0 AND "catalog_food"."sugars_g" <> 'NaN'::numeric) AND ("catalog_food"."sodium_mg" IS NULL OR "catalog_food"."sodium_mg" >= 0 AND "catalog_food"."sodium_mg" <> 'NaN'::numeric))
);
--> statement-breakpoint
CREATE TABLE "catalog_serving" (
	"id" text NOT NULL,
	"catalog_version" text NOT NULL,
	"food_id" text NOT NULL,
	"label" text NOT NULL,
	"grams" numeric(20, 6) NOT NULL,
	"source_refs" jsonb NOT NULL,
	CONSTRAINT "catalog_serving_catalog_version_food_id_id_pk" PRIMARY KEY("catalog_version","food_id","id"),
	CONSTRAINT "serving_grams_positive" CHECK ("catalog_serving"."grams" > 0 AND "catalog_serving"."grams" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "consent_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"granted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_kind" CHECK ("consent_event"."kind" IN ('terms','privacy','ai_processing'))
);
--> statement-breakpoint
CREATE TABLE "consumption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"confirmation_mode" text DEFAULT 'default' NOT NULL,
	"scan_id" uuid,
	"source_analysis_result_id" uuid,
	"current_snapshot_id" uuid,
	"photo_available" boolean DEFAULT false NOT NULL,
	"canonical_input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consumed_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "consumption_owner" UNIQUE("user_id","id"),
	CONSTRAINT "consumption_owner_revision" UNIQUE("user_id","id","revision"),
	CONSTRAINT "consumption_revision" CHECK ("consumption"."revision" >= 1 AND "consumption"."generation" >= 1),
	CONSTRAINT "consumption_source" CHECK ("consumption"."source" IN ('manual','photo_confirmation') AND ("consumption"."source" <> 'manual' OR ("consumption"."scan_id" IS NULL AND "consumption"."source_analysis_result_id" IS NULL))),
	CONSTRAINT "consumption_confirmation_mode" CHECK ("consumption"."confirmation_mode" IN ('default','new_occurrence'))
);
--> statement-breakpoint
CREATE TABLE "consumption_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consumption_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"state" text DEFAULT 'not_requested' NOT NULL,
	"job_id" uuid,
	"result_id" uuid,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_snapshot" UNIQUE("snapshot_id"),
	CONSTRAINT "evaluation_state" CHECK ("consumption_evaluation"."state" IN ('not_requested','pending','completed','failed'))
);
--> statement-breakpoint
CREATE TABLE "consumption_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consumption_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"profile_snapshot_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumption_snapshot_revision" UNIQUE("consumption_id","revision"),
	CONSTRAINT "consumption_snapshot_pointer" UNIQUE("user_id","consumption_id","revision","id"),
	CONSTRAINT "consumption_snapshot_revision_positive" CHECK ("consumption_snapshot"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "deletion_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"object_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_kind" CHECK ("deletion_task"."kind" IN ('account','photo')),
	CONSTRAINT "deletion_status" CHECK ("deletion_task"."status" IN ('queued','processing','failed')),
	CONSTRAINT "deletion_attempts" CHECK ("deletion_task"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "email_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"delivery_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_task_delivery_key_unique" UNIQUE("delivery_key"),
	CONSTRAINT "email_kind" CHECK ("email_task"."kind" IN ('verification','password_reset')),
	CONSTRAINT "email_status" CHECK ("email_task"."status" IN ('queued','processing','failed')),
	CONSTRAINT "email_attempts" CHECK ("email_task"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "examination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"context" text,
	"series_key" text NOT NULL,
	"measured_on" date NOT NULL,
	"measured_time" text,
	"timezone" text NOT NULL,
	"value" numeric(20, 6),
	"systolic" integer,
	"diastolic" integer,
	"unit" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "exam_revision" CHECK ("examination"."revision" >= 1),
	CONSTRAINT "exam_time" CHECK ("examination"."measured_time" IS NULL OR "examination"."measured_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "exam_measurements" CHECK (("examination"."type" = 'pressure' AND "examination"."unit" = 'mmHg' AND "examination"."systolic" > 0 AND "examination"."diastolic" > 0 AND "examination"."systolic" IS NOT NULL AND "examination"."diastolic" IS NOT NULL AND "examination"."value" IS NULL AND "examination"."subtype" IS NULL AND "examination"."context" IS NULL) OR ("examination"."type" = 'glucose' AND "examination"."unit" = 'mg/dL' AND "examination"."value" > 0 AND "examination"."value" <> 'NaN'::numeric AND "examination"."value" IS NOT NULL AND "examination"."context" IN ('fasting','random','post_meal','unknown') AND "examination"."context" IS NOT NULL AND "examination"."subtype" IS NULL AND "examination"."systolic" IS NULL AND "examination"."diastolic" IS NULL) OR ("examination"."type" = 'cholesterol' AND "examination"."unit" = 'mg/dL' AND "examination"."value" > 0 AND "examination"."value" <> 'NaN'::numeric AND "examination"."value" IS NOT NULL AND "examination"."subtype" IN ('total','ldl','hdl') AND "examination"."subtype" IS NOT NULL AND "examination"."context" IS NULL AND "examination"."systolic" IS NULL AND "examination"."diastolic" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "health_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"height_cm" numeric(20, 6),
	"weight_kg" numeric(20, 6),
	"sex_for_reference" text,
	"clinician_notes" text,
	"activity" text,
	"smoking" text,
	"diagnosis_state" text DEFAULT 'not_provided' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"family_history_state" text DEFAULT 'not_provided' NOT NULL,
	"family_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allergy_state" text DEFAULT 'not_provided' NOT NULL,
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_version_positive" CHECK ("health_profile"."version" >= 1),
	CONSTRAINT "profile_measurements_positive" CHECK (("health_profile"."height_cm" IS NULL OR "health_profile"."height_cm" > 0 AND "health_profile"."height_cm" <> 'NaN'::numeric) AND ("health_profile"."weight_kg" IS NULL OR "health_profile"."weight_kg" > 0 AND "health_profile"."weight_kg" <> 'NaN'::numeric)),
	CONSTRAINT "profile_activity" CHECK ("health_profile"."activity" IS NULL OR "health_profile"."activity" IN ('sedentary','light','moderate','high')),
	CONSTRAINT "profile_smoking" CHECK ("health_profile"."smoking" IS NULL OR "health_profile"."smoking" IN ('never','former','current')),
	CONSTRAINT "profile_sex" CHECK ("health_profile"."sex_for_reference" IS NULL OR "health_profile"."sex_for_reference" IN ('female','male')),
	CONSTRAINT "profile_diagnosis" CHECK ("health_profile"."diagnosis_state" IN ('not_provided','none_known','never_examined','reported') AND jsonb_typeof("health_profile"."conditions") = 'array' AND (("health_profile"."diagnosis_state" = 'reported') = (jsonb_array_length("health_profile"."conditions") > 0))),
	CONSTRAINT "profile_family" CHECK ("health_profile"."family_history_state" IN ('not_provided','unknown','none_known','reported') AND jsonb_typeof("health_profile"."family_history") = 'array' AND (("health_profile"."family_history_state" = 'reported') = (jsonb_array_length("health_profile"."family_history") > 0))),
	CONSTRAINT "profile_allergies" CHECK ("health_profile"."allergy_state" IN ('not_provided','unknown','none_known','reported') AND jsonb_typeof("health_profile"."allergies") = 'array' AND (("health_profile"."allergy_state" = 'reported') = (jsonb_array_length("health_profile"."allergies") > 0)))
);
--> statement-breakpoint
CREATE TABLE "idempotency_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"action_scope" text NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	CONSTRAINT "idempotency_scope_key" UNIQUE("user_id","session_id","action_scope","key"),
	CONSTRAINT "idempotency_status" CHECK ("idempotency_record"."response_status" IS NULL OR "idempotency_record"."response_status" BETWEEN 100 AND 599)
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"checksum" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"lifecycle" text DEFAULT 'uploaded' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "photo_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "photo_owner" UNIQUE("user_id","id"),
	CONSTRAINT "photo_type" CHECK ("photo"."mime_type" IN ('image/jpeg','image/png')),
	CONSTRAINT "photo_size" CHECK ("photo"."size_bytes" > 0 AND "photo"."size_bytes" <= 10485760),
	CONSTRAINT "photo_lifecycle" CHECK ("photo"."lifecycle" IN ('uploaded','attached','deleting','deleted'))
);
--> statement-breakpoint
CREATE TABLE "profile_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_version" integer NOT NULL,
	"context" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_snapshot_owner" UNIQUE("user_id","id"),
	CONSTRAINT "snapshot_profile_version" CHECK ("profile_snapshot"."profile_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"photo_id" uuid,
	"profile_snapshot_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"current_result_id" uuid,
	"latest_job_id" uuid,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "scan_owner" UNIQUE("user_id","id"),
	CONSTRAINT "scan_photo_root" UNIQUE("photo_id"),
	CONSTRAINT "scan_revision" CHECK ("scan"."revision" >= 1 AND "scan"."generation" >= 1),
	CONSTRAINT "scan_lifecycle" CHECK ("scan"."lifecycle" IN ('active','deleting','deleted'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_consumption_id_consumption_id_fk" FOREIGN KEY ("consumption_id") REFERENCES "public"."consumption"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_based_on_result_id_analysis_result_id_fk" FOREIGN KEY ("based_on_result_id") REFERENCES "public"."analysis_result"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_user_id_scan_id_scan_user_id_id_fk" FOREIGN KEY ("user_id","scan_id") REFERENCES "public"."scan"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_user_id_consumption_id_consumption_user_id_id_fk" FOREIGN KEY ("user_id","consumption_id") REFERENCES "public"."consumption"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_user_id_profile_snapshot_id_profile_snapshot_user_id_id_fk" FOREIGN KEY ("user_id","profile_snapshot_id") REFERENCES "public"."profile_snapshot"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_user_id_based_on_result_id_analysis_result_user_id_id_fk" FOREIGN KEY ("user_id","based_on_result_id") REFERENCES "public"."analysis_result"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_job_id_analysis_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."analysis_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_user_id_job_id_analysis_job_user_id_id_fk" FOREIGN KEY ("user_id","job_id") REFERENCES "public"."analysis_job"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_user_id_profile_snapshot_id_profile_snapshot_user_id_id_fk" FOREIGN KEY ("user_id","profile_snapshot_id") REFERENCES "public"."profile_snapshot"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_serving" ADD CONSTRAINT "catalog_serving_catalog_version_food_id_catalog_food_version_id_fk" FOREIGN KEY ("catalog_version","food_id") REFERENCES "public"."catalog_food"("version","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_event" ADD CONSTRAINT "consent_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_source_analysis_result_id_analysis_result_id_fk" FOREIGN KEY ("source_analysis_result_id") REFERENCES "public"."analysis_result"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_current_snapshot_id_consumption_snapshot_id_fk" FOREIGN KEY ("current_snapshot_id") REFERENCES "public"."consumption_snapshot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_user_id_scan_id_scan_user_id_id_fk" FOREIGN KEY ("user_id","scan_id") REFERENCES "public"."scan"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_user_id_source_analysis_result_id_analysis_result_user_id_id_fk" FOREIGN KEY ("user_id","source_analysis_result_id") REFERENCES "public"."analysis_result"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_user_id_id_revision_current_snapshot_id_consumption_snapshot_user_id_consumption_id_revision_id_fk" FOREIGN KEY ("user_id","id","revision","current_snapshot_id") REFERENCES "public"."consumption_snapshot"("user_id","consumption_id","revision","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_evaluation" ADD CONSTRAINT "consumption_evaluation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_evaluation" ADD CONSTRAINT "consumption_evaluation_consumption_id_consumption_id_fk" FOREIGN KEY ("consumption_id") REFERENCES "public"."consumption"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_evaluation" ADD CONSTRAINT "consumption_evaluation_snapshot_id_consumption_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."consumption_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_evaluation" ADD CONSTRAINT "consumption_evaluation_job_id_analysis_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."analysis_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_evaluation" ADD CONSTRAINT "consumption_evaluation_result_id_analysis_result_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."analysis_result"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_evaluation" ADD CONSTRAINT "consumption_evaluation_user_id_consumption_id_revision_snapshot_id_consumption_snapshot_user_id_consumption_id_revision_id_fk" FOREIGN KEY ("user_id","consumption_id","revision","snapshot_id") REFERENCES "public"."consumption_snapshot"("user_id","consumption_id","revision","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_evaluation" ADD CONSTRAINT "consumption_evaluation_user_id_job_id_analysis_job_user_id_id_fk" FOREIGN KEY ("user_id","job_id") REFERENCES "public"."analysis_job"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_evaluation" ADD CONSTRAINT "consumption_evaluation_user_id_result_id_analysis_result_user_id_id_fk" FOREIGN KEY ("user_id","result_id") REFERENCES "public"."analysis_result"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_snapshot" ADD CONSTRAINT "consumption_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_snapshot" ADD CONSTRAINT "consumption_snapshot_consumption_id_consumption_id_fk" FOREIGN KEY ("consumption_id") REFERENCES "public"."consumption"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_snapshot" ADD CONSTRAINT "consumption_snapshot_user_id_consumption_id_consumption_user_id_id_fk" FOREIGN KEY ("user_id","consumption_id") REFERENCES "public"."consumption"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_snapshot" ADD CONSTRAINT "consumption_snapshot_user_id_profile_snapshot_id_profile_snapshot_user_id_id_fk" FOREIGN KEY ("user_id","profile_snapshot_id") REFERENCES "public"."profile_snapshot"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_task" ADD CONSTRAINT "deletion_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_task" ADD CONSTRAINT "email_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination" ADD CONSTRAINT "examination_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_profile" ADD CONSTRAINT "health_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_snapshot" ADD CONSTRAINT "profile_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_current_result_id_analysis_result_id_fk" FOREIGN KEY ("current_result_id") REFERENCES "public"."analysis_result"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_latest_job_id_analysis_job_id_fk" FOREIGN KEY ("latest_job_id") REFERENCES "public"."analysis_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_user_id_photo_id_photo_user_id_id_fk" FOREIGN KEY ("user_id","photo_id") REFERENCES "public"."photo"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_user_id_profile_snapshot_id_profile_snapshot_user_id_id_fk" FOREIGN KEY ("user_id","profile_snapshot_id") REFERENCES "public"."profile_snapshot"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_user_id_current_result_id_analysis_result_user_id_id_fk" FOREIGN KEY ("user_id","current_result_id") REFERENCES "public"."analysis_result"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_user_id_latest_job_id_analysis_job_user_id_id_fk" FOREIGN KEY ("user_id","latest_job_id") REFERENCES "public"."analysis_job"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "job_queue" ON "analysis_job" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "job_lease" ON "analysis_job" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "catalog_search" ON "catalog_food" USING btree ("version","display_name","id");--> statement-breakpoint
CREATE INDEX "consent_latest" ON "consent_event" USING btree ("user_id","kind","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "consumption_active_default_confirmation" ON "consumption" USING btree ("scan_id") WHERE "consumption"."source" = 'photo_confirmation' AND "consumption"."confirmation_mode" = 'default' AND "consumption"."deleted_at" IS NULL AND "consumption"."scan_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "consumption_history" ON "consumption" USING btree ("user_id","consumed_at","id");--> statement-breakpoint
CREATE INDEX "deletion_queue" ON "deletion_task" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_queue" ON "email_task" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "exam_series_history" ON "examination" USING btree ("user_id","series_key","measured_on","id");--> statement-breakpoint
CREATE INDEX "idempotency_expiry" ON "idempotency_record" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "photo_orphan_cleanup" ON "photo" USING btree ("lifecycle","created_at");--> statement-breakpoint
CREATE INDEX "scan_history" ON "scan" USING btree ("user_id","created_at","id");