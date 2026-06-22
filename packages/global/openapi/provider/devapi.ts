import { createDocument } from 'zod-openapi';
import { openAPIPaths, openAPITagGroups } from '../path';

export const openAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT Dev API',
    version: '0.1.0',
    description: 'FastGPT 所有 API 的文档'
  },
  paths: openAPIPaths,
  servers: [{ url: '/api' }],
  'x-tagGroups': openAPITagGroups
});
