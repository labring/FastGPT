import type { createDocument } from 'zod-openapi';

export type OpenAPIPath = Parameters<typeof createDocument>[0]['paths'];
