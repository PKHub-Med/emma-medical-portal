CREATE TYPE "notification_entity_type" AS ENUM ('REPAIR', 'INSPECTION');
CREATE TYPE "notification_event_type" AS ENUM ('STATUS_CHANGED');
CREATE TYPE "notification_event_status" AS ENUM ('PENDING', 'READY', 'BLOCKED', 'COMPLETED', 'FAILED');
CREATE TYPE "email_delivery_status" AS ENUM ('QUEUED', 'SKIPPED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED');

CREATE TABLE "notification_events" (
  "id" UUID NOT NULL,
  "event_key" TEXT NOT NULL,
  "hospital_id" UUID NOT NULL,
  "entity_type" "notification_entity_type" NOT NULL,
  "entity_id" UUID NOT NULL,
  "event_type" "notification_event_type" NOT NULL,
  "customer_status_code" TEXT NOT NULL,
  "customer_label" TEXT NOT NULL,
  "email_template_id" TEXT,
  "status" "notification_event_status" NOT NULL DEFAULT 'PENDING',
  "blocked_reason_code" TEXT,
  "blocked_reason_message" TEXT,
  "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "processed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_deliveries" (
  "id" UUID NOT NULL,
  "notification_event_id" UUID NOT NULL,
  "contact_id" UUID,
  "recipient_email" VARCHAR(320) NOT NULL,
  "recipient_name" TEXT,
  "status" "email_delivery_status" NOT NULL DEFAULT 'QUEUED',
  "provider_id" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "delivered_at" TIMESTAMPTZ(3),
  "bounced_at" TIMESTAMPTZ(3),
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_events_event_key_key" ON "notification_events"("event_key");
CREATE INDEX "notification_events_hospital_id_created_at_idx" ON "notification_events"("hospital_id", "created_at");
CREATE INDEX "notification_events_status_created_at_idx" ON "notification_events"("status", "created_at");
CREATE INDEX "notification_events_entity_type_entity_id_idx" ON "notification_events"("entity_type", "entity_id");
CREATE INDEX "notification_events_event_type_created_at_idx" ON "notification_events"("event_type", "created_at");
CREATE UNIQUE INDEX "email_deliveries_event_recipient_key" ON "email_deliveries"("notification_event_id", "recipient_email");
CREATE UNIQUE INDEX "email_deliveries_event_recipient_normalized_key" ON "email_deliveries"("notification_event_id", LOWER(BTRIM("recipient_email")));
CREATE INDEX "email_deliveries_notification_event_id_idx" ON "email_deliveries"("notification_event_id");
CREATE INDEX "email_deliveries_status_created_at_idx" ON "email_deliveries"("status", "created_at");
CREATE INDEX "email_deliveries_recipient_email_idx" ON "email_deliveries"("recipient_email");
CREATE INDEX "email_deliveries_provider_id_idx" ON "email_deliveries"("provider_id");

ALTER TABLE "notification_events"
  ADD CONSTRAINT "notification_events_hospital_id_fkey"
  FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_notification_event_id_fkey"
  FOREIGN KEY ("notification_event_id") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
