import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetUsersBodySchema,
  GetUsersResponseSchema,
  AddUserBodySchema,
  AddUserResponseSchema,
  UpdateUserBodySchema,
  DeleteUserBodySchema
} from './api';

export const AdminUsersPath: OpenAPIPath = {
  '/admin/routes/users/getUsers': {
    post: {
      summary: '获取用户列表',
      description: '分页获取用户列表，支持按用户名搜索',
      tags: [DevApiTagsMap.adminUsers],
      requestBody: {
        content: {
          'application/json': {
            schema: GetUsersBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取用户列表',
          content: {
            'application/json': {
              schema: GetUsersResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/routes/users/addUser': {
    post: {
      summary: '添加用户',
      description: '管理员创建一个新的用户账号',
      tags: [DevApiTagsMap.adminUsers],
      requestBody: {
        content: {
          'application/json': {
            schema: AddUserBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '创建成功',
          content: {
            'application/json': {
              schema: AddUserResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/routes/users/updateUser': {
    post: {
      summary: '更新用户信息',
      description: '管理员修改用户的用户名、密码或状态',
      tags: [DevApiTagsMap.adminUsers],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateUserBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/routes/users/delete': {
    post: {
      summary: '注销用户',
      description: '管理员注销指定用户账号，清除用户资源和团队',
      tags: [DevApiTagsMap.adminUsers],
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteUserBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '注销成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  }
};
