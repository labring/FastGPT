import type { OpenAPIPath } from '../../../../../type';
import { TagsMap } from '../../../../../tag';
import { z } from 'zod';
import {
  CreatePluginToolTagBodySchema,
  DeletePluginToolTagQuerySchema,
  UpdatePluginToolTagBodySchema,
  UpdatePluginToolTagOrderBodySchema
} from './api';

export const SystemToolTagPath: OpenAPIPath = {
  '/core/plugin/toolTag/config/create': {
    post: {
      summary: '创建工具标签',
      description: '创建新的工具标签，需要系统管理员权限',
      tags: [TagsMap.pluginToolAdmin],
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
      tags: [TagsMap.pluginToolAdmin],
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
      tags: [TagsMap.pluginToolAdmin],
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
      tags: [TagsMap.pluginToolAdmin],
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
