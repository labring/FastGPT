import { createHash } from 'node:crypto';
import type {
  APIFileItemType,
  ApiDatasetDetailResponse,
  ApiFileReadContentResponseType,
  DingtalkServerType
} from '@fastgpt/global/core/dataset/apiDataset/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type { Method } from 'axios';
import { axios, createProxyAxios } from '../../../../common/api/axios';
import { delRedisCache, getRedisCache, setRedisCache } from '../../../../common/redis/cache';
import { getLogger, LogCategories } from '../../../../common/logger';

type DingtalkAccessTokenResponse = {
  accessToken: string;
  expireIn: number;
};

type DingtalkUserResponse = {
  errcode?: number;
  errmsg?: string;
  result?: {
    unionid?: string;
    userid?: string;
  };
};

type DingtalkListResponse<T> = {
  workspaces?: T[];
  nodes?: T[];
  items?: T[];
  list?: T[];
  nextToken?: string;
  hasMore?: boolean;
};

type DingtalkWorkspace = {
  workspaceId?: string;
  spaceId?: string;
  id?: string;
  name?: string;
  workspaceName?: string;
  rootNodeId?: string;
  rootDentryUuid?: string;
  rootDentryId?: string;
  nodeId?: string;
  dentryUuid?: string;
  modifiedTime?: number | string;
  updatedAt?: number | string;
  createTime?: number | string;
  createdAt?: number | string;
};

type DingtalkNode = {
  nodeId?: string;
  dentryUuid?: string;
  dentryId?: string;
  uuid?: string;
  id?: string;
  parentNodeId?: string;
  parentId?: string;
  name?: string;
  title?: string;
  type?: string;
  nodeType?: string;
  docType?: string;
  fileType?: string;
  extension?: string;
  hasChild?: boolean;
  hasChildren?: boolean;
  modifiedTime?: number | string;
  updatedAt?: number | string;
  createTime?: number | string;
  createdAt?: number | string;
};

type DingtalkNodeDetailResponse = {
  node: DingtalkNode;
};

type ListAllByNextTokenProps<T> = {
  requestPage: (params: { nextToken?: string; maxResults: number }) => Promise<{
    items: T[];
    nextToken?: string;
  }>;
  maxResults?: number;
};

const dingtalkBaseUrl = process.env.DINGTALK_BASE_URL || 'https://api.dingtalk.com';
const dingtalkOapiBaseUrl = process.env.DINGTALK_OAPI_BASE_URL || 'https://oapi.dingtalk.com';
const tokenSafeWindowSeconds = 5 * 60;
const dingtalkListPageSize = 100;
const refreshingTokenMap = new Map<string, Promise<string>>();
const logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET);

