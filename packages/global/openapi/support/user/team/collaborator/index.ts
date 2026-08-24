import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  DeleteTeamCollaboratorQuerySchema,
  GetTeamCollaboratorListResponseSchema,
  UpdateTeamCollaboratorBodySchema,
  UpdateTeamCollaboratorOneBodySchema
} from './api';

const TeamPermissionTags = [DevApiTagsMap.teamPermission];

export const TeamCollaboratorPath: OpenAPIPath = {
  '/proApi/support/user/team/collaborator/delete': {
    delete: {
      summary: '删除团队协作者权限',
      description: '删除团队成员、用户组或组织节点的协作者权限',
      tags: [...TeamPermissionTags],
      requestParams: {
        query: DeleteTeamCollaboratorQuerySchema
      },
      responses: {
        200: {
          description: '团队协作者权限删除成功'
        }
      }
    }
  },
  '/proApi/support/user/team/collaborator/list': {
    get: {
      summary: '获取团队协作者列表',
      description: '获取当前团队成员、用户组和组织节点的协作者权限列表',
      tags: [...TeamPermissionTags],
      responses: {
        200: {
          description: '成功获取团队协作者列表',
          content: {
            'application/json': {
              schema: GetTeamCollaboratorListResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/collaborator/update': {
    post: {
      summary: '更新团队协作者权限',
      description: '覆盖更新当前团队成员、用户组和组织节点的协作者权限',
      tags: [...TeamPermissionTags],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamCollaboratorBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '团队协作者权限更新成功'
        }
      }
    }
  },
  '/proApi/support/user/team/collaborator/updateOne': {
    put: {
      summary: '更新单个团队协作者权限',
      description: '更新指定团队成员、用户组或组织节点的单项协作者权限',
      tags: [...TeamPermissionTags],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamCollaboratorOneBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '团队协作者权限更新成功'
        }
      }
    }
  }
};
