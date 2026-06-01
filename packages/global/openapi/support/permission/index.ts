import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import {
  GetAppCollaboratorListQuerySchema,
  GetAppCollaboratorListResponseSchema,
  UpdateAppCollaboratorBodySchema,
  UpdateAppCollaboratorResponseSchema
} from './api';

export const PermissionPath: OpenAPIPath = {
  '/proApi/core/app/collaborator/list': {
    get: {
      summary: '获取应用协作者列表',
      description: '获取应用或应用文件夹的协作者列表，包含继承权限场景下的父级协作者信息',
      tags: [TagsMap.permissionCollaborator, TagsMap.appPer],
      requestParams: {
        query: GetAppCollaboratorListQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用协作者列表',
          content: {
            'application/json': {
              schema: GetAppCollaboratorListResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/app/collaborator/update': {
    post: {
      summary: '更新应用协作者',
      description: '覆盖更新应用或应用文件夹的协作者权限',
      tags: [TagsMap.permissionCollaborator, TagsMap.appPer],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateAppCollaboratorBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新应用协作者',
          content: {
            'application/json': {
              schema: UpdateAppCollaboratorResponseSchema
            }
          }
        }
      }
    }
  }
};
