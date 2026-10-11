import type { ApiDatasetErrorCode, ApiDatasetResult, ApiDatasetServerType } from './type';

export const toApiDatasetSuccess = <T>(data: T): ApiDatasetResult<T> => ({
  success: true,
  data
});

export const toApiDatasetError = <T = never>(
  code: ApiDatasetErrorCode,
  message: string,
  status?: number
): ApiDatasetResult<T> => ({
  success: false,
  code,
  message,
  status
});

export const classifyApiDatasetError = <T = never>(err: any): ApiDatasetResult<T> => {
  if (!err) {
    return toApiDatasetError('UNKNOWN_ERROR', '未知错误');
  }
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  const msg = String(err?.message ?? err?.msg ?? err?.error ?? err);

  if (status === 404 || /not found|文件不存在|不存在/i.test(msg)) {
    return toApiDatasetError('NOT_FOUND', msg || '文件不存在', 404);
  }
  if (status === 429 || /rate|limit|too many|频繁|限流/i.test(msg)) {
    return toApiDatasetError('RATE_LIMIT', msg || '请求过于频繁', 429);
  }
  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|forbidden|no permission|无权限/i.test(msg)
  ) {
    return toApiDatasetError('UNAUTHORIZED', msg || '鉴权失败或无权限', status || 403);
  }
  if (
    (typeof status === 'number' && status >= 500) ||
    ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(err?.code) ||
    /timeout|network|econnreset|service unavailable/i.test(msg)
  ) {
    return toApiDatasetError(
      typeof status === 'number' && status >= 500 ? 'SERVER_ERROR' : 'NETWORK_ERROR',
      msg || '服务或网络异常',
      status
    );
  }
  return toApiDatasetError('UNKNOWN_ERROR', msg, status);
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
