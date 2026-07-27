CREATE TYPE "audit_outcome" AS ENUM ('SUCCESS', 'FAILURE');

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "outcome" "audit_outcome" NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "hospital_id" UUID,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_hospital_id_fkey"
FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");
CREATE INDEX "audit_events_actor_id_created_at_idx" ON "audit_events"("actor_id", "created_at");
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events"("action", "created_at");
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");
CREATE INDEX "audit_events_hospital_id_created_at_idx" ON "audit_events"("hospital_id", "created_at");
CREATE INDEX "audit_events_outcome_created_at_idx" ON "audit_events"("outcome", "created_at");
