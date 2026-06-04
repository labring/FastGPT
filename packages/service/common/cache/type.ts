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
