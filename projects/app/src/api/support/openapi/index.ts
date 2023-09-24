import { GET, POST, DELETE } from '@/api/request';
import { EditApiKeyProps, GetApiKeyProps } from './index.d';
import type { OpenApiSchema } from '@/types/support/openapi';

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
