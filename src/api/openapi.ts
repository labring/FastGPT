import { GET, POST, DELETE } from './request';
import { UserOpenApiKey } from '@/types/openapi';
/**
 * crete a api key
 */
export const createAApiKey = () => POST('/openapi/postKey');

/**
 * get api keys
 */
export const getApiKeys = () => GET<UserOpenApiKey[]>('/openapi/getKeys');

/**
 * delete api by id
 */
export const delApiById = (id: string) => DELETE(`/openapi/delKet?id=${id}`);
