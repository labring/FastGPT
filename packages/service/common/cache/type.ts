import type { AppToolTemplateItemType } from '@fastgpt/global/core/app/tool/type';

export enum SystemCacheKeyEnum {
  systemTool = 'systemTool',
  modelPermission = 'modelPermission'
}

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
