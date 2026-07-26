import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export interface HealthResponse {
  status: 'ok';
  service: 'emma-api';
}

export interface DatabaseHealthResponse extends HealthResponse {
  database: 'connected';
}

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'emma-api',
    };
  }

  async getDatabaseHealth(): Promise<DatabaseHealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        service: 'emma-api',
        database: 'connected',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'emma-api',
        database: 'unavailable',
        message: 'Database unavailable',
      });
    }
  }
}
