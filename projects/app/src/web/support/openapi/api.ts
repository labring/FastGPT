import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type {
  CreateApiKeyBodyType,
  CreateApiKeyResponseType,
  DeleteApiKeyQueryType,
  DeleteApiKeyResponseType,
  GetApiKeyListQueryType,
  GetApiKeyListResponseType,
  UpdateApiKeyBodyType,
  UpdateApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

/**
 * crete a api key
 */
export const createAOpenApiKey = (data: CreateApiKeyBodyType) =>
  POST<CreateApiKeyResponseType>('/support/openapi/create', data);

/**
 * update a api key
 */
export const putOpenApiKey = (data: UpdateApiKeyBodyType) =>
  PUT<UpdateApiKeyResponseType>('/support/openapi/update', data);

/**
 * get api keys
 */
export const getOpenApiKeys = (params?: GetApiKeyListQueryType) =>
  GET<GetApiKeyListResponseType>('/support/openapi/list', params);

/**
 * delete api by id
 */
export const delOpenApiById = (id: DeleteApiKeyQueryType['id']) =>
  DELETE<DeleteApiKeyResponseType>(`/support/openapi/delete`, { id });
