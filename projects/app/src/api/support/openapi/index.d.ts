import type { OpenApiSchema } from '@/types/support/openapi';

export type GetApiKeyProps = {
  appId?: string;
};

export type EditApiKeyProps = {
  appId?: string;
  name: string;
  limit: OpenApiSchema['limit'];
};
