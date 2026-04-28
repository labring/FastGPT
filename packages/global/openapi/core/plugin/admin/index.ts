import type { OpenAPIPath } from '../../../type';
import { ConfirmUploadPkgPluginBodySchema, InstallPluginFromUrlBodySchema } from './api';
import { TagsMap } from '../../../tag';
import z from 'zod';
import { AdminPluginToolPath } from './tool';

export const PluginAdminPath: OpenAPIPath = {
  ...AdminPluginToolPath,

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
