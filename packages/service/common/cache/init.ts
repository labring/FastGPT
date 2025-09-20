import { SystemCacheKeyEnum } from './type';
import { refreshSystemTools } from '../../core/app/plugin/controller';

export const initCache = () => {
  global.systemCache = {
    [SystemCacheKeyEnum.systemTool]: {
      syncKey: '',
      data: [],
      refreshFunc: refreshSystemTools
    }
  };
};
