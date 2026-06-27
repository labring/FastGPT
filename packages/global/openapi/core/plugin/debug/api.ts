import z from 'zod';

export const PluginDebugChannelStatusSchema = z.enum([
  'enabled',
  'connected',
  'disconnected',
  'revoked'
]);

export const PluginDebugChannelActionBodySchema = z.object({}).optional().default({});

export type PluginDebugChannelActionBodyType = z.infer<typeof PluginDebugChannelActionBodySchema>;

const PluginDebugChannelBaseSchema = z.object({
  tmbId: z.string().min(1).meta({
    example: 'tmb_xxx',
    description: '当前团队成员 ID'
  }),
  source: z.string().min(1).optional().meta({
    example: 'debug:tmbId:tmb_xxx',
    description: 'plugin-server 返回的调试 source，后续查询和运行必须原样透传'
  }),
  status: PluginDebugChannelStatusSchema.meta({
    example: 'enabled',
    description: '调试通道状态'
  }),
  enabled: z.boolean().meta({
    example: true,
    description: '调试通道是否开启'
  }),
  keyId: z.string().min(1).optional().meta({
    example: 'dbg_key_xxx',
    description: 'plugin-server 当前连接密钥 ID'
  }),
  createdAt: z.number().int().positive().optional().meta({
    example: 1781500000000,
    description: '调试通道创建时间戳，单位毫秒'
  }),
  updatedAt: z.number().int().positive().optional().meta({
    example: 1781500000000,
    description: '调试通道更新时间戳，单位毫秒'
  }),
  refreshedAt: z.number().int().positive().optional().meta({
    example: 1781500000000,
    description: '连接密钥最近刷新时间戳，单位毫秒'
  }),
  revokedAt: z.number().int().positive().optional().meta({
    example: 1781500000000,
    description: '调试通道关闭时间戳，单位毫秒'
  })
});

/* ============================================================================
 * API: 开启插件调试通道
 * Route: POST /api/plugin/debug-channel/enable
 * Method: POST
 * Description: 为当前登录团队成员开启插件调试通道，并返回 plugin-server 生成的 source 和长期 connectionKey
 * Tags: ['插件调试', 'Write']
 * ============================================================================ */

export const EnablePluginDebugChannelBodySchema = PluginDebugChannelActionBodySchema;

export type EnablePluginDebugChannelBodyType = z.infer<typeof EnablePluginDebugChannelBodySchema>;

export const EnablePluginDebugChannelResponseSchema = PluginDebugChannelBaseSchema.extend({
  connectionKey: z.string().min(1).optional().meta({
    example: 'fgdbg_xxx',
    description: '长期连接密钥，仅在开启或刷新时返回，供 CLI 连接使用'
  }),
  connectionUrl: z.string().url().optional().meta({
    example:
      'https://fastgpt.example.com/api/plugin/debug-channel/connection-key:exchange?connectionKey=fgdbg_xxx',
    description: '本地 CLI 可直接访问的 FastGPT HTTP 调试连接链接'
  })
}).required({
  source: true
});

export type EnablePluginDebugChannelResponseType = z.infer<
  typeof EnablePluginDebugChannelResponseSchema
>;

/* ============================================================================
 * API: 刷新插件调试连接密钥
 * Route: POST /api/plugin/debug-channel/key:refresh
 * Method: POST
 * Description: 刷新当前登录团队成员的插件调试 connectionKey，旧连接密钥会失效
 * Tags: ['插件调试', 'Write']
 * ============================================================================ */

export const RefreshPluginDebugConnectionKeyBodySchema = PluginDebugChannelActionBodySchema;

export type RefreshPluginDebugConnectionKeyBodyType = z.infer<
  typeof RefreshPluginDebugConnectionKeyBodySchema
>;

export const RefreshPluginDebugConnectionKeyResponseSchema =
  EnablePluginDebugChannelResponseSchema.required({
    connectionKey: true
  });

export type RefreshPluginDebugConnectionKeyResponseType = z.infer<
  typeof RefreshPluginDebugConnectionKeyResponseSchema
>;

export const PluginDebugChannelPluginSchema = z
  .object({
    pluginId: z.string().min(1).meta({
      example: 'getTime',
      description: '调试插件 ID'
    }),
    source: z.string().min(1).meta({
      example: 'debug:tmbId:tmb_xxx',
      description: '调试插件来源'
    }),
    version: z.string().min(1).meta({
      example: '0.0.1',
      description: '调试插件版本'
    }),
    name: z.unknown().meta({
      example: {
        en: 'Get Time',
        'zh-CN': '获取时间'
      },
      description: '调试插件名称，保持 plugin-server 原始 i18n 结构'
    }),
    description: z
      .unknown()
      .optional()
      .meta({
        example: {
          en: 'Get current time',
          'zh-CN': '获取当前时间'
        },
        description: '调试插件简介，保持 plugin-server 原始 i18n 结构'
      }),
    icon: z.string().optional().meta({
      example: 'https://fastgpt.example.com/icon.png',
      description: '调试插件图标'
    }),
    tags: z
      .array(z.string())
      .optional()
      .meta({
        example: ['search'],
        description: '调试插件标签'
      })
  })
  .catchall(z.unknown());

