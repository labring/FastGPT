export type ApiProxyBackendResp<T = any> = {
  success: boolean;
  message: string;
  data?: T;
};
