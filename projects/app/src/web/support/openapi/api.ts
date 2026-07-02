import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type {
  CreateApiKeyBodyType,
  CreateApiKeyResponseType,
  CopyApiKeyBodyType,
  CopyApiKeyResponseType,
  DeleteApiKeyQueryType,
  DeleteApiKeyResponseType,
  GetApiKeyListQueryType,
  GetApiKeyListResponseType,
  UpdateApiKeyBodyType,
  UpdateApiKeyResponseType
} from '@fastgpt/global/openapi/support/openapi/api';
import type {
  CreateOpenApiTagBodyType,
  CreateOpenApiTagResponseType,
  DeleteOpenApiTagQueryType,
  DeleteOpenApiTagResponseType,
  GetOpenApiTagListQueryType,
  GetOpenApiTagListResponseType,
  UpdateOpenApiTagBodyType,
  UpdateOpenApiTagResponseType
} from '@fastgpt/global/openapi/support/openapi/tag';

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
export const getOpenApiKeys = (params?: GetApiKeyListQueryType) => {
  const { tags, ...rest } = params || {};

  return GET<GetApiKeyListResponseType>('/support/openapi/list', {
    ...rest,
    tags: tags && tags.length > 0 ? tags.join(',') : undefined
  });
};

/**
 * copy api key and record audit
 */
export const copyOpenApiKey = (data: CopyApiKeyBodyType) =>
  POST<CopyApiKeyResponseType>('/support/openapi/copy', data);

/**
 * delete api by id
 */
export const delOpenApiById = (id: DeleteApiKeyQueryType['id']) =>
  DELETE<DeleteApiKeyResponseType>(`/support/openapi/delete`, { id });

export const getOpenApiTags = (params?: GetOpenApiTagListQueryType) =>
  GET<GetOpenApiTagListResponseType>('/support/openapi/tag/list', params);

export const createOpenApiTag = (data: CreateOpenApiTagBodyType) =>
  POST<CreateOpenApiTagResponseType>('/support/openapi/tag/create', data);

export const updateOpenApiTag = (data: UpdateOpenApiTagBodyType) =>
  PUT<UpdateOpenApiTagResponseType>('/support/openapi/tag/update', data);

export const deleteOpenApiTag = (tagId: DeleteOpenApiTagQueryType['tagId']) =>
  DELETE<DeleteOpenApiTagResponseType>('/support/openapi/tag/delete', { tagId });
