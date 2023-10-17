import type { OpenApiSchema } from '@fastgpt/support/openapi/type.d';

export type GetApiKeyProps = {
  appId?: string;
};

export type EditApiKeyProps = {
  appId?: string;
  name: string;
  limit: OpenApiSchema['limit'];
};
