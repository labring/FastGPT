import z from 'zod';

/* ============================================================================
 * API: 创建插件调试会话
 * Route: POST /api/core/plugin/debug/session
 * Method: POST
 * Description: 为当前团队成员创建本地插件调试会话，并返回 CLI 连接地址和命令
 * Tags: ['插件调试', 'Write']
 * ============================================================================ */

export const CreatePluginDebugSessionBodySchema = z
  .object({
    ttlMs: z.number().int().positive().optional().meta({
      example: 14400000,
      description: '调试会话有效期，单位毫秒。默认 4 小时，到期后主动断连并释放资源'
    })
  })
  .optional()
  .default({});

export type CreatePluginDebugSessionBodyType = z.infer<typeof CreatePluginDebugSessionBodySchema>;

export const PluginDebugSessionCreateResultSchema = z.object({
  debugSessionId: z.string().min(1).meta({
    example: 'dbg_xxx',
    description: '调试会话 ID'
  }),
  tmbId: z.string().min(1).meta({
    example: 'tmb_xxx',
    description: '当前团队成员 ID'
  }),
  source: z.string().min(1).meta({
    example: 'debug:tmbId:tmb_xxx:session:dbg_xxx',
    description: 'plugin-server 返回的调试 source，后续查询和运行必须原样透传'
  }),
  ticket: z.string().min(1).meta({
    example: 'opaque-one-time-ticket',
    description: '一次性 CLI 连接票据。仅创建会话时返回给前端用于生成 CLI 命令'
  }),
  ticketExpiresAt: z.number().int().positive().meta({
    example: 1781500000000,
    description: 'ticket 过期时间戳，单位毫秒'
  }),
  expiresAt: z.number().int().positive().meta({
    example: 1781500000000,
    description: '调试会话过期时间戳，单位毫秒'
  })
});

export const CreatePluginDebugSessionResponseSchema = PluginDebugSessionCreateResultSchema.extend({
  connectUrl: z.string().url().meta({
    example: 'https://fastgpt.example.com/api/plugin/debug/connect?ticket=opaque-one-time-ticket',
    description: 'CLI 访问 FastGPT 的 ticket 兑换地址'
  }),
  cliCommand: z.string().min(1).meta({
    example:
      'fastgpt-plugin debug ./plugin-a --connect "https://fastgpt.example.com/api/plugin/debug/connect?ticket=opaque-one-time-ticket"',
    description: '可复制到终端执行的插件调试命令'
  })
});

export type CreatePluginDebugSessionResponseType = z.infer<
  typeof CreatePluginDebugSessionResponseSchema
>;

export const PluginDebugSessionStatusSchema = z.enum([
  'pending',
  'connected',
  'disconnected',
  'revoked',
  'expired'
]);

export const PluginDebugSessionPluginSchema = z
  .object({
    pluginId: z.string().min(1).meta({
      example: 'getTime',
      description: '调试插件 ID'
    }),
    source: z.string().min(1).meta({
      example: 'debug:tmbId:tmb_xxx:session:dbg_xxx',
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

export const PluginDebugSessionStatusResponseSchema = z.object({
  debugSessionId: z.string().min(1).meta({
    example: 'dbg_xxx',
    description: '调试会话 ID'
  }),
  tmbId: z.string().min(1).meta({
    example: 'tmb_xxx',
    description: '当前团队成员 ID'
  }),
  source: z.string().min(1).meta({
    example: 'debug:tmbId:tmb_xxx:session:dbg_xxx',
    description: 'plugin-server 返回的调试 source'
  }),
  status: PluginDebugSessionStatusSchema.meta({
    example: 'connected',
    description: '调试会话状态'
  }),
  plugins: z.array(PluginDebugSessionPluginSchema).meta({
    description: '当前调试会话已挂载的插件列表'
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
    }),
  expiresAt: z.number().int().positive().meta({
    example: 1781500000000,
    description: '调试会话过期时间戳，单位毫秒'
  })
});

export type PluginDebugSessionStatusResponseType = z.infer<
  typeof PluginDebugSessionStatusResponseSchema
>;

export const PluginDebugSessionIdQuerySchema = z.object({
  debugSessionId: z.string().min(1).meta({
    example: 'dbg_xxx',
    description: '调试会话 ID'
  })
});

export type PluginDebugSessionIdQueryType = z.infer<typeof PluginDebugSessionIdQuerySchema>;

export const DisconnectPluginDebugSessionResponseSchema = z.object({
  revoked: z.boolean().meta({
    example: true,
    description: '是否成功断开调试会话'
  })
});

export type DisconnectPluginDebugSessionResponseType = z.infer<
  typeof DisconnectPluginDebugSessionResponseSchema
>;

/* ============================================================================
 * API: 兑换插件调试连接信息
 * Route: GET /api/plugin/debug/connect
 * Method: GET
 * Description: 使用一次性 ticket 兑换 connection-gateway 连接信息，供 fastgpt-plugin CLI 使用
 * Tags: ['插件调试', 'Public', 'Read']
 * ============================================================================ */

export const ExchangePluginDebugTicketQuerySchema = z.object({
  ticket: z.string().min(1).meta({
    example: 'opaque-one-time-ticket',
    description: '一次性 CLI 连接票据'
  })
});

export type ExchangePluginDebugTicketQueryType = z.infer<
  typeof ExchangePluginDebugTicketQuerySchema
>;

export const PluginDebugSessionExchangeResultSchema = z.object({
  tcpUrl: z.string().min(1).meta({
    example: 'tcp://tcp.example.com:39430',
    description: 'connection-gateway TCP 连接地址'
  }),
  source: z.string().min(1).meta({
    example: 'debug:tmbId:tmb_xxx:session:dbg_xxx',
    description: '本次调试会话对应的 source'
  }),
  sessionId: z.string().min(1).meta({
    example: 'gateway-session-id',
    description: 'connection-gateway session ID'
  }),
  session: z.record(z.string(), z.unknown()).meta({
    example: {},
    description: 'connection-gateway session 原始信息'
  }),
  connectToken: z.string().min(1).meta({
    example: 'scoped-connection-token',
    description: '作用域受限的连接 token，仅返回给 CLI'
  }),
  expiresAt: z.number().int().positive().meta({
    example: 1781500000000,
    description: '连接信息过期时间戳，单位毫秒'
  })
});

export type PluginDebugSessionExchangeResultType = z.infer<
  typeof PluginDebugSessionExchangeResultSchema
>;
