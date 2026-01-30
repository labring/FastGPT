import { SystemCacheKeyEnum } from './type';
import { refreshSystemTools } from '../../core/app/tool/controller';
import { refreshPluginDatasets } from '../../core/dataset/pluginDataset/controller';

export const initCache = () => {
  global.systemCache = {
    [SystemCacheKeyEnum.systemTool]: {
      versionKey: '',
      data: [],
      refreshFunc: refreshSystemTools,
      devRefresh: true
    },
    [SystemCacheKeyEnum.modelPermission]: {
      versionKey: '',
      data: null,
      refreshFunc: () => Promise.resolve(null)
    },
    [SystemCacheKeyEnum.pluginDatasets]: {
      versionKey: '',
      data: [],
      refreshFunc: refreshPluginDatasets
    }
  };
};
