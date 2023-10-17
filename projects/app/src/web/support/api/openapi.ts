import { GET, POST, DELETE } from '@/web/common/api/request';
import type { EditApiKeyProps, GetApiKeyProps } from '@/global/support/api/openapiReq.d';
import type { OpenApiSchema } from '@fastgpt/support/openapi/type.d';

/**
 * crete a api key
 */
export const createAOpenApiKey = (data: EditApiKeyProps) =>
  POST<string>('/support/openapi/postKey', data);

/**
 * update a api key
 */
export const putOpenApiKey = (data: EditApiKeyProps & { _id: string }) =>
  POST<string>('/support/openapi/putKey', data);

/**
 * get api keys
 */
export const getOpenApiKeys = (params?: GetApiKeyProps) =>
  GET<OpenApiSchema[]>('/support/openapi/getKeys', params);

/**
 * delete api by id
 */
export const delOpenApiById = (id: string) => DELETE(`/support/openapi/delKey?id=${id}`);
