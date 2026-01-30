import type { AppToolTemplateItemType } from '@fastgpt/global/core/app/tool/type';
import type { PluginDatasetType } from '../../core/dataset/pluginDataset/type';

export enum SystemCacheKeyEnum {
  systemTool = 'systemTool',
  modelPermission = 'modelPermission',
  pluginDatasets = 'pluginDatasets'
}

export type SystemCacheDataType = {
  [SystemCacheKeyEnum.systemTool]: AppToolTemplateItemType[];
  [SystemCacheKeyEnum.modelPermission]: null;
  [SystemCacheKeyEnum.pluginDatasets]: PluginDatasetType[];
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
