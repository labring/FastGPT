import { createDocument } from 'zod-openapi';
import { ChatPath } from './core/chat';
import { ApiKeyPath } from './support/openapi';

export const openAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT API',
    version: '0.1.0',
    description: 'FastGPT API 文档'
  },
  paths: {
    ...ChatPath,
    ...ApiKeyPath
  },
  servers: [{ url: '/api' }]
});
