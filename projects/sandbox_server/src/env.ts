import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(3000),
    TOKEN: isTest ? z.string().default('test-token') : z.string().min(1),
    SEALOS_BASE_URL: z.string().url().default('https://applaunchpad.hzh.sealos.run'),
    SEALOS_KC: isTest ? z.string().default('') : z.string().min(1),
    // Container configuration
    CONTAINER_IMAGE: isTest ? z.string().default('test-image') : z.string(),
    CONTAINER_PORT: z.coerce.number().default(8080),
    CONTAINER_CPU: z.coerce.number().default(0.5),
    CONTAINER_MEMORY: z.coerce.number().default(1),
    CONTAINER_ENTRYPOINT: z.string().optional(),
    CONTAINER_EXPOSES_PUBLIC_DOMAIN: z
      .string()
      .default('false')
      .transform((v) => v === 'true')
  },
  runtimeEnv: process.env
});

// Container configuration for SealosClient
export const containerConfig = {
  image: env.CONTAINER_IMAGE,
  port: env.CONTAINER_PORT,
  cpu: env.CONTAINER_CPU,
  memory: env.CONTAINER_MEMORY,
  entrypoint: env.CONTAINER_ENTRYPOINT || '',
  exposesPublicDomain: env.CONTAINER_EXPOSES_PUBLIC_DOMAIN
};
