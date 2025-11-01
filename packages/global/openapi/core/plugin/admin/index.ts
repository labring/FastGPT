import type { OpenAPIPath } from '../../../type';
import {
  CreateAppPluginBodySchema,
  UpdatePluginBodySchema,
  DeleteAppPluginQuerySchema,
  UpdatePluginOrderBodySchema,
  GetPkgPluginUploadURLQuerySchema,
  GetPkgPluginUploadURLResponseSchema,
  ParseUploadedPkgPluginQuerySchema,
  ParseUploadedPkgPluginResponseSchema,
  ConfirmUploadPkgPluginBodySchema,
  DeletePkgPluginQuerySchema,
  InstallPluginFromUrlBodySchema,
  GetAllSystemPluginAppsBodySchema,
  GetAllSystemPluginAppsResponseSchema
} from './api';
import { TagsMap } from '../../../tag';
import { z } from 'zod';

export const PluginAdminPath: OpenAPIPath = {
  '/core/plugin/admin/update': {
    put: {
      summary: '更新插件',
      description: '更新插件配置，包括基础字段和自定义字段，支持递归更新子配置，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePluginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新插件',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/updateOrder': {
    put: {
      summary: '更新插件顺序',
      description: '批量更新插件的排序顺序，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePluginOrderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新插件顺序',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  // App Plugin
  '/core/plugin/admin/app/systemApps': {
    post: {
      summary: '获取所有系统插件',
      description: '获取所有系统插件，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: GetAllSystemPluginAppsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取系统插件',
          content: {
            'application/json': {
              schema: GetAllSystemPluginAppsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/app/create': {
    post: {
      summary: '创建App类型插件',
      description: '创建新的App类型系统插件，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateAppPluginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建插件',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/app/delete': {
    delete: {
      summary: '删除App类型插件',
      description: '根据ID删除App类型插件，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestParams: {
        query: DeleteAppPluginQuerySchema
      },
      responses: {
        200: {
          description: '成功删除插件',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  // Pkg Plugin
  '/core/plugin/admin/pkg/presign': {
    get: {
      summary: '获取插件包上传预签名URL',
      description: '获取插件包上传到存储服务的预签名URL，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestParams: {
        query: GetPkgPluginUploadURLQuerySchema
      },
      responses: {
        200: {
          description: '成功获取上传URL',
          content: {
            'application/json': {
              schema: GetPkgPluginUploadURLResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/pkg/parse': {
    get: {
      summary: '解析已上传的插件包',
      description: '解析已上传的插件包，返回插件包中包含的工具信息，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestParams: {
        query: ParseUploadedPkgPluginQuerySchema
      },
      responses: {
        200: {
          description: '成功解析插件包',
          content: {
            'application/json': {
              schema: ParseUploadedPkgPluginResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/pkg/confirm': {
    post: {
      summary: '确认上传插件包',
      description: '确认上传插件包，将解析的工具添加到系统中，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: ConfirmUploadPkgPluginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功确认上传',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/pkg/delete': {
    delete: {
      summary: '删除插件包',
      description: '删除指定的插件包工具，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestParams: {
        query: DeletePkgPluginQuerySchema
      },
      responses: {
        200: {
          description: '成功删除插件包',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/plugin/admin/installWithUrl': {
    post: {
      summary: '从URL安装插件',
      description: '从URL安装插件，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: InstallPluginFromUrlBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功安装插件',
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
