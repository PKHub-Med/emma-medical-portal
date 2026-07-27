import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { corsOptions } from '../src/cors.config';

describe('CORS configuration', () => {
  const allowedOrigin = 'https://emma-web.example.com';
  let app: INestApplication;
  let baseUrl: string;
  let previousWebAppUrl: string | undefined;

  beforeAll(async () => {
    previousWebAppUrl = process.env.WEB_APP_URL;
    process.env.WEB_APP_URL = allowedOrigin;

    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication();
    app.enableCors(corsOptions());
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();

    if (previousWebAppUrl === undefined) {
      delete process.env.WEB_APP_URL;
    } else {
      process.env.WEB_APP_URL = previousWebAppUrl;
    }
  });

  it('allows the configured origin and credentials', async () => {
    const response = await preflight(allowedOrigin);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      allowedOrigin,
    );
    expect(
      response.headers.get('access-control-allow-credentials'),
    ).toBe('true');
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    );
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Content-Type',
    );
  });

  it('does not allow a foreign origin', async () => {
    const response = await preflight('https://foreign.example.com');

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  function preflight(origin: string): Promise<Response> {
    return fetch(`${baseUrl}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
  }
});
