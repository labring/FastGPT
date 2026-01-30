import type { OpenAPIPath } from '../../../../type';
import { TagsMap } from '../../../../tag';
import { z } from 'zod';
import { UpdatePluginDatasetStatusBodySchema } from './api';

export const AdminPluginDatasetPath: OpenAPIPath = {
  '/core/plugin/admin/dataset/updateStatus': {
    put: {
      summary: '更新插件知识库来源状态',
      description: '更新插件知识库来源的启用/禁用状态，需要系统管理员权限',
      tags: [TagsMap.pluginDatasetAdmin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePluginDatasetStatusBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新知识库来源状态',
          content: {
            'application/json': {
              schema: UpdatePluginDatasetStatusBodySchema
            }
          }
        }
      }
    }
  }
};
