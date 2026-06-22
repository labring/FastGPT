import type { OpenAPIPath } from '../../../type';
import { GetPluginToolTagsResponseSchema } from './api';
import { DevApiTagsMap } from '../../../tag';
import z from 'zod';

export const PluginToolTagPath: OpenAPIPath = {
  '/core/plugin/toolTag/list': {
    get: {
      summary: '获取工具标签列表',
      description: '获取所有工具标签列表，按排序顺序返回',
      tags: [DevApiTagsMap.pluginToolTag],
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
  }
};
