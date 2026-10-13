export enum TmpDataEnum {
  FeishuAccessToken = 'feishu_access_token',
  WecomAccessToken = 'wecom_access_token',
  OffiAccountAccessToken = 'offiaccount_access_token',
  /** 成员模型使用权缓存；存储值沿用 my_models 以兼容已有记录。 */
  MemberModels = 'my_models',
  PasswordChangeSession = 'password_change_session'
}

// PasswordChangeSession 使用专用的哈希 dataId，不通过通用 metadata 拼接原始 Session，避免敏感凭证落库。
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
  [TmpDataEnum.MemberModels]: {
    teamId: string;
    tmbId: string;
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
  [TmpDataEnum.MemberModels]: {
    teamId: string;
    tmbId: string;
    modelIds: string[];
    catalogVersion: string;
    hasManagePer: boolean;
  };
  [TmpDataEnum.PasswordChangeSession]: {
    userId: string;
    loginSessionId: string;
  };
};

export const TmpDataExpireTime = {
  [TmpDataEnum.FeishuAccessToken]: 1000 * 60 * 60 * 1.5, // 1.5 hours
  [TmpDataEnum.WecomAccessToken]: 1000 * 60 * 60 * 2, // 2 hours
  [TmpDataEnum.OffiAccountAccessToken]: 1000 * 60 * 60 * 2, // 2 hours
  [TmpDataEnum.MemberModels]: 1000 * 60 * 60, // 1 hour
  [TmpDataEnum.PasswordChangeSession]: 1000 * 60 * 5 // 5 minutes
};

export type TmpDataWithMetadataEnum = keyof _TmpDataMetadata;
export type TmpDataMetadata<T extends TmpDataWithMetadataEnum> = _TmpDataMetadata[T];
export type TmpDataType<T extends TmpDataEnum> = _TmpDataType[T];
