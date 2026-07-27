ALTER TABLE "user_sessions"
ADD COLUMN "active_hospital_id" UUID;

CREATE INDEX "user_sessions_active_hospital_id_idx"
ON "user_sessions"("active_hospital_id");

ALTER TABLE "user_sessions"
ADD CONSTRAINT "user_sessions_active_hospital_id_fkey"
FOREIGN KEY ("active_hospital_id")
REFERENCES "hospitals"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
