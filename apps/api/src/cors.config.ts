import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function corsOptions(): CorsOptions {
  const webAppUrl = process.env.WEB_APP_URL;

  return {
    origin: (origin, callback) => {
      const isAllowed =
        origin === undefined ||
        (webAppUrl !== undefined && origin === webAppUrl);

      callback(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  };
}