const instance = createProxyAxios({
  baseURL: dingtalkBaseUrl,
  timeout: 60000
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanParams = <T extends Record<string, any>>(data: T): T => {
  Object.keys(data).forEach((key) => {
    if (data[key] === undefined || data[key] === '') {
      delete data[key];
    }
  });
  return data;
};

const hashSecret = (secret = '') => createHash('sha256').update(secret).digest('hex').slice(0, 12);

const getDingtalkAccessTokenCacheKey = ({ appKey, appSecret }: DingtalkServerType) =>
  `dataset:dingtalk:accessToken:${appKey}:${hashSecret(appSecret)}`;

const isRateLimitError = (error: any) => {
  const status = error?.response?.status;
  const data = error?.response?.data || error?.data || {};
  const code = String(data.code ?? data.errcode ?? data.errorCode ?? '');
  const message = String(data.message ?? data.errmsg ?? error?.message ?? '');

  return (
    status === 429 ||
    code === '429' ||
    code === '88' ||
    code === '90018' ||
    /rate|limit|too many|频繁|限流/i.test(message)
  );
};

const toSafeError = (error: any) => {
  if (!error) return { message: '未知错误' };
  if (typeof error === 'string') return { message: error };
  if (error?.response?.data) return error.response.data;
  if (error?.data) return error.data;
  if (error?.message) return { message: error.message };
  return error;
};

const requestDingtalkAccessToken = async ({
  appKey,
  appSecret
}: DingtalkServerType): Promise<DingtalkAccessTokenResponse> => {
  if (!appKey || !appSecret) {
    return Promise.reject('钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限');
  }

  try {
    const { data } = await axios.post<DingtalkAccessTokenResponse>(
      `${dingtalkBaseUrl}/v1.0/oauth2/accessToken`,
      {
        appKey,
        appSecret
      }
    );

    if (!data?.accessToken) {
      return Promise.reject('钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限');
    }

    return data;
  } catch (error) {
    logger.warn('DingTalk accessToken request failed', {
      provider: 'dingtalk',
      error: toSafeError(error)
    });

    if (isRateLimitError(error)) {
      return Promise.reject('钉钉鉴权接口请求过快，请稍后重试');
    }
    return Promise.reject('钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限');
  }
};

const getDingtalkAccessToken = async (server: DingtalkServerType) => {
  const cacheKey = getDingtalkAccessTokenCacheKey(server);

  try {
    const cachedToken = await getRedisCache(cacheKey);
    if (cachedToken) return cachedToken;
  } catch (error) {
    logger.warn('DingTalk accessToken cache read failed', {
      provider: 'dingtalk',
      appKey: server.appKey,
      error
    });
  }

  const refreshing = refreshingTokenMap.get(cacheKey);
  if (refreshing) return refreshing;

  const promise = (async () => {
    try {
      const { accessToken, expireIn } = await requestDingtalkAccessToken(server);
      const ttl = Math.max(expireIn - tokenSafeWindowSeconds, 60);

      try {
        await setRedisCache(cacheKey, accessToken, ttl);
      } catch (error) {
        logger.warn('DingTalk accessToken cache write failed', {
          provider: 'dingtalk',
          appKey: server.appKey,
          ttl,
          error
        });
      }

      return accessToken;
    } catch (error) {
      await delRedisCache(cacheKey).catch(() => undefined);
      return Promise.reject(error);
    } finally {
      refreshingTokenMap.delete(cacheKey);
    }
  })();

  refreshingTokenMap.set(cacheKey, promise);
  return promise;
};

const request = async <T>({
  url,
  method,
  accessToken,
  params,
  data
}: {
  url: string;
  method: Method;
  accessToken: string;
  params?: Record<string, any>;
  data?: Record<string, any>;
}): Promise<T> => {
  try {
    const response = await instance.request<T>({
      url,
      method,
      headers: {
        'x-acs-dingtalk-access-token': accessToken,
        'content-type': 'application/json'
      },
      params: params ? cleanParams(params) : undefined,
      data: data ? cleanParams(data) : undefined
    });

    return response.data;
  } catch (error) {
    return Promise.reject(error);
  }
};

const requestWithRateLimitRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (!isRateLimitError(error)) {
      return Promise.reject(error);
    }

    await sleep(1000);
    return fn().catch((retryError) => {
      if (isRateLimitError(retryError)) {
        return Promise.reject('钉钉目录接口请求过快，请稍后重试或减少一次导入的文件夹规模');
      }
      return Promise.reject(retryError);
    });
  }
};

const getDingtalkOperatorId = async ({
  dingtalkServer,
  accessToken
}: {
  dingtalkServer: DingtalkServerType;
  accessToken: string;
}) => {
  try {
    const { data } = await axios.post<DingtalkUserResponse>(
      `${dingtalkOapiBaseUrl}/topapi/v2/user/get`,
      {
        userid: dingtalkServer.userId
      },
      {
        params: {
          access_token: accessToken
        }
      }
    );

    if (data.errcode && data.errcode !== 0) {
      return Promise.reject(data.errmsg || 'DingTalk user get failed');
    }

    const operatorId = data.result?.unionid || data.result?.userid;
    if (!operatorId) {
      return Promise.reject('DingTalk operatorId is empty');
    }

    return operatorId;
  } catch (error) {
    logger.warn('DingTalk operatorId request failed', {
      provider: 'dingtalk',
      userId: dingtalkServer.userId,
      error: toSafeError(error)
    });
    return Promise.reject(
      '获取钉钉用户 unionId 失败，请检查 UserId、通讯录可见范围和 qyapi_get_member 权限'
    );
  }
};

const listAllByNextToken = async <T>({
  requestPage,
  maxResults = dingtalkListPageSize
}: ListAllByNextTokenProps<T>) => {
  const allItems: T[] = [];
  let nextToken: string | undefined;

  do {
    const page = await requestPage({ nextToken, maxResults });
    allItems.push(...page.items);
    nextToken = page.nextToken || undefined;
  } while (nextToken);

  return allItems;
};

const pickListItems = <T>(data: DingtalkListResponse<T>, field: 'workspaces' | 'nodes') =>
  data[field] || data.items || data.list || [];

const parseDingtalkDate = (value?: string | number) => {
  if (!value) return new Date();
  if (typeof value === 'number') {
    return new Date(value < 10000000000 ? value * 1000 : value);
  }
  return new Date(value);
};

const isDingtalkFolderNode = (node: DingtalkNode) => {
  const typeText = [node.type, node.nodeType, node.docType, node.fileType, node.extension]
    .filter(Boolean)
    .join(',')
    .toLowerCase();

  return (
    node.hasChild === true ||
    node.hasChildren === true ||
    typeText.includes('folder') ||
    typeText.includes('directory') ||
    typeText.includes('catalog')
  );
};

