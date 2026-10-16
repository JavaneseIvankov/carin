CREATE TABLE "demo_seed_resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"seed_key" text NOT NULL,
	"resource_kind" text NOT NULL,
	"payload_hash" text NOT NULL,
	"resource_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_seed_resource_user_key" UNIQUE("user_id","seed_key"),
	CONSTRAINT "demo_seed_resource_state" CHECK ("demo_seed_resource"."state" IN ('pending','complete')),
	CONSTRAINT "demo_seed_resource_key_nonempty" CHECK (length("demo_seed_resource"."seed_key") > 0)
);
--> statement-breakpoint
ALTER TABLE "demo_seed_resource" ADD CONSTRAINT "demo_seed_resource_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_seed_resource_user_kind" ON "demo_seed_resource" USING btree ("user_id","resource_kind");