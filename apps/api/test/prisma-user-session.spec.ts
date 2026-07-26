import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Prisma UserSession model', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      'prisma/migrations/20260726020000_add_user_sessions/migration.sql',
    ),
    'utf8',
  );

  it('stores sessions in user_sessions with a unique token hash', () => {
    expect(schema).toMatch(/model UserSession\s*\{/);
    expect(schema).toMatch(
      /tokenHash\s+String\s+@unique\s+@map\("token_hash"\)/,
    );
    expect(schema).toContain('@@map("user_sessions")');
    expect(migration).toContain('CREATE TABLE "user_sessions"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "user_sessions_token_hash_key"',
    );
  });

  it('uses timestamptz for all session dates', () => {
    expect(migration).toMatch(/"expires_at" TIMESTAMPTZ\(3\) NOT NULL/);
    expect(migration).toMatch(/"last_used_at" TIMESTAMPTZ\(3\)/);
    expect(migration).toMatch(/"revoked_at" TIMESTAMPTZ\(3\)/);
    expect(migration).toMatch(/"created_at" TIMESTAMPTZ\(3\)/);
    expect(migration).toMatch(/"updated_at" TIMESTAMPTZ\(3\)/);
  });
});
