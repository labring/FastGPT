import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { AppPermissionCheckSchema } from '../../../../support/permission/app/controller.schema';
import {
  GetAppPermissionQuerySchema,
  ChangeAppOwnerBodySchema,
  ChangeAppOwnerResponseSchema,
  ResumeInheritPermissionQuerySchema,
  ResumeInheritPermissionResponseSchema
} from './api';

export const AppPermissionPath: OpenAPIPath = {
  '/core/app/getPermission': {
    get: {
      summary: '获取应用权限',
      description: '根据应用 ID 获取当前用户对该应用的权限信息',
      tags: [DevApiTagsMap.appPer],
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
      tags: [DevApiTagsMap.appPer],
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
  },
  '/proApi/core/app/changeOwner': {
    post: {
      summary: '转让应用所有权',
      description: '将应用所有权转让给指定团队成员',
      tags: [DevApiTagsMap.permissionResource, DevApiTagsMap.appPer],
      requestBody: {
        content: {
          'application/json': {
            schema: ChangeAppOwnerBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功转让应用所有权',
          content: {
            'application/json': {
              schema: ChangeAppOwnerResponseSchema
            }
          }
        }
      }
    }
  }
};
