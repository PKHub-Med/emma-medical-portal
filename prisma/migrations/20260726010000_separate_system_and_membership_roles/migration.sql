BEGIN;

-- Add the system-wide role independently from hospital memberships.
CREATE TYPE "system_role" AS ENUM ('USER', 'EMMA_ADMIN', 'SERVICE_OPERATOR');

ALTER TABLE "users"
ADD COLUMN "system_role" "system_role" NOT NULL DEFAULT 'USER';

-- Preserve existing system roles on users before removing obsolete memberships.
-- If both legacy roles exist for one user, EMMA_ADMIN takes precedence.
UPDATE "users" AS "user"
SET
    "system_role" = CASE
        WHEN EXISTS (
            SELECT 1
            FROM "memberships" AS "membership"
            WHERE "membership"."user_id" = "user"."id"
              AND "membership"."role" = 'EMMA_ADMIN'
        ) THEN 'EMMA_ADMIN'::"system_role"
        WHEN EXISTS (
            SELECT 1
            FROM "memberships" AS "membership"
            WHERE "membership"."user_id" = "user"."id"
              AND "membership"."role" = 'SERVICE_OPERATOR'
        ) THEN 'SERVICE_OPERATOR'::"system_role"
        ELSE "user"."system_role"
    END,
    "updated_at" = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM "memberships" AS "membership"
    WHERE "membership"."user_id" = "user"."id"
      AND "membership"."role" IN ('EMMA_ADMIN', 'SERVICE_OPERATOR')
);

-- System roles no longer represent hospital or department access.
DELETE FROM "memberships"
WHERE "role" IN ('EMMA_ADMIN', 'SERVICE_OPERATOR');

-- Drop role-dependent indexes before replacing the PostgreSQL enum.
DROP INDEX "memberships_hospital_scope_role_key";
DROP INDEX "memberships_department_scope_role_key";

CREATE TYPE "membership_role_new" AS ENUM ('HOSPITAL_USER', 'HOSPITAL_ADMIN');

ALTER TABLE "memberships"
ALTER COLUMN "role" TYPE "membership_role_new"
USING ("role"::text::"membership_role_new");

DROP TYPE "membership_role";
ALTER TYPE "membership_role_new" RENAME TO "membership_role";

-- Restore duplicate protection for hospital-wide and department-scoped access.
CREATE UNIQUE INDEX "memberships_hospital_scope_role_key"
ON "memberships"("user_id", "hospital_id", "role")
WHERE "department_id" IS NULL;

CREATE UNIQUE INDEX "memberships_department_scope_role_key"
ON "memberships"("user_id", "hospital_id", "department_id", "role")
WHERE "department_id" IS NOT NULL;

COMMIT;
