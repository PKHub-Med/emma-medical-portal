CREATE TABLE "contacts" (
  "id" UUID NOT NULL,
  "hospital_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "phone" TEXT,
  "job_title" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "linked_user_id" UUID,
  "source_system" TEXT,
  "source_base_id" TEXT,
  "source_table_name" TEXT,
  "source_record_id" TEXT,
  "source_updated_at" TIMESTAMPTZ(3),
  "source_payload_hash" TEXT,
  "source_deleted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communication_settings" (
  "id" UUID NOT NULL,
  "hospital_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "primary_contact_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "communication_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communication_recipients" (
  "id" UUID NOT NULL,
  "communication_settings_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contacts_hospital_id_email_key" ON "contacts"("hospital_id", "email");
CREATE INDEX "contacts_hospital_id_idx" ON "contacts"("hospital_id");
CREATE INDEX "contacts_hospital_id_active_idx" ON "contacts"("hospital_id", "active");
CREATE INDEX "contacts_linked_user_id_idx" ON "contacts"("linked_user_id");
CREATE INDEX "contacts_email_idx" ON "contacts"("email");
CREATE UNIQUE INDEX "communication_settings_hospital_id_key" ON "communication_settings"("hospital_id");
CREATE INDEX "communication_settings_primary_contact_id_idx" ON "communication_settings"("primary_contact_id");
CREATE UNIQUE INDEX "communication_recipients_settings_contact_key" ON "communication_recipients"("communication_settings_id", "contact_id");
CREATE INDEX "communication_recipients_contact_id_idx" ON "communication_recipients"("contact_id");

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_hospital_id_fkey"
  FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_linked_user_id_fkey"
  FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_settings" ADD CONSTRAINT "communication_settings_hospital_id_fkey"
  FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_settings" ADD CONSTRAINT "communication_settings_primary_contact_id_fkey"
  FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_communication_settings_id_fkey"
  FOREIGN KEY ("communication_settings_id") REFERENCES "communication_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