const isDingtalkOnlineDocNode = (node: DingtalkNode) => {
  const typeText = [node.type, node.nodeType, node.docType, node.fileType, node.extension]
    .filter(Boolean)
    .join(',')
    .toLowerCase();

  return (
    typeText.includes('wiki_doc') ||
    typeText.includes('document') ||
    typeText.includes('doc') ||
    typeText.includes('adoc')
  );
};

const formatDingtalkWorkspaceItem = ({
  workspace,
  operatorId
}: {
  workspace: DingtalkWorkspace;
  operatorId: string;
}): APIFileItemType | undefined => {
  const workspaceId = workspace.workspaceId || workspace.spaceId || workspace.id;
  const rootNodeId =
    workspace.rootNodeId ||
    workspace.rootDentryUuid ||
    workspace.rootDentryId ||
    workspace.nodeId ||
    workspace.dentryUuid;

  if (!workspaceId || !rootNodeId) return undefined;

  return {
    id: rootNodeId,
    rawId: rootNodeId,
    parentId: operatorId,
    name: workspace.workspaceName || workspace.name || workspaceId,
    type: 'folder',
    hasChild: true,
    updateTime: parseDingtalkDate(workspace.updatedAt || workspace.modifiedTime),
    createTime: parseDingtalkDate(workspace.createdAt || workspace.createTime)
  };
};

const formatDingtalkNodeItem = (node: DingtalkNode): APIFileItemType | undefined => {
  const id = node.nodeId || node.dentryUuid || node.dentryId || node.uuid || node.id;
  const name = node.name || node.title;
  if (!id || !name) return undefined;

  const isFolder = isDingtalkFolderNode(node);
  if (!isFolder && !isDingtalkOnlineDocNode(node)) return undefined;

  return {
    id,
    rawId: id,
    parentId: node.parentNodeId || node.parentId,
    name,
    type: isFolder ? 'folder' : 'file',
    hasChild: isFolder,
    updateTime: parseDingtalkDate(node.updatedAt || node.modifiedTime),
    createTime: parseDingtalkDate(node.createdAt || node.createTime)
  };
};

const listDingtalkWorkspaces = async ({
  accessToken,
  operatorId,
  searchKey
}: {
  accessToken: string;
  operatorId: string;
  searchKey?: string;
}) => {
  try {
    const workspaces = await listAllByNextToken<DingtalkWorkspace>({
      requestPage: async ({ nextToken, maxResults }) => {
        const data = await requestWithRateLimitRetry(() =>
          request<DingtalkListResponse<DingtalkWorkspace>>({
            url: '/v2.0/wiki/workspaces',
            method: 'GET',
            accessToken,
            params: {
              operatorId,
              maxResults,
              nextToken
            }
          })
        );

        return {
          items: pickListItems(data, 'workspaces'),
          nextToken: data.nextToken
        };
      }
    });

    return workspaces
      .filter((item) => !searchKey || (item.workspaceName || item.name || '').includes(searchKey))
      .map((workspace) => formatDingtalkWorkspaceItem({ workspace, operatorId }))
      .filter(Boolean) as APIFileItemType[];
  } catch (error) {
    logger.warn('DingTalk workspace list request failed', {
      provider: 'dingtalk',
      userId: operatorId,
      error: toSafeError(error)
    });
    return Promise.reject('读取钉钉知识库列表失败，请检查 Wiki.Workspace.Read 权限');
  }
};

const listDingtalkChildren = async ({
  accessToken,
  operatorId,
  parentNodeId,
  searchKey
}: {
  accessToken: string;
  operatorId: string;
  parentNodeId: string;
  searchKey?: string;
}) => {
  try {
    const nodes = await listAllByNextToken<DingtalkNode>({
      requestPage: async ({ nextToken, maxResults }) => {
        const data = await requestWithRateLimitRetry(() =>
          request<DingtalkListResponse<DingtalkNode>>({
            url: '/v2.0/wiki/nodes',
            method: 'GET',
            accessToken,
            params: {
              operatorId,
              parentNodeId,
              maxResults,
              nextToken
            }
          })
        );

        return {
          items: pickListItems(data, 'nodes'),
          nextToken: data.nextToken
        };
      }
    });

    return nodes
      .filter((item) => !searchKey || (item.title || item.name || '').includes(searchKey))
      .map(formatDingtalkNodeItem)
      .filter(Boolean) as APIFileItemType[];
  } catch (error) {
    logger.warn('DingTalk node list request failed', {
      provider: 'dingtalk',
      parentId: parentNodeId,
      error: toSafeError(error)
    });

    if (typeof error === 'string') return Promise.reject(error);
    return Promise.reject(
      '读取钉钉目录失败，请检查 rootNodeId、Wiki.Node.Read 权限和知识库访问权限'
    );
  }
};

