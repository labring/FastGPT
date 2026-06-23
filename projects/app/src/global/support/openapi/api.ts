import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';

export type GetApiKeyProps = Record<string, never>;

export type EditApiKeyProps = {
  name: string;
  authProxy?: boolean;
  limit: OpenApiSchema['limit'];
};
