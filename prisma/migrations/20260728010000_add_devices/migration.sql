-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "department_id" UUID,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serial_no" TEXT,
    "inventory_no" TEXT,
    "category" TEXT,
    "qr_epc" TEXT,
    "passport_no" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source_system" TEXT,
    "source_base_id" TEXT,
    "source_table_name" TEXT,
    "source_record_id" TEXT,
    "source_updated_at" TIMESTAMPTZ(3),
    "source_payload_hash" TEXT,
    "source_deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "devices_identifier_check" CHECK (
      NULLIF(BTRIM("serial_no"), '') IS NOT NULL
      OR NULLIF(BTRIM("inventory_no"), '') IS NOT NULL
    )
);

CREATE INDEX "devices_hospital_id_idx" ON "devices"("hospital_id");
CREATE INDEX "devices_hospital_id_department_id_idx" ON "devices"("hospital_id", "department_id");
CREATE INDEX "devices_hospital_id_active_idx" ON "devices"("hospital_id", "active");
CREATE INDEX "devices_hospital_id_serial_no_idx" ON "devices"("hospital_id", "serial_no");
CREATE INDEX "devices_hospital_id_inventory_no_idx" ON "devices"("hospital_id", "inventory_no");
CREATE INDEX "devices_name_idx" ON "devices"("name");

CREATE UNIQUE INDEX "devices_hospital_id_serial_no_key"
ON "devices"("hospital_id", "serial_no")
WHERE "serial_no" IS NOT NULL;

CREATE UNIQUE INDEX "devices_hospital_id_inventory_no_key"
ON "devices"("hospital_id", "inventory_no")
WHERE "inventory_no" IS NOT NULL;

ALTER TABLE "devices" ADD CONSTRAINT "devices_hospital_id_fkey"
FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "devices" ADD CONSTRAINT "devices_department_id_hospital_id_fkey"
FOREIGN KEY ("department_id", "hospital_id")
REFERENCES "departments"("id", "hospital_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
