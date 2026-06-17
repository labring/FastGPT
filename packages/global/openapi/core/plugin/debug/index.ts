import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  CreatePluginDebugSessionBodySchema,
  CreatePluginDebugSessionResponseSchema,
  DisconnectPluginDebugSessionResponseSchema,
  ExchangePluginDebugTicketQuerySchema,
  PluginDebugSessionExchangeResultSchema,
  PluginDebugSessionStatusResponseSchema
} from './api';

export const PluginDebugPath: OpenAPIPath = {
  '/core/plugin/debug/session': {
    post: {
      summary: '创建插件调试会话',
      description: '为当前登录团队成员创建插件调试会话，并返回 CLI 连接地址和命令',
      tags: [TagsMap.pluginDebug],
      requestBody: {
        content: {
          'application/json': {
            schema: CreatePluginDebugSessionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '创建插件调试会话成功',
          content: {
            'application/json': {
              schema: CreatePluginDebugSessionResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/debug/session/{debugSessionId}': {
    get: {
      summary: '获取插件调试会话状态',
      description: '查询当前登录团队成员的插件调试会话状态和已挂载调试插件',
      tags: [TagsMap.pluginDebug],
      responses: {
        200: {
          description: '获取插件调试会话状态成功',
          content: {
            'application/json': {
              schema: PluginDebugSessionStatusResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/debug/session/{debugSessionId}/disconnect': {
    post: {
      summary: '断开插件调试会话',
      description: '断开当前登录团队成员的插件调试会话，并关闭对应 gateway session',
      tags: [TagsMap.pluginDebug],
      responses: {
        200: {
          description: '断开插件调试会话成功',
          content: {
            'application/json': {
              schema: DisconnectPluginDebugSessionResponseSchema
            }
          }
        }
      }
    }
  },
  '/plugin/debug/connect': {
    get: {
      summary: '兑换插件调试连接信息',
      description: '使用一次性 ticket 兑换 connection-gateway 连接信息，供 CLI 连接本地调试通道',
      tags: [TagsMap.pluginDebug],
      requestParams: {
        query: ExchangePluginDebugTicketQuerySchema
      },
      responses: {
        200: {
          description: '兑换插件调试连接信息成功',
          content: {
            'application/json': {
              schema: PluginDebugSessionExchangeResultSchema
            }
          }
        }
      }
    }
  }
};
