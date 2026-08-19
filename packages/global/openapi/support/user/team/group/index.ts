import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  ChangeGroupOwnerBodySchema,
  ChangeGroupOwnerResponseSchema,
  CreateGroupBodySchema,
  CreateGroupResponseSchema,
  DeleteGroupQuerySchema,
  DeleteGroupResponseSchema,
  ListGroupBodySchema,
  ListGroupQuerySchema,
  ListGroupResponseSchema,
  UpdateGroupBodySchema,
  UpdateGroupResponseSchema
} from './api';

const TeamGroupTags = [DevApiTagsMap.teamGroup];

export const TeamGroupPath: OpenAPIPath = {
  '/proApi/support/user/team/group/changeOwner': {
    put: {
      summary: '转让群组所有权',
      description: '将群组所有权转让给指定的团队成员',
      tags: [...TeamGroupTags],
      requestBody: {
        content: {
          'application/json': {
            schema: ChangeGroupOwnerBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '群组所有权转让成功',
          content: {
            'application/json': {
              schema: ChangeGroupOwnerResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/group/create': {
    post: {
      summary: '创建群组',
      description: '在当前团队中创建群组，创建者自动成为群组所有者',
      tags: [...TeamGroupTags],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateGroupBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '群组创建成功',
          content: {
            'application/json': {
              schema: CreateGroupResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/group/delete': {
    delete: {
      summary: '删除群组',
      description: '删除指定群组及其成员关系和关联权限，默认群组不可删除',
      tags: [...TeamGroupTags],
      requestParams: {
        query: DeleteGroupQuerySchema
      },
      responses: {
        200: {
          description: '群组删除成功',
          content: {
            'application/json': {
              schema: DeleteGroupResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/group/list': {
    post: {
      summary: '获取群组列表',
      description: '获取当前团队群组列表，可按名称搜索并选择是否返回成员预览和权限信息',
      tags: [...TeamGroupTags],
      requestParams: {
        query: ListGroupQuerySchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: ListGroupBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回群组列表',
          content: {
            'application/json': {
              schema: ListGroupResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/group/update': {
    put: {
      summary: '更新群组',
      description: '更新群组名称、头像及成员角色，变更所有者或管理员角色需要群组所有者权限',
      tags: [...TeamGroupTags],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateGroupBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '群组更新成功',
          content: {
            'application/json': {
              schema: UpdateGroupResponseSchema
            }
          }
        }
      }
    }
  }
};
