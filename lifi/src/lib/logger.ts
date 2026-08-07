import pino from 'pino';

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: ['apiKey', 'headers.x-lifi-api-key'],
  },
  pino.destination(2),
);
