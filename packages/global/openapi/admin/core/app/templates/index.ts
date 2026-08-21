import z from 'zod';
import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  CreateTemplateBodySchema,
  UpdateTemplateBodySchema,
  UpdateTemplateOrderBodySchema,
  UpdateQuickTemplateBodySchema
} from './api';

export const AdminTemplatePath: OpenAPIPath = {
  '/admin/core/app/templates/create': {
    post: {
      summary: '创建应用模板',
      description: '管理员创建应用模板',
      tags: [DevApiTagsMap.adminTemplate],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateTemplateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '创建成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/core/app/templates/list': {
    get: {
      summary: '获取应用模板列表',
      description: '获取所有应用模板列表',
      tags: [DevApiTagsMap.adminTemplate],
      responses: {
        200: {
          description: '成功获取模板列表',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/core/app/templates/update': {
    post: {
      summary: '更新应用模板',
      description: '管理员更新应用模板的信息',
      tags: [DevApiTagsMap.adminTemplate],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTemplateBodySchema
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
  '/admin/core/app/templates/delete': {
    delete: {
      summary: '删除应用模板',
      description: '根据模板ID删除应用模板',
      tags: [DevApiTagsMap.adminTemplate],
      requestParams: {
        query: z.object({
          id: z.string().meta({ description: '模板ID' })
        })
      },
      responses: {
        200: {
          description: '删除成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/core/app/templates/updateOrder': {
    post: {
      summary: '更新模板排序',
      description: '批量更新应用模板的排序',
      tags: [DevApiTagsMap.adminTemplate],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTemplateOrderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '排序更新成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/core/app/templates/updateQuickTemplate': {
    post: {
      summary: '设置快捷模板',
      description: '设置哪些模板为快捷模板',
      tags: [DevApiTagsMap.adminTemplate],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateQuickTemplateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '设置成功',
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
