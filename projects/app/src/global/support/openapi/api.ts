import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';

export type GetApiKeyProps = {
  appId?: string;
};

export type EditApiKeyProps = {
  appId?: string;
  name: string;
  authProxy?: boolean;
  limit: OpenApiSchema['limit'];
};
