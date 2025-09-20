import type { SystemPluginTemplateItemType } from '@fastgpt/global/core/app/plugin/type';

export enum SystemCacheKeyEnum {
  systemTool = 'systemTool'
}

export type SystemCacheDataType = {
  [SystemCacheKeyEnum.systemTool]: SystemPluginTemplateItemType[];
};

type SystemCacheType = {
  [K in SystemCacheKeyEnum]: {
    syncKey: string;
    data: SystemCacheDataType[K];
    refreshFunc: () => Promise<SystemCacheDataType[K]>;
  };
};

declare global {
  var systemCache: SystemCacheType;
}
