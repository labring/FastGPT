import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetTeamPluginListResponseSchema,
  GetTeamToolDetailQuerySchema,
  GetTeamToolVersionsQuerySchema,
  GetTeamToolVersionsResponseSchema,
  TeamToolDetailSchema
} from './tool/dto';

export const PluginTeamPath: OpenAPIPath = {
  '/core/plugin/team/tool/list': {
    get: {
      summary: '获取团队插件列表',
      description: '获取团队插件列表',
      tags: [TagsMap.pluginTeam],
      responses: {
        200: {
          description: '获取团队插件列表成功',
          content: {
            'application/json': {
              schema: GetTeamPluginListResponseSchema
            }
          }
        }
      }
    }
  },
  // Tool
  '/core/plugin/team/tool/detail': {
    get: {
      summary: '获取工具卡片详情',
      description: '获取工具片详情',
      tags: [TagsMap.pluginTeam],
      requestParams: {
        query: GetTeamToolDetailQuerySchema
      },
      responses: {
        200: {
          description: '获取工具卡片详情成功',
          content: {
            'application/json': {
              schema: TeamToolDetailSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/tool/versions': {
    get: {
      summary: '获取团队工具版本列表',
      description: '获取团队工具版本列表',
      tags: [TagsMap.pluginTeam],
      requestParams: {
        query: GetTeamToolVersionsQuerySchema
      },
      responses: {
        200: {
          description: '获取团队工具版本列表成功',
          content: {
            'application/json': {
              schema: GetTeamToolVersionsResponseSchema
            }
          }
        }
      }
    }
  }
};