/* ============================================================================
 * API: 获取插件调试通道状态
 * Route: GET /api/plugin/debug-channel
 * Method: GET
 * Description: 获取当前登录团队成员的插件调试状态、source、keyId 和已挂载调试插件
 * Tags: ['插件调试', 'Read']
 * ============================================================================ */

export const GetPluginDebugChannelQuerySchema = z.object({}).optional().default({});

export type GetPluginDebugChannelQueryType = z.infer<typeof GetPluginDebugChannelQuerySchema>;

export const GetPluginDebugChannelResponseSchema = PluginDebugChannelBaseSchema.extend({
  plugins: z.array(PluginDebugChannelPluginSchema).meta({
    description: '当前调试通道已挂载的插件列表'
  }),
  gateway: z
    .object({
      sessionId: z.string().min(1).optional().meta({
        example: 'gateway-session-id',
        description: 'connection-gateway session ID'
      }),
      ownerAlive: z.boolean().meta({
        example: true,
        description: 'CLI 连接是否在线'
      }),
      mailboxLag: z.number().int().nonnegative().meta({
        example: 0,
        description: 'gateway mailbox 延迟'
      })
    })
    .optional()
    .meta({
      description: 'gateway 状态'
    })
});

export type GetPluginDebugChannelResponseType = z.infer<typeof GetPluginDebugChannelResponseSchema>;

/* ============================================================================
 * API: 关闭插件调试通道
 * Route: POST /api/plugin/debug-channel/revoke
 * Method: POST
 * Description: 关闭当前登录团队成员的插件调试通道，并断开对应 gateway session
 * Tags: ['插件调试', 'Write']
 * ============================================================================ */

export const RevokePluginDebugChannelBodySchema = PluginDebugChannelActionBodySchema;

export type RevokePluginDebugChannelBodyType = z.infer<typeof RevokePluginDebugChannelBodySchema>;

export const RevokePluginDebugChannelResponseSchema = z.object({
  revoked: z.boolean().meta({
    example: true,
    description: 'plugin-server 是否执行了关闭；false 表示目标状态已达成'
  })
});

export type RevokePluginDebugChannelResponseType = z.infer<
  typeof RevokePluginDebugChannelResponseSchema
>;

/* ============================================================================
 * API: 兑换插件调试连接信息
 * Route: GET/POST /api/plugin/debug-channel/connection-key:exchange
 * Method: GET/POST
 * Description: CLI 使用 HTTP 连接链接或 connectionKey 兑换短期 WSS connectToken 和 gateway 连接信息
 * Tags: ['插件调试', 'Public', 'Write']
 * ============================================================================ */

export const ExchangePluginDebugConnectionKeyBodySchema = z.object({
  connectionKey: z.string().min(1).meta({
    example: 'fgdbg_xxx',
    description: '长期插件调试连接密钥'
  })
});

export type ExchangePluginDebugConnectionKeyBodyType = z.infer<
  typeof ExchangePluginDebugConnectionKeyBodySchema
>;

export const ExchangePluginDebugConnectionKeyQuerySchema =
  ExchangePluginDebugConnectionKeyBodySchema;

export type ExchangePluginDebugConnectionKeyQueryType = z.infer<
  typeof ExchangePluginDebugConnectionKeyQuerySchema
>;

export const ExchangePluginDebugConnectionKeyResponseSchema = z.object({
  gatewayUrl: z.string().min(1).meta({
    example: 'wss://gateway.example.com/debug',
    description: 'connection-gateway WebSocket 地址'
  }),
  transport: z.literal('websocket').meta({
    example: 'websocket',
    description: '调试连接传输协议'
  }),
  source: z.string().min(1).meta({
    example: 'debug:tmbId:tmb_xxx',
    description: 'plugin-server 返回的调试 source'
  }),
  connectToken: z.string().min(1).meta({
    example: 'short_lived_connect_token',
    description: '短期 WSS 绑定令牌，仅供 CLI 使用'
  }),
  expiresAt: z.number().int().positive().meta({
    example: 1781500000000,
    description: 'connectToken 过期时间戳，单位毫秒'
  })
});

export type ExchangePluginDebugConnectionKeyResponseType = z.infer<
  typeof ExchangePluginDebugConnectionKeyResponseSchema
>;
