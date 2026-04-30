import type { ApiDatasetServerType } from './type';

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
