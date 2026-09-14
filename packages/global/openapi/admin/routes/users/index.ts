import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import z from 'zod';
import {
  GetUsersBodySchema,
  GetUsersResponseSchema,
  AddUserBodySchema,
  AddUserResponseSchema,
  UpdateUserBodySchema,
  DeleteUserBodySchema,
  CreateUserImportBodySchema,
  CreateUserImportResponseSchema,
  GetUserImportQuerySchema,
  GetUserImportResponseSchema,
  UserImportResultQuerySchema,
  UserImportTemplateQuerySchema
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
  },
  '/admin/routes/users/import': {
    post: {
      summary: '批量导入用户',
      description: '上传 XLSX 文件并创建异步用户导入任务',
      tags: [DevApiTagsMap.adminUsers],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: CreateUserImportBodySchema.extend({
              file: z.any().meta({ format: 'binary', description: 'XLSX 用户导入文件' })
            })
          }
        }
      },
      responses: {
        200: {
          description: '任务创建成功',
          content: {
            'application/json': { schema: CreateUserImportResponseSchema }
          }
        }
      }
    },
    get: {
      summary: '查询用户导入任务',
      description: '查询当前管理员最近或指定的用户导入任务',
      tags: [DevApiTagsMap.adminUsers],
      requestParams: { query: GetUserImportQuerySchema },
      responses: {
        200: {
          description: '任务状态',
          content: {
            'application/json': { schema: GetUserImportResponseSchema }
          }
        }
      }
    }
  },
  '/admin/routes/users/import/template': {
    get: {
      summary: '下载用户导入模板',
      description: '下载中文、繁体中文或英文 XLSX 模板，必填表头标红',
      tags: [DevApiTagsMap.adminUsers],
      requestParams: { query: UserImportTemplateQuerySchema },
      responses: { 200: { description: '用户导入 XLSX 模板' } }
    }
  },
  '/admin/routes/users/import/{taskId}/result': {
    get: {
      summary: '下载用户导入错误文件',
      description: '下载批量导入失败行文件',
      tags: [DevApiTagsMap.adminUsers],
      requestParams: {
        path: UserImportResultQuerySchema
      },
      responses: {
        200: { description: '错误 XLSX 文件' }
      }
    }
  }
};
