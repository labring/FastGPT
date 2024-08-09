export enum TmpDataEnum {
  FeishuAccessToken = 'feishu_access_token'
}

type _TmpDataMetadata = {
  [TmpDataEnum.FeishuAccessToken]: {
    FeishuAppId: string;
  };
};

type _TmpDataType = {
  [TmpDataEnum.FeishuAccessToken]: {
    accessToken: string;
  };
};

export const TmpDataExpireTime = {
  [TmpDataEnum.FeishuAccessToken]: 1000 * 60 * 60 * 1.5 // 1.5 hours
};

export type TmpDataMetadata<T extends TmpDataEnum> = _TmpDataMetadata[T];
export type TmpDataType<T extends TmpDataEnum> = _TmpDataType[T];
