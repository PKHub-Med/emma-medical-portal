import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Prisma organisation and access schema', () => {
  const schema = readFileSync(
    resolve('prisma/schema.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260726000000_init_organisation_and_access/migration.sql',
    ),
    'utf8',
  );

  it('enforces unique user email addresses', () => {
    expect(schema).toMatch(/email\s+String\s+@unique/);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "users_email_key" ON "users"("email");',
    );
  });

  it('links every department to a hospital', () => {
    expect(schema).toMatch(
      /hospital\s+Hospital\s+@relation\(fields: \[hospitalId\], references: \[id\]/,
    );
    expect(migration).toContain(
      'FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id")',
    );
  });

  it('allows a hospital-wide membership with a null departmentId', () => {
    expect(schema).toMatch(/departmentId\s+String\?/);
    expect(migration).toMatch(/"department_id" UUID,\r?\n/);
  });

  it('requires a membership department to belong to the same hospital', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("department_id", "hospital_id") REFERENCES "departments"("id", "hospital_id")',
    );
  });

  it('prevents duplicate memberships for hospital and department scopes', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "memberships_hospital_scope_role_key"',
    );
    expect(migration).toContain('WHERE "department_id" IS NULL;');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "memberships_department_scope_role_key"',
    );
    expect(migration).toContain('WHERE "department_id" IS NOT NULL;');
  });
});
