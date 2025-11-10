import type { OpenAPIPath } from '../../../../type';
import {
  CreateAppToolBodySchema,
  DeleteSystemToolQuerySchema,
  GetAdminSystemToolDetailQuerySchema,
  GetAdminSystemToolsQuery,
  GetAdminSystemToolsResponseSchema,
  GetAllSystemAppsBodySchema,
  GetAllSystemAppsResponseSchema,
  UpdateToolBodySchema,
  UpdateToolOrderBodySchema
} from './api';
import { TagsMap } from '../../../../tag';
import { z } from 'zod';
import { AdminSystemToolDetailSchema } from '../../../../../core/plugin/admin/tool/type';
import { SystemToolTagPath } from './tag';

export const AdminPluginToolPath: OpenAPIPath = {
  '/core/plugin/admin/tool/list': {
    get: {
      summary: '获取系统工具列表',
      description: '获取系统工具列表，需要系统管理员权限',
      tags: [TagsMap.pluginToolAdmin],
      requestParams: {
        query: GetAdminSystemToolsQuery
      },
      responses: {
        '200': {
          description: '成功获取系统工具列表',
          content: {
            'application/json': {
              schema: GetAdminSystemToolsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/tool/detail': {
    get: {
      summary: '获取系统工具详情',
      description: '获取系统工具详情，需要系统管理员权限',
      tags: [TagsMap.pluginToolAdmin],
      requestParams: {
        query: GetAdminSystemToolDetailQuerySchema
      },
      responses: {
        '200': {
          description: '成功获取系统工具详情',
          content: {
            'application/json': {
              schema: AdminSystemToolDetailSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/tool/update': {
    put: {
      summary: '更新系统工具',
      description:
        '更新系统工具配置，包括基础字段和自定义字段，支持递归更新子配置，需要系统管理员权限',
      tags: [TagsMap.pluginToolAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateToolBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新系统工具',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/tool/updateOrder': {
    put: {
      summary: '更新系统工具顺序',
      description: '批量更新系统工具的排序顺序，需要系统管理员权限',
      tags: [TagsMap.pluginToolAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateToolOrderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新系统工具顺序',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/tool/delete': {
    delete: {
      summary: '删除系统工具',
      description: '根据ID删除系统工具，需要系统管理员权限',
      tags: [TagsMap.pluginToolAdmin],
      requestParams: {
        query: DeleteSystemToolQuerySchema
      },
      responses: {
        200: {
          description: '成功删除系统工具',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  // Workflow tool
  '/core/plugin/admin/tool/workflow/systemApps': {
    post: {
      summary: '获取所有系统工具类型应用',
      description: '获取所有系统工具类型应用，用于选择系统上的应用作为系统工具。需要系统管理员权限',
      tags: [TagsMap.pluginToolAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: GetAllSystemAppsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取系统工具类型应用',
          content: {
            'application/json': {
              schema: GetAllSystemAppsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/tool/workflow/create': {
    post: {
      summary: '将系统应用设置成系统工具',
      description: '将系统应用设置成系统工具，需要系统管理员权限',
      tags: [TagsMap.pluginToolAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateAppToolBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功将系统应用设置成系统工具',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  ...SystemToolTagPath
};
