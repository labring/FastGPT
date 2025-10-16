import { createDocument } from 'zod-openapi';
import { ChatPath } from './chat';

export const openAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT API',
    version: '1.0.0',
    description: 'FastGPT API 文档'
  },
  paths: {
    ...ChatPath
  },
  servers: [{ url: '/api' }]
});
