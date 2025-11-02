import type { OpenAPIPath } from '../../../type';
import { GetTeamPluginToolListResponseSchema, ToggleInstallPluginBodySchema } from './api';
import { TagsMap } from '../../../tag';

export const PluginTeamPath: OpenAPIPath = {
  '/core/plugin/team/list': {
    get: {
      summary: '获取团队插件列表',
      description: '获取团队插件列表',
      tags: [TagsMap.pluginTeam],
      responses: {
        200: {
          description: '获取团队插件列表成功',
          content: {
            'application/json': {
              schema: GetTeamPluginToolListResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/toggleInstall': {
    post: {
      summary: '切换插件安装状态',
      description: '切换团队插件的安装状态，支持安装或卸载插件',
      tags: [TagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: ToggleInstallPluginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '请求成功',
          content: {}
        }
      }
    }
  }
};
