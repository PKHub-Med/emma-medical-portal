import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AppController', () => {
  let controller: AppController;
  const queryRawMock = jest.fn();

  beforeEach(async () => {
    queryRawMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: queryRawMock,
          },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('GET /health', () => {
    it('returns the API health status', () => {
      expect(controller.getHealth()).toEqual({
        status: 'ok',
        service: 'emma-api',
      });
    });
  });

  describe('GET /health/db', () => {
    it('returns connected when SELECT 1 succeeds', async () => {
      queryRawMock.mockResolvedValue([{ '?column?': 1 }]);

      await expect(controller.getDatabaseHealth()).resolves.toEqual({
        status: 'ok',
        service: 'emma-api',
        database: 'connected',
      });
      expect(queryRawMock).toHaveBeenCalledTimes(1);
    });

    it('returns a safe HTTP 503 error when the database is unavailable', async () => {
      queryRawMock.mockRejectedValue(
        new Error(
          'postgresql://secret-user:secret-password@secret-host/database',
        ),
      );

      try {
        await controller.getDatabaseHealth();
        fail('Expected the database health check to fail');
      } catch (error) {
        expect(error).toMatchObject({
          status: 503,
          response: {
            status: 'error',
            service: 'emma-api',
            database: 'unavailable',
            message: 'Database unavailable',
          },
        });
        expect(JSON.stringify(error)).not.toContain('secret-user');
        expect(JSON.stringify(error)).not.toContain('secret-password');
        expect(JSON.stringify(error)).not.toContain('secret-host');
      }
    });
  });
});
