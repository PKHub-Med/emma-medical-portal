import { Controller, Get } from '@nestjs/common';
import {
  AppService,
  DatabaseHealthResponse,
  HealthResponse,
} from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }

  @Get('health/db')
  getDatabaseHealth(): Promise<DatabaseHealthResponse> {
    return this.appService.getDatabaseHealth();
  }
}
