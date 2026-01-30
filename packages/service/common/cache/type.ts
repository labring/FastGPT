import type { AppToolTemplateItemType } from '@fastgpt/global/core/app/tool/type';

// 完整缓存（包含 data + refreshFunc）
export enum SystemCacheKeyEnum {
  systemTool = 'systemTool',
  modelPermission = 'modelPermission'
}

// 只使用 versionKey 的缓存（不包含 data）
export enum VersionOnlyCacheKeyEnum {
  pluginDatasets = 'pluginDatasets'
}

// 联合类型，用于 getVersionKey 和 refreshVersionKey
export type AllCacheKeyEnum = SystemCacheKeyEnum | VersionOnlyCacheKeyEnum;

export type SystemCacheDataType = {
  [SystemCacheKeyEnum.systemTool]: AppToolTemplateItemType[];
  [SystemCacheKeyEnum.modelPermission]: null;
};

type SystemCacheType = {
  [K in SystemCacheKeyEnum]: {
    versionKey: string;
    data: SystemCacheDataType[K];
    refreshFunc: () => Promise<SystemCacheDataType[K]>;
    devRefresh?: boolean;
  };
};

declare global {
  var systemCache: SystemCacheType;
}
