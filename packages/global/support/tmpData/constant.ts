export enum TmpDataEnum {
  FeishuAccessToken = 'feishu_access_token',
  WecomAccessToken = 'wecom_access_token',
  OffiAccountAccessToken = 'offiaccount_access_token',
  QPSLimit = 'qps_limit'
}

type _TmpDataMetadata = {
  [TmpDataEnum.FeishuAccessToken]: {
    FeishuAppId: string;
  };
  [TmpDataEnum.WecomAccessToken]: {
    CorpId: string;
    AgentId: string;
  };
  [TmpDataEnum.OffiAccountAccessToken]: {
    AppId: string;
  };
  [TmpDataEnum.QPSLimit]: {
    ip: string;
  };
};

type _TmpDataType = {
  [TmpDataEnum.FeishuAccessToken]: {
    accessToken: string;
  };
  [TmpDataEnum.WecomAccessToken]: {
    accessToken: string;
  };
  [TmpDataEnum.OffiAccountAccessToken]: {
    accessToken: string;
  };
  [TmpDataEnum.QPSLimit]: {
    requestTimes: number;
  };
};

export const TmpDataExpireTime = {
  [TmpDataEnum.FeishuAccessToken]: 1000 * 60 * 60 * 1.5, // 1.5 hours
  [TmpDataEnum.WecomAccessToken]: 1000 * 60 * 60 * 2, // 2 hours
  [TmpDataEnum.OffiAccountAccessToken]: 1000 * 60 * 60 * 2, // 2 hours
  [TmpDataEnum.QPSLimit]: 1000 // 1 second
};

export type TmpDataMetadata<T extends TmpDataEnum> = _TmpDataMetadata[T];
export type TmpDataType<T extends TmpDataEnum> = _TmpDataType[T];
