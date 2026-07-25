import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
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
});
