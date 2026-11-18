/** 可注入的异步缓存接口；调用方负责校验读取值，过期策略由缓存实现管理。 */
export type AsyncCache = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
};

export enum SystemCacheKeyEnum {
  appTemplates = 'appTemplates'
}
