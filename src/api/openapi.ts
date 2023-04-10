import { GET, POST, DELETE } from './request';
import { UserOpenApiKey } from '@/types/openapi';
/**
 * crete a api key
 */
export const createAOpenApiKey = () => POST<string>('/openapi/postKey');

/**
 * get api keys
 */
export const getOpenApiKeys = () => GET<UserOpenApiKey[]>('/openapi/getKeys');

/**
 * delete api by id
 */
export const delOpenApiById = (id: string) => DELETE(`/openapi/delKey?id=${id}`);
