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

export const TOKEN_ERROR_CODE: { [key: number]: string } = {
  506: '请先登录',
  507: '请重新登录',
  508: '登录已过期'
};

export const openaiError: Record<string, string> = {
  context_length_exceeded: '内容超长了，请重置对话',
  Unauthorized: 'API-KEY 不合法',
  rate_limit_reached: 'API被限制，请稍后再试',
  'Bad Request': 'Bad Request~ openai 异常',
  'Bad Gateway': '网关异常，请重试'
};
export const openaiError2: Record<string, string> = {
  insufficient_quota: 'API 余额不足',
  billing_not_active: 'openai 账号异常',
  invalid_request_error: '无效的 openai 请求'
};
export const proxyError: Record<string, boolean> = {
  ECONNABORTED: true,
  ECONNRESET: true
};

export enum ERROR_ENUM {
  unAuthorization = 'unAuthorization',
  insufficientQuota = 'insufficientQuota'
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
    code: 403,
    statusText: ERROR_ENUM.insufficientQuota,
    message: '账号余额不足',
    data: null
  }
};
