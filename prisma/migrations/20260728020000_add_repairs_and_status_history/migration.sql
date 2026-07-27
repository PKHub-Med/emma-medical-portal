CREATE TYPE "status_history_entity_type" AS ENUM ('REPAIR', 'INSPECTION');

CREATE TABLE "repairs" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "business_number" VARCHAR(100) NOT NULL,
    "customer_status_code" TEXT NOT NULL,
    "customer_label" TEXT NOT NULL,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "reported_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "customer_description" TEXT,
    "source_system" TEXT,
    "source_base_id" TEXT,
    "source_table_name" TEXT,
    "source_record_id" TEXT,
    "source_status" TEXT,
    "source_updated_at" TIMESTAMPTZ(3),
    "source_payload_hash" TEXT,
    "source_deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "repairs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "repairs_business_number_trimmed_check"
      CHECK ("business_number" = BTRIM("business_number") AND LENGTH("business_number") > 0)
);

CREATE TABLE "status_history" (
    "id" UUID NOT NULL,
    "entity_type" "status_history_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "old_status_code" TEXT,
    "old_label" TEXT,
    "new_status_code" TEXT NOT NULL,
    "new_label" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "repairs_business_number_key" ON "repairs"("business_number");
CREATE INDEX "repairs_device_id_idx" ON "repairs"("device_id");
CREATE INDEX "repairs_is_terminal_idx" ON "repairs"("is_terminal");
CREATE INDEX "repairs_customer_status_code_idx" ON "repairs"("customer_status_code");
CREATE INDEX "repairs_reported_at_idx" ON "repairs"("reported_at");
CREATE INDEX "repairs_updated_at_idx" ON "repairs"("updated_at");
CREATE INDEX "status_history_entity_changed_at_idx"
  ON "status_history"("entity_type", "entity_id", "changed_at");
CREATE INDEX "status_history_changed_at_idx" ON "status_history"("changed_at");

ALTER TABLE "repairs" ADD CONSTRAINT "repairs_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "devices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
