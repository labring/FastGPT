import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  GetAppCollaboratorListQuerySchema,
  GetAppCollaboratorListResponseSchema,
  UpdateAppCollaboratorBodySchema,
  UpdateAppCollaboratorResponseSchema,
  GetModelCollaboratorListQuerySchema,
  GetModelCollaboratorListResponseSchema,
  UpdateModelCollaboratorBodySchema,
  UpdateModelCollaboratorResponseSchema
} from './api';

export const PermissionPath: OpenAPIPath = {
  '/proApi/core/app/collaborator/list': {
    get: {
      summary: '获取应用协作者列表',
      description: '获取应用或应用文件夹的协作者列表，包含继承权限场景下的父级协作者信息',
      tags: [DevApiTagsMap.permissionCollaborator, DevApiTagsMap.appPer],
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
      tags: [DevApiTagsMap.permissionCollaborator, DevApiTagsMap.appPer],
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
  },
  '/proApi/system/model/collaborator/list': {
    get: {
      summary: '获取模型协作者列表',
      description: '获取当前用户可读模型的协作者列表',
      tags: [DevApiTagsMap.permissionCollaborator],
      requestParams: {
        query: GetModelCollaboratorListQuerySchema
      },
      responses: {
        200: {
          description: '成功获取模型协作者列表',
          content: {
            'application/json': {
              schema: GetModelCollaboratorListResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/system/model/collaborator/update': {
    post: {
      summary: '更新模型协作者',
      description: '覆盖更新一个或多个模型的只读协作者',
      tags: [DevApiTagsMap.permissionCollaborator],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateModelCollaboratorBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新模型协作者',
          content: {
            'application/json': {
              schema: UpdateModelCollaboratorResponseSchema
            }
          }
        }
      }
    }
  }
};
