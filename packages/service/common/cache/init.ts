import { SystemCacheKeyEnum } from './type';
import { refreshSystemTools } from '../../core/app/tool/controller';

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
    }
  };
};
