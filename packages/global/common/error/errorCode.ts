export const ERROR_CODE: { [key: number]: string } = {
  400: '请求失败',
  401: '无权访问',
  403: '紧张访问',
  404: '请求不存在',
  405: '请求方法错误',
  406: '请求的格式错误',
  410: '资源已删除',
  422: '验证错误',
  500: '服务器发生错误',
  502: '网关错误',
  503: '服务器暂时过载或维护',
  504: '网关超时'
};

export const TOKEN_ERROR_CODE: Record<number, string> = {
  403: '登录状态无效,请重新登录'
};

export const proxyError: Record<string, boolean> = {
  ECONNABORTED: true,
  ECONNRESET: true
};

export enum ERROR_ENUM {
  unAuthorization = 'unAuthorization',
  insufficientQuota = 'insufficientQuota',
  unAuthModel = 'unAuthModel',
  unAuthApiKey = 'unAuthApiKey',
  unAuthDataset = 'unAuthDataset',
  unAuthDatasetCollection = 'unAuthDatasetCollection',
  unAuthFile = 'unAuthFile'
}
export const ERROR_RESPONSE: Record<
  any,
  {
    code: number;
    statusText: string;
    message: string;
    data?: any;
  }
> = {
  [ERROR_ENUM.unAuthorization]: {
    code: 403,
    statusText: ERROR_ENUM.unAuthorization,
    message: '凭证错误',
    data: null
  },
  [ERROR_ENUM.insufficientQuota]: {
    code: 510,
    statusText: ERROR_ENUM.insufficientQuota,
    message: '账号余额不足',
    data: null
  },
  [ERROR_ENUM.unAuthModel]: {
    code: 511,
    statusText: ERROR_ENUM.unAuthModel,
    message: '无权使用该模型',
    data: null
  },
  [ERROR_ENUM.unAuthDataset]: {
    code: 512,
    statusText: ERROR_ENUM.unAuthDataset,
    message: '无权使用该知识库',
    data: null
  },
  [ERROR_ENUM.unAuthFile]: {
    code: 513,
    statusText: ERROR_ENUM.unAuthFile,
    message: '无权阅读该文件',
    data: null
  },
  [ERROR_ENUM.unAuthApiKey]: {
    code: 514,
    statusText: ERROR_ENUM.unAuthApiKey,
    message: 'Api Key 不合法',
    data: null
  },
  [ERROR_ENUM.unAuthDatasetCollection]: {
    code: 515,
    statusText: ERROR_ENUM.unAuthDatasetCollection,
    message: '无权使用该知识库文件',
    data: null
  }
};
