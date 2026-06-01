import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { AppPermissionCheckSchema } from '../../../../support/permission/app/controller.schema';
import {
  GetAppPermissionQuerySchema,
  ResumeInheritPermissionQuerySchema,
  ResumeInheritPermissionResponseSchema
} from './api';

export const AppPermissionPath: OpenAPIPath = {
  '/core/app/getPermission': {
    get: {
      summary: '获取应用权限',
      description: '根据应用 ID 获取当前用户对该应用的权限信息',
      tags: [TagsMap.appPer],
      requestParams: {
        query: GetAppPermissionQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用权限',
          content: {
            'application/json': {
              schema: AppPermissionCheckSchema
            }
          }
        }
      }
    }
  },
  '/core/app/resumeInheritPermission': {
    put: {
      summary: '恢复继承权限',
      description: '恢复指定应用的继承权限配置',
      tags: [TagsMap.appPer],
      requestParams: {
        query: ResumeInheritPermissionQuerySchema
      },
      responses: {
        200: {
          description: '成功恢复继承权限',
          content: {
            'application/json': {
              schema: ResumeInheritPermissionResponseSchema
            }
          }
        }
      }
    }
  }
};
