import { SystemCacheKeyEnum } from './type';
import { refreshSystemTools } from '../../core/app/plugin/controller';

global.systemCache = {
  [SystemCacheKeyEnum.systemTool]: {
    syncKey: '',
    data: [],
    refreshFunc: refreshSystemTools
  }
};
