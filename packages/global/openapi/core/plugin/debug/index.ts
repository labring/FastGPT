import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  EnablePluginDebugChannelBodySchema,
  EnablePluginDebugChannelResponseSchema,
  ExchangePluginDebugConnectionKeyBodySchema,
  ExchangePluginDebugConnectionKeyQuerySchema,
  ExchangePluginDebugConnectionKeyResponseSchema,
  GetPluginDebugChannelResponseSchema,
  RefreshPluginDebugConnectionKeyBodySchema,
  RefreshPluginDebugConnectionKeyResponseSchema,
  RevokePluginDebugChannelBodySchema,
  RevokePluginDebugChannelResponseSchema
} from './api';

export const PluginDebugPath: OpenAPIPath = {
  '/plugin/debug-channel/enable': {
    post: {
      summary: '开启插件调试通道',
      description:
        '为当前登录团队成员开启插件调试通道，并返回 plugin-server 生成的 source 和长期 connectionKey',
      tags: [DevApiTagsMap.pluginDebug],
      requestBody: {
        content: {
          'application/json': {
            schema: EnablePluginDebugChannelBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '开启插件调试通道成功',
          content: {
            'application/json': {
              schema: EnablePluginDebugChannelResponseSchema
            }
          }
        }
      }
    }
  },
  '/plugin/debug-channel/key/refresh': {
    post: {
      summary: '刷新插件调试连接密钥',
      description: '刷新当前登录团队成员的插件调试 connectionKey，旧连接密钥会失效',
      tags: [DevApiTagsMap.pluginDebug],
      requestBody: {
        content: {
          'application/json': {
            schema: RefreshPluginDebugConnectionKeyBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '刷新插件调试连接密钥成功',
          content: {
            'application/json': {
              schema: RefreshPluginDebugConnectionKeyResponseSchema
            }
          }
        }
      }
    }
  },
  '/plugin/debug-channel': {
    get: {
      summary: '获取插件调试通道状态',
      description: '获取当前登录团队成员的插件调试状态、source、keyId 和已挂载调试插件',
      tags: [DevApiTagsMap.pluginDebug],
      responses: {
        200: {
          description: '获取插件调试通道状态成功',
          content: {
            'application/json': {
              schema: GetPluginDebugChannelResponseSchema
            }
          }
        }
      }
    }
  },
  '/plugin/debug-channel/revoke': {
    post: {
      summary: '关闭插件调试通道',
      description: '关闭当前登录团队成员的插件调试通道，并断开对应 gateway session',
      tags: [DevApiTagsMap.pluginDebug],
      requestBody: {
        content: {
          'application/json': {
            schema: RevokePluginDebugChannelBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '关闭插件调试通道成功',
          content: {
            'application/json': {
              schema: RevokePluginDebugChannelResponseSchema
            }
          }
        }
      }
    }
  },
  '/plugin/debug-channel/connection-key/exchange': {
    get: {
      summary: '通过连接链接兑换插件调试连接信息',
      description:
        'CLI 使用包含 connectionKey 的 HTTP 连接链接兑换短期 WSS connectToken 和 gateway 连接信息',
      tags: [DevApiTagsMap.pluginDebug],
      requestParams: {
        query: ExchangePluginDebugConnectionKeyQuerySchema
      },
      responses: {
        200: {
          description: '兑换插件调试连接信息成功',
          content: {
            'application/json': {
              schema: ExchangePluginDebugConnectionKeyResponseSchema
            }
          }
        }
      }
    },
    post: {
      summary: '兑换插件调试连接信息',
      description: 'CLI 使用 connectionKey 兑换短期 WSS connectToken 和 gateway 连接信息',
      tags: [DevApiTagsMap.pluginDebug],
      requestBody: {
        content: {
          'application/json': {
            schema: ExchangePluginDebugConnectionKeyBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '兑换插件调试连接信息成功',
          content: {
            'application/json': {
              schema: ExchangePluginDebugConnectionKeyResponseSchema
            }
          }
        }
      }
    }
  }
};
