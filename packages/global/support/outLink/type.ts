import z from 'zod';
import type { PublishChannelEnum } from './constant';
import { BoolSchema } from '../../common/zod';

export const FeishuAppSchema = z.object({
  appId: z.string().trim().min(1),
  appSecret: z.string().trim().min(1),
  encryptKey: z.string().trim().optional()
});

/**
 * Feishu app config.
 * @see https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/configure-encrypt-key
 */
export type FeishuAppType = z.infer<typeof FeishuAppSchema>;

export const DingtalkAppSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1)
});

/**
 * Dingtalk app config.
 * @see https://open.dingtalk.com/document/dingstart/create-application
 */
export type DingtalkAppType = z.infer<typeof DingtalkAppSchema>;

/**
 * WeCom app config
 * @see https://developer.work.weixin.qq.com/document/path/90238
 */
export const WecomAppSchema = z.object({
  CallbackToken: z.string().trim().min(1),
  CallbackEncodingAesKey: z.string().trim().min(1)
});

export type WecomAppType = z.infer<typeof WecomAppSchema>;

export const WecomConnectionErrorCodeSchema = z.enum([
  'AUTH_FAILED', // Bot ID 或 Secret 无效，企微认证失败。
  'NETWORK_ERROR', // WebSocket、网络或心跳异常。
  'CONNECTION_CONFLICT' // Bot 被其他连接占用或踢下线。
]);

export const WecomConnectionStatusSchema = z.enum(['offline', 'online', 'error']);

export const WecomConnectionStatusMetaSchema = z.object({
  lastReportedAt: z.date().meta({ description: '最近一次有效状态上报的服务端接收时间' }),
  errorCode: WecomConnectionErrorCodeSchema.optional().meta({ description: '连接错误原因' })
});

/** 长连接存储配置；配置请求及公开响应由控制面分别校验，不能直接复用含 Secret 的结构。 */
export const WecomWebSocketAppSchema = z.object({
  botId: z.string().trim().min(1).max(256).meta({ description: '企微智能机器人 ID' }),
  secret: z.string().trim().min(1).max(1024).meta({ description: '企微智能机器人 Secret' }),
  // 持久化版本必须是正安全整数，不接受字符串或隐式类型转换。
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).meta({
    description: '服务端分配的连接配置版本'
  }),
  connectionStatus: WecomConnectionStatusSchema.default('offline').meta({
    description: '服务端维护的长连接状态'
  }),
  connectionStatusMeta: WecomConnectionStatusMetaSchema.optional().meta({
    description: '服务端维护的状态元数据，首次有效上报前可不存在'
  })
});

export type WecomWebSocketAppType = z.infer<typeof WecomWebSocketAppSchema>;

/**
 * WeChat Claw Bot app config.
 * @see https://github.com/Tencent/openclaw-weixin
 */
export const WechatAppSchema = z.object({
  token: z.string().default(''),
  baseUrl: z.string().default('https://ilinkai.weixin.qq.com'),
  accountId: z.string().default(''),
  userId: z.string().optional(),
  syncBuf: z.string().default(''),
  status: z.enum(['online', 'offline', 'error']).default('offline'),
  loginTime: z.string().optional(),
  lastError: z.string().optional()
});
export type WechatAppType = z.infer<typeof WechatAppSchema>;

/**
 * WeChat Official Account app config.
 * @see https://developers.weixin.qq.com/doc/service/guide/dev/api/
 */
export const OffiAccountAppSchema = z.object({
  appId: z.string().trim().min(1),
  isVerified: z.boolean().optional(),
  secret: z.string().trim().min(1),
  CallbackToken: z.string().trim().min(1),
  CallbackEncodingAesKey: z.string().trim().optional(),
  timeoutReply: z.string().optional()
});

export type OffiAccountAppType = z.infer<typeof OffiAccountAppSchema>;

export type OutlinkAppType =
  | FeishuAppType
  | WecomAppType
  | WecomWebSocketAppType
  | OffiAccountAppType
  | DingtalkAppType
  | WechatAppType
  | undefined;

export type OutLinkSchemaType<T extends OutlinkAppType = undefined> = {
  _id: string;
  shareId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  name: string;
  usagePoints: number;
  lastTime: Date;
  type: PublishChannelEnum;

  // whether to show the quote
  showCite: boolean;
  // whether to show the running status
  showRunningStatus: boolean;
  // whether to show skill reference logs
  showSkillReferences: boolean;
  // whether to show the full text reader
  showFullText: boolean;
  // whether can download source
  canDownloadSource: boolean;
  // whether to show the whole response button
  showWholeResponse: boolean;
  // Only share links use this field; legacy share links may omit it.
  allowAnonymous?: boolean;

  // response when request
  immediateResponse?: string;
  // response when error or other situation
  defaultResponse?: string;

  limit?: {
    expiredTime?: Date;
    // Questions per minute
    QPM: number;
    maxUsagePoints: number;
    // Verification message hook url
    hookUrl?: string;
  };

  app: T;

  //@deprecated
  responseDetail?: boolean;
  showNodeStatus?: boolean;
  showRawSource?: boolean;
};

// Edit the Outlink
export type OutLinkEditType<T extends OutlinkAppType = undefined> = {
  _id?: string;
  name: string;
  showCite?: OutLinkSchemaType<T>['showCite'];
  showRunningStatus?: OutLinkSchemaType<T>['showRunningStatus'];
  showSkillReferences?: OutLinkSchemaType<T>['showSkillReferences'];
  showFullText?: OutLinkSchemaType<T>['showFullText'];
  canDownloadSource?: OutLinkSchemaType<T>['canDownloadSource'];
  // response when request
  immediateResponse?: string;
  // response when error or other situation
  defaultResponse?: string;
  limit?: OutLinkSchemaType<T>['limit'];

  // config for specific platform
  app?: T;
};

export type ShareOutLinkSchemaType<T extends OutlinkAppType = undefined> = Omit<
  OutLinkSchemaType<T>,
  'type' | 'allowAnonymous'
> & {
  type: PublishChannelEnum.share;
  allowAnonymous: boolean;
};

export type OutLinkSchema<T extends OutlinkAppType = undefined> = OutLinkSchemaType<T>;

export const PlaygroundVisibilityConfigSchema = z.object({
  showRunningStatus: BoolSchema.meta({
    example: true,
    description: '是否显示运行状态'
  }),
  showSkillReferences: BoolSchema.optional().default(false).meta({
    example: false,
    description: '是否显示技能引用'
  }),
  showCite: BoolSchema.optional().default(true).meta({
    example: true,
    description: '是否显示引用'
  }),
  showFullText: BoolSchema.optional().default(true).meta({
    example: true,
    description: '是否显示全文'
  }),
  canDownloadSource: BoolSchema.optional().default(true).meta({
    example: true,
    description: '是否可下载来源'
  }),
  showWholeResponse: BoolSchema.optional().default(true).meta({
    example: true,
    description: '是否显示完整响应按钮'
  })
});

export type PlaygroundVisibilityConfigType = z.infer<typeof PlaygroundVisibilityConfigSchema>;
