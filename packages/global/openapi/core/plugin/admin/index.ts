import type { OpenAPIPath } from '../../../type';
import {
  GetPkgPluginUploadURLQuerySchema,
  GetPkgPluginUploadURLResponseSchema,
  ParseUploadedPkgPluginQuerySchema,
  ParseUploadedPkgPluginResponseSchema,
  ConfirmUploadPkgPluginBodySchema,
  DeletePkgPluginQuerySchema,
  InstallPluginFromUrlBodySchema
} from './api';
import { TagsMap } from '../../../tag';
import { z } from 'zod';
import { AdminPluginToolPath } from './tool';

export const PluginAdminPath: OpenAPIPath = {
  ...AdminPluginToolPath,

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
