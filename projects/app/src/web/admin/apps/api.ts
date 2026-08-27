import type {
  GetAppsBodyType,
  GetAppsResponseType
} from '@fastgpt/global/openapi/admin/core/app/api';
import { POST } from '@/web/admin/common/request';

export const getApps = (data: GetAppsBodyType) =>
  POST<GetAppsResponseType>('/proApi/admin/routes/apps/getApps', data);
