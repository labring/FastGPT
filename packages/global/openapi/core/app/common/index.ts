import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { GetAppPermissionQuerySchema, GetAppPermissionResponseSchema } from './api';

export const AppCommonPath: OpenAPIPath = {
  '/core/app/getPermission': {
    get: {
      summary: '获取应用权限',
      description: '根据应用 ID 获取当前用户对该应用的权限信息',
      tags: [TagsMap.appCommon],
      requestParams: {
        query: GetAppPermissionQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用权限',
          content: {
            'application/json': {
              schema: GetAppPermissionResponseSchema
            }
          }
        }
      }
    }
  }
};
