/** 可注入的异步缓存接口；调用方负责校验读取值，过期策略由缓存实现管理。 */
export type AsyncCache = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
};

export enum SystemCacheKeyEnum {
  modelPermission = 'modelPermission'
}

export type SystemCacheDataType = {
  [SystemCacheKeyEnum.modelPermission]: null;
};

export type SystemCacheType = {
  [K in SystemCacheKeyEnum]: {
    versionKey: string;
    data: SystemCacheDataType[K];
    refreshFunc: () => Promise<SystemCacheDataType[K]>;
    devRefresh?: boolean;
  };
};
