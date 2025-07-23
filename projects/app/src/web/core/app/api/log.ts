import type { getLogKeysQuery, getLogKeysResponse } from '@/pages/api/core/app/logs/getLogKeys';
import type { updateLogKeysBody } from '@/pages/api/core/app/logs/updateLogKeys';
import { GET, POST } from '@/web/common/api/request';

export const updateLogKeys = (data: updateLogKeysBody) =>
  POST('/core/app/logs/updateLogKeys', data);

export const getLogKeys = (data: getLogKeysQuery) =>
  GET<getLogKeysResponse>('/core/app/logs/getLogKeys', data);
