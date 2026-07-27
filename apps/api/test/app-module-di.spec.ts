import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AppModule dependency graph', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('initializes AuthModule and AuditModule with one shared provider instance', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = module.createNestApplication({ logger: false });

    await expect(app.init()).resolves.toBeDefined();
    expect(module.get(AuthService, { strict: false })).toBeInstanceOf(
      AuthService,
    );
    expect(module.get(AuditService, { strict: false })).toBeInstanceOf(
      AuditService,
    );
    expect(
      module.get(SessionAuthGuard, { strict: false }),
    ).toBeInstanceOf(SessionAuthGuard);
  });
});
