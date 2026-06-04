import type { OpenAPIPath } from '../../../type';
import {
  ConfirmUploadPkgPluginBodySchema,
  InstallPluginFromUrlBodySchema,
  UploadPkgPluginBodySchema,
  UploadPkgPluginResponseSchema
} from './api';
import { TagsMap } from '../../../tag';
import z from 'zod';
import { AdminPluginToolPath } from './tool';

export const PluginAdminPath: OpenAPIPath = {
  ...AdminPluginToolPath,

  '/core/plugin/admin/pkg/upload': {
    post: {
      summary: '批量上传系统插件包',
      description: '上传 .pkg 文件或包含多个 .pkg 的 .zip 文件，需要系统管理员权限',
      tags: [TagsMap.pluginAdmin],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: UploadPkgPluginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功上传并解析插件包',
          content: {
            'application/json': {
              schema: UploadPkgPluginResponseSchema
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
