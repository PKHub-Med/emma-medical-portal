ALTER TABLE "users"
ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN "deleted_by_user_id" UUID;

CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX "users_deleted_by_user_id_idx" ON "users"("deleted_by_user_id");

ALTER TABLE "users"
ADD CONSTRAINT "users_deleted_by_user_id_fkey"
FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
