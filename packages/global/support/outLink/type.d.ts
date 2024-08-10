import { AppSchema } from 'core/app/type';
import { PublishChannelEnum } from './constant';

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

// TODO: Unused
export interface WecomAppType {
  SuiteId: string;
  SuiteSecret: string;
}

export type OutlinkAppType = FeishuAppType | WecomAppType | undefined;

export type OutLinkSchema<T extends OutlinkAppType = undefined> = {
  _id: string;
  shareId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  // teamId: Schema.Types.ObjectId;
  // tmbId: Schema.Types.ObjectId;
  // appId: Schema.Types.ObjectId;
  name: string;
  usagePoints: number;
  lastTime: Date;
  type: PublishChannelEnum;

  // whether the response content is detailed
  responseDetail: boolean;

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
};

// to handle MongoDB querying
export type OutLinkWithAppType = Omit<OutLinkSchema, 'appId'> & {
  appId: AppSchema;
};

// Edit the Outlink
export type OutLinkEditType<T = undefined> = {
  _id?: string;
  name: string;
  responseDetail?: OutLinkSchema<T>['responseDetail'];
  // response when request
  immediateResponse?: string;
  // response when error or other situation
  defaultResponse?: string;
  limit?: OutLinkSchema<T>['limit'];

  // config for specific platform
  app?: T;
};
