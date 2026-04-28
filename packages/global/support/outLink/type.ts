import z from 'zod';
import type { PublishChannelEnum } from './constant';

// Feishu Config interface
export interface FeishuAppType {
  appId: string;
  appSecret: string;
  // Encrypt config
  // refer to: https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/configure-encrypt-key
  encryptKey?: string; // no secret if null
}

export interface DingtalkAppType {
  clientId: string;
  clientSecret: string;
}

export interface WecomAppType {
  CallbackToken: string;
  CallbackEncodingAesKey: string;

  /** @deprecated */
  // AgentId: string;
  /** @deprecated */
  // CorpId: string;
  /** @deprecated */
  // SuiteSecret: string;
}

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

export interface OffiAccountAppType {
  appId: string;
  isVerified?: boolean; // if isVerified, we could use '客服接口' to reply
  secret: string;
  CallbackToken: string;
  CallbackEncodingAesKey?: string;
  timeoutReply?: string; // if timeout (15s), will reply this content.
  // timeout reply is optional, but when isVerified is false, the wechat will reply a default message which is `该公众号暂时无法提供服务，请稍后再试`
  // because we can not reply anything in 15s. Thus, the wechat server will treat this request as a failed request.
}

export type OutlinkAppType =
  | FeishuAppType
  | WecomAppType
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

export type OutLinkSchema<T extends OutlinkAppType = undefined> = OutLinkSchemaType<T>;

export const PlaygroundVisibilityConfigSchema = z.object({
  showRunningStatus: z.boolean(),
  showSkillReferences: z.boolean().optional().default(true),
  showCite: z.boolean().optional().default(true),
  showFullText: z.boolean().optional().default(true),
  canDownloadSource: z.boolean().optional().default(true),
  showWholeResponse: z.boolean().optional().default(true)
});

export type PlaygroundVisibilityConfigType = z.infer<typeof PlaygroundVisibilityConfigSchema>;
