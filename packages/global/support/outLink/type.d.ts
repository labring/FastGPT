import { AppSchema } from '../../core/app/type';
import { PublishChannelEnum, AuthTypeEnum } from './constant';
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
  AgentId: string;
  CorpId: string;
  SuiteSecret: string;
  CallbackToken: string;
  CallbackEncodingAesKey: string;
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

  // whether the response content is detailed
  responseDetail: boolean;
  // whether to hide the node status
  showNodeStatus?: boolean;
  // wheter to show the full text reader
  // showFullText?: boolean;
  // whether to show the complete quote
  showRawSource?: boolean;

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

  // 访问鉴权配置
  auth?: {
    // 是否需要鉴权
    requireAuth?: boolean;
    // 鉴权URL
    authUrl?: string;

    authType?: AuthTypeEnum;
    // 鉴权密钥
    authKey?: string;
  };

  // 简单鉴权配置（基于URL签名）
  simpleAuth?: {
    // 是否启用简单鉴权
    enabled?: boolean;
    // 签名密钥
    secretKey?: string;
    // 链接有效期（毫秒），默认24小时
    expirationMs?: number;
  };

  app: T;
};

// Edit the Outlink
export type OutLinkEditType<T = undefined> = {
  _id?: string;
  name: string;
  responseDetail?: OutLinkSchema<T>['responseDetail'];
  showNodeStatus?: OutLinkSchema<T>['showNodeStatus'];
  // showFullText?: OutLinkSchema<T>['showFullText'];
  showRawSource?: OutLinkSchema<T>['showRawSource'];
  // response when request
  immediateResponse?: string;
  // response when error or other situation
  defaultResponse?: string;
  limit?: OutLinkSchema<T>['limit'];

  auth?: OutLinkSchema<T>['auth'];
  // config for specific platform
  simpleAuth?: OutLinkSchema<T>['simpleAuth'];
  app?: T;
};
