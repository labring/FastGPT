import { configureLoggerFromEnv, getLogger } from '@fastgpt-sdk/logger';
import { env } from './env';

const CATEGORY = ['sandbox-proxy'] as const;

export const configureLogger = () =>
  configureLoggerFromEnv({
    env: process.env,
    defaultCategory: CATEGORY,
    defaultServiceName: 'fastgpt-sandbox-proxy',
    defaultConsoleLevel: env.logLevel,
    sensitiveProperties: ['fastgpt', 'authorization', 'cookie']
  });

export const logger = getLogger(CATEGORY);
