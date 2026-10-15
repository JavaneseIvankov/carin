CREATE TABLE "photo_upload_operation" (
	"photo_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"reservation_token" uuid NOT NULL,
	"state" text NOT NULL,
	"fence_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_upload_operation_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "photo_upload_operation_state" CHECK ("photo_upload_operation"."state" IN ('reserved','in_flight'))
);
--> statement-breakpoint
ALTER TABLE "photo_upload_operation" ADD CONSTRAINT "photo_upload_operation_user_id_photo_id_photo_user_id_id_fk" FOREIGN KEY ("user_id","photo_id") REFERENCES "public"."photo"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_upload_operation_drain" ON "photo_upload_operation" USING btree ("user_id","state","fence_until");