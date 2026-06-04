import { SystemCacheKeyEnum } from './type';

export const initCache = () => {
  global.systemCache = {
    [SystemCacheKeyEnum.modelPermission]: {
      versionKey: '',
      data: null,
      refreshFunc: () => Promise.resolve(null)
    }
  };
};
