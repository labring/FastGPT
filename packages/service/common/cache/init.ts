import { SystemCacheKeyEnum } from './type';
import { refreshSystemTools } from '../../core/app/plugin/controller';

export const initCache = () => {
  global.systemCache = {
    [SystemCacheKeyEnum.systemTool]: {
      versionKey: '',
      data: [],
      refreshFunc: refreshSystemTools
    },
    [SystemCacheKeyEnum.modelPermission]: {
      versionKey: '',
      data: null,
      refreshFunc: () => Promise.resolve(null)
    }
  };
};
