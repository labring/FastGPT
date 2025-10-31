import type { OpenAPIPath } from '../../../type';
import {
  GetPluginToolTagsResponseSchema,
  CreatePluginToolTagBodySchema,
  DeletePluginToolTagQuerySchema,
  UpdatePluginToolTagBodySchema,
  UpdatePluginToolTagOrderBodySchema
} from './api';
import { TagsMap } from '../../../tag';
import { z } from 'zod';

export const PluginToolTagPath: OpenAPIPath = {
  '/core/plugin/toolTag/list': {
    get: {
      summary: '获取工具标签列表',
      description: '获取所有工具标签列表，按排序顺序返回',
      tags: [TagsMap.pluginToolTag],
      responses: {
        200: {
          description: '成功获取工具标签列表',
          content: {
            'application/json': {
              schema: GetPluginToolTagsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/toolTag/config/create': {
    post: {
      summary: '创建工具标签',
      description: '创建新的工具标签，需要系统管理员权限',
      tags: [TagsMap.pluginToolTag],
      requestBody: {
        content: {
          'application/json': {
            schema: CreatePluginToolTagBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建工具标签',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/toolTag/config/delete': {
    delete: {
      summary: '删除工具标签',
      description: '根据标签ID删除工具标签，需要系统管理员权限',
      tags: [TagsMap.pluginToolTag],
      requestParams: {
        query: DeletePluginToolTagQuerySchema
      },
      responses: {
        200: {
          description: '成功删除工具标签',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/toolTag/config/update': {
    put: {
      summary: '更新工具标签',
      description: '更新工具标签的名称，需要系统管理员权限',
      tags: [TagsMap.pluginToolTag],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePluginToolTagBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新工具标签',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/toolTag/config/updateOrder': {
    put: {
      summary: '更新工具标签顺序',
      description: '批量更新工具标签的排序顺序，需要系统管理员权限',
      tags: [TagsMap.pluginToolTag],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePluginToolTagOrderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新工具标签顺序',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  }
};
