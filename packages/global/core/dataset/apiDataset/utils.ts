import type { ApiDatasetErrorCode, ApiDatasetResult, ApiDatasetServerType } from './type';
import { getErrorMessage } from '../../../common/error/utils';

/** 构造成功结果，保留 success 判别类型，便于调用方直接读取 data。 */
export const toApiDatasetSuccess = <T>(
  data: T
): Extract<ApiDatasetResult<T>, { success: true }> => ({
  success: true,
  data
});

/** 构造失败结果；失败分支没有 data，也不会作为异常抛出。 */
export const toApiDatasetError = ({
  code,
  message,
  status
}: {
  code: ApiDatasetErrorCode;
  message: string;
  status?: number;
}): Extract<ApiDatasetResult<never>, { success: false }> => ({
  success: false,
  code,
  message,
  status
});

/**
 * HTTP 状态和结构化错误码优先于文案。只有没有结构化失败信息的旧协议才按文案兜底，
 * 避免鉴权、限流或网络故障中的 not found 文案被同步流程当作删除依据。
 */
export const classifyApiDatasetError = (
  err: unknown
): Extract<ApiDatasetResult<never>, { success: false }> => {
  if (!err) return toApiDatasetError({ code: 'UNKNOWN_ERROR', message: '未知错误' });

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;
  const error = isRecord(err) ? err : {};
  const response = isRecord(error.response) ? error.response : {};
  const body = isRecord(response.data) ? response.data : {};
  const rawStatus = response.status ?? error.status ?? error.statusCode;
  const status = typeof rawStatus === 'number' ? rawStatus : undefined;
  const code = body.code ?? error.code;
  const msg = getErrorMessage(err);

  if (status !== undefined && status >= 400) {
    if (status === 404)
      return toApiDatasetError({ code: 'NOT_FOUND', message: msg || '文件不存在', status });
    if (status === 429)
      return toApiDatasetError({
        code: 'RATE_LIMIT',
        message: msg || '请求过于频繁',
        status
      });
    if (status === 401 || status === 403) {
      return toApiDatasetError({
        code: 'UNAUTHORIZED',
        message: msg || '鉴权失败或无权限',
        status
      });
    }
    if (status >= 500)
      return toApiDatasetError({
        code: 'SERVER_ERROR',
        message: msg || '服务或网络异常',
        status
      });
    return toApiDatasetError({ code: 'UNKNOWN_ERROR', message: msg, status });
  }

  if (
    typeof error.code === 'string' &&
    [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'ECONNABORTED',
      'ERR_NETWORK'
    ].includes(error.code)
  ) {
    return toApiDatasetError({
      code: 'NETWORK_ERROR',
      message: msg || '服务或网络异常',
      status
    });
  }
  // 接受已归一化的失败协议；未知 provider 业务码不能仅凭文案升级为 NOT_FOUND。
  if (code !== undefined) {
    if (typeof code !== 'string')
      return toApiDatasetError({ code: 'UNKNOWN_ERROR', message: msg, status });
    switch (code) {
      case 'NOT_FOUND':
      case 'RATE_LIMIT':
      case 'UNAUTHORIZED':
      case 'NETWORK_ERROR':
      case 'SERVER_ERROR':
      case 'INVALID_PARAMS':
      case 'UNKNOWN_ERROR':
        return toApiDatasetError({ code, message: msg, status });
      default:
        return toApiDatasetError({ code: 'UNKNOWN_ERROR', message: msg, status });
    }
  }

  if (/unauthorized|forbidden|no permission|无权限/i.test(msg)) {
    return toApiDatasetError({ code: 'UNAUTHORIZED', message: msg, status: status ?? 403 });
  }
  if (/rate|limit|too many|频繁|限流/i.test(msg)) {
    return toApiDatasetError({ code: 'RATE_LIMIT', message: msg, status: status ?? 429 });
  }
  if (/timeout|network|econnreset|service unavailable/i.test(msg)) {
    return toApiDatasetError({ code: 'NETWORK_ERROR', message: msg, status });
  }
  if (/not found|文件不存在|不存在/i.test(msg)) {
    return toApiDatasetError({ code: 'NOT_FOUND', message: msg, status: status ?? 404 });
  }
  return toApiDatasetError({ code: 'UNKNOWN_ERROR', message: msg || '未知错误', status });
};

export const filterApiDatasetServerPublicData = (apiDatasetServer?: ApiDatasetServerType) => {
  if (!apiDatasetServer) return undefined;

  const { apiServer, yuqueServer, feishuServer, dingtalkServer } = apiDatasetServer;

  return {
    apiServer: apiServer
      ? {
          baseUrl: apiServer.baseUrl,
          authorization: '',
          basePath: apiServer.basePath
        }
      : undefined,
    yuqueServer: yuqueServer
      ? {
          userId: yuqueServer.userId,
          token: '',
          basePath: yuqueServer.basePath
        }
      : undefined,
    feishuServer: feishuServer
      ? {
          appId: feishuServer.appId,
          appSecret: '',
          folderToken: feishuServer.folderToken
        }
      : undefined,
    dingtalkServer: dingtalkServer
      ? {
          appKey: dingtalkServer.appKey,
          appSecret: '',
          userId: dingtalkServer.userId,
          operatorId: dingtalkServer.operatorId,
          workspaceId: dingtalkServer.workspaceId,
          rootNodeId: dingtalkServer.rootNodeId,
          workspaceName: dingtalkServer.workspaceName
        }
      : undefined
  };
};