const collectBlockText = (data: any) => {
  const textList: string[] = [];

  const walk = (value: any, key?: string) => {
    if (typeof value === 'string') {
      if (['text', 'plainText', 'content'].includes(key || '') && value.trim()) {
        textList.push(value.trim());
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => walk(item));
      return;
    }

    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, childValue]) => walk(childValue, childKey));
    }
  };

  walk(data);

  return textList.join('\n');
};

const readDingtalkOnlineDocText = async ({
  accessToken,
  operatorId,
  nodeId
}: {
  accessToken: string;
  operatorId: string;
  nodeId: string;
}) => {
  try {
    let nextToken: string | undefined;
    const contents: string[] = [];

    do {
      const data = await request<any>({
        url: `/v1.0/doc/suites/documents/${nodeId}/blocks`,
        method: 'GET',
        accessToken,
        params: {
          operatorId,
          maxResults: dingtalkListPageSize,
          nextToken
        }
      });

      const rawText = collectBlockText(data);
      if (rawText) contents.push(rawText);
      nextToken = data?.nextToken || data?.nextPageToken;
    } while (nextToken);

    const rawText = contents.join('\n');
    if (!rawText) {
      return Promise.reject('当前仅支持钉钉在线文档文本，不支持该文件类型');
    }

    return rawText;
  } catch (error) {
    logger.error('DingTalk document content request failed', {
      provider: 'dingtalk',
      apiFileId: nodeId,
      error: toSafeError(error)
    });

    if (typeof error === 'string') return Promise.reject(error);
    return Promise.reject('读取钉钉在线文档失败，请检查文档类型和权限');
  }
};

const getDingtalkNodeDetail = async ({
  accessToken,
  operatorId,
  apiFileId
}: {
  accessToken: string;
  operatorId: string;
  apiFileId: string;
}) => {
  const data = await request<DingtalkNodeDetailResponse>({
    url: `/v2.0/wiki/nodes/${apiFileId}`,
    method: 'GET',
    accessToken,
    params: {
      operatorId
    }
  });

  return formatDingtalkNodeItem(data.node);
};

export const useDingtalkDatasetRequest = ({
  dingtalkServer
}: {
  dingtalkServer: DingtalkServerType;
}) => {
  const getTokenAndOperatorId = async () => {
    const accessToken = await getDingtalkAccessToken(dingtalkServer);
    const operatorId = await getDingtalkOperatorId({ dingtalkServer, accessToken });

    return {
      accessToken,
      operatorId
    };
  };

  const listFiles = async ({
    parentId,
    searchKey
  }: {
    parentId?: ParentIdType;
    searchKey?: string;
  }): Promise<APIFileItemType[]> => {
    const { accessToken, operatorId } = await getTokenAndOperatorId();

    if (!dingtalkServer.rootNodeId && !parentId) {
      return listDingtalkWorkspaces({ accessToken, operatorId, searchKey });
    }

    const parentNodeId = String(parentId || dingtalkServer.rootNodeId || '');
    if (!parentNodeId) return [];

    return listDingtalkChildren({
      accessToken,
      operatorId,
      parentNodeId,
      searchKey
    });
  };

  const getFileContent = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiFileReadContentResponseType> => {
    const { accessToken, operatorId } = await getTokenAndOperatorId();
    const [rawText, detail] = await Promise.all([
      readDingtalkOnlineDocText({ accessToken, operatorId, nodeId: apiFileId }),
      getDingtalkNodeDetail({ accessToken, operatorId, apiFileId }).catch(() => undefined)
    ]);

    return {
      title: detail?.name,
      rawText
    };
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }) => {
    return `https://alidocs.dingtalk.com/i/nodes/${apiFileId}`;
  };

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetDetailResponse> => {
    if (apiFileId === dingtalkServer.rootNodeId && dingtalkServer.workspaceName) {
      return {
        id: apiFileId,
        rawId: apiFileId,
        parentId: null,
        name: dingtalkServer.workspaceName,
        type: 'folder',
        hasChild: true,
        updateTime: new Date(),
        createTime: new Date()
      };
    }

    const { accessToken, operatorId } = await getTokenAndOperatorId();
    const detail = await getDingtalkNodeDetail({ accessToken, operatorId, apiFileId });
    if (!detail) return Promise.reject('文件不存在');

    return detail;
  };

  const getFileRawId = (fileId: string) => {
    return fileId;
  };

  return {
    getFileContent,
    listFiles,
    getFilePreviewUrl,
    getFileDetail,
    getFileRawId
  };
};
