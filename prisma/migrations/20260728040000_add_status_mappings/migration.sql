CREATE TYPE "status_mapping_source_entity_type" AS ENUM ('REPAIR', 'INSPECTION');

CREATE TABLE "status_mappings" (
    "id" UUID NOT NULL,
    "source_entity_type" "status_mapping_source_entity_type" NOT NULL,
    "source_status" VARCHAR(200) NOT NULL,
    "customer_status_code" VARCHAR(100) NOT NULL,
    "customer_label" VARCHAR(200) NOT NULL,
    "email_template_id" VARCHAR(100),
    "send_email" BOOLEAN NOT NULL DEFAULT false,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "requires_action" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "status_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "status_mappings_source_entity_type_source_status_key"
ON "status_mappings"("source_entity_type", "source_status");

CREATE UNIQUE INDEX "status_mappings_source_entity_type_source_status_ci_key"
ON "status_mappings"("source_entity_type", LOWER(BTRIM("source_status")));

CREATE INDEX "status_mappings_source_entity_type_idx"
ON "status_mappings"("source_entity_type");

CREATE INDEX "status_mappings_active_idx"
ON "status_mappings"("active");

CREATE INDEX "status_mappings_customer_status_code_idx"
ON "status_mappings"("customer_status_code");

CREATE INDEX "status_mappings_send_email_idx"
ON "status_mappings"("send_email");
