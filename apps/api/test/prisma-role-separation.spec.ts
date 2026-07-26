import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Prisma system and membership role separation', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260726010000_separate_system_and_membership_roles/migration.sql',
    ),
    'utf8',
  );

  it('defines system roles on User with USER as the default', () => {
    expect(schema).toMatch(
      /enum SystemRole\s*\{\s*USER\s+EMMA_ADMIN\s+SERVICE_OPERATOR/,
    );
    expect(schema).toMatch(
      /systemRole\s+SystemRole\s+@default\(USER\)\s+@map\("system_role"\)/,
    );
  });

  it('keeps only hospital-scoped roles in MembershipRole', () => {
    const membershipRole = schema.match(
      /enum MembershipRole\s*\{([\s\S]*?)@@map\("membership_role"\)/,
    )?.[1];

    expect(membershipRole).toContain('HOSPITAL_USER');
    expect(membershipRole).toContain('HOSPITAL_ADMIN');
    expect(membershipRole).not.toContain('EMMA_ADMIN');
    expect(membershipRole).not.toContain('SERVICE_OPERATOR');
  });

  it('moves legacy system roles to users before removing old memberships', () => {
    const updatePosition = migration.indexOf('UPDATE "users"');
    const deletePosition = migration.indexOf('DELETE FROM "memberships"');

    expect(updatePosition).toBeGreaterThan(-1);
    expect(deletePosition).toBeGreaterThan(updatePosition);
    expect(migration).toContain(
      `AND "membership"."role" = 'EMMA_ADMIN'`,
    );
    expect(migration).toContain(
      `AND "membership"."role" = 'SERVICE_OPERATOR'`,
    );
  });

  it('never deletes users during the role migration', () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"users"/i);
    expect(migration).toMatch(
      /DELETE FROM "memberships"\s+WHERE "role" IN \('EMMA_ADMIN', 'SERVICE_OPERATOR'\)/,
    );
  });

  it('rebuilds MembershipRole with hospital roles only', () => {
    expect(migration).toContain(
      `CREATE TYPE "membership_role_new" AS ENUM ('HOSPITAL_USER', 'HOSPITAL_ADMIN');`,
    );
    expect(migration).toContain(
      'ALTER TYPE "membership_role_new" RENAME TO "membership_role";',
    );
  });
});
