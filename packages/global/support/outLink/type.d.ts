import { z } from 'zod';
import { AppSchema } from '../../core/app/type';
import type { PublishChannelEnum } from './constant';
import { RequireOnlyOne } from '../../common/type/utils';

// Feishu Config interface
export interface FeishuAppType {
  appId: string;
  appSecret: string;
  // Encrypt config
  // refer to: https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/configure-encrypt-key
  encryptKey?: string; // no secret if null
  // Token Verification
  // refer to: https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/encrypt-key-encryption-configuration-case
  verificationToken?: string;
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

// TODO: unused
export interface WechatAppType {}

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
  | undefined;

export type OutLinkSchema<T extends OutlinkAppType = undefined> = {
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
  // whether to show the full text reader
  showFullText: boolean;
  // whether can download source
  canDownloadSource: boolean;

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
export type OutLinkEditType<T = undefined> = {
  _id?: string;
  name: string;
  showCite?: OutLinkSchema<T>['showCite'];
  showRunningStatus?: OutLinkSchema<T>['showRunningStatus'];
  showFullText?: OutLinkSchema<T>['showFullText'];
  canDownloadSource?: OutLinkSchema<T>['canDownloadSource'];
  // response when request
  immediateResponse?: string;
  // response when error or other situation
  defaultResponse?: string;
  limit?: OutLinkSchema<T>['limit'];

  // config for specific platform
  app?: T;
};

export const PlaygroundVisibilityConfigSchema = z.object({
  showRunningStatus: z.boolean(),
  showCite: z.boolean(),
  showFullText: z.boolean(),
  canDownloadSource: z.boolean()
});

export type PlaygroundVisibilityConfigType = z.infer<typeof PlaygroundVisibilityConfigSchema>;
