CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "business_number" VARCHAR(100) NOT NULL,
    "customer_status_code" TEXT NOT NULL,
    "customer_label" TEXT NOT NULL,
    "result" TEXT,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "planned_at" TIMESTAMPTZ(3),
    "performed_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3),
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
    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inspections_business_number_trimmed_check"
      CHECK ("business_number" = BTRIM("business_number") AND LENGTH("business_number") > 0)
);

CREATE UNIQUE INDEX "inspections_business_number_key" ON "inspections"("business_number");
CREATE INDEX "inspections_device_id_idx" ON "inspections"("device_id");
CREATE INDEX "inspections_customer_status_code_idx" ON "inspections"("customer_status_code");
CREATE INDEX "inspections_is_terminal_idx" ON "inspections"("is_terminal");
CREATE INDEX "inspections_planned_at_idx" ON "inspections"("planned_at");
CREATE INDEX "inspections_due_at_idx" ON "inspections"("due_at");
CREATE INDEX "inspections_completed_at_idx" ON "inspections"("completed_at");
CREATE INDEX "inspections_updated_at_idx" ON "inspections"("updated_at");

ALTER TABLE "inspections" ADD CONSTRAINT "inspections_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "devices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
