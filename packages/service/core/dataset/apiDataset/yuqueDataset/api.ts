import type {
  APIFileItemType,
  ApiFileReadContentResponseType,
  YuqueServerType,
  ApiDatasetDetailResponse,
  ApiDatasetResult
} from '@fastgpt/global/core/dataset/apiDataset/type';
import {
  classifyApiDatasetError,
  toApiDatasetError,
  toApiDatasetSuccess
} from '@fastgpt/global/core/dataset/apiDataset/utils';
import { type Method } from 'axios';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { createProxyAxios } from '../../../../common/api/axios';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/controller';
import { serviceEnv } from '../../../../env';
import type { AsyncCache } from '../../../../common/cache/type';
import { hashStr } from '@fastgpt/global/common/string/tools';

type ResponseDataType = {
  success: boolean;
  message: string;
  data: any;
  error?: unknown;
};

type YuqueRepoListResponse = {
  id: string;
  name: string;
  title: string;
  book_id: string | null;
  type: string;
  updated_at: Date;
  created_at: Date;
  slug?: string;
}[];

type YuqueTocListResponse = {
  uuid: string;
  type: string;
  title: string;
  url: string;
  slug: string;
  id: string;
  doc_id: string;
  prev_uuid: string;
  sibling_uuid: string;
  child_uuid: string;
  parent_uuid: string;
}[];

// 同一进程内，使用同一个缓存对象的浏览请求合并首次加载；结束后清除，不保存长期内存快照。
const pendingSnapshots = new WeakMap<AsyncCache, Map<string, Promise<unknown>>>();
const getYuqueBaseUrl = () =>
  getSystemInstanceConfig().providers.dataSource.yuqueDatasetBaseUrl ||
  serviceEnv.YUQUE_DATASET_BASE_URL;

/** 语雀 Provider 可注入浏览缓存；默认只复用本轮快照，不依赖缓存后端或持久化 TTL。 */
export const useYuqueDatasetRequest = ({
  yuqueServer,
  cache
}: {
  yuqueServer: YuqueServerType;
  cache?: AsyncCache;
}) => {
  const yuqueBaseUrl = getYuqueBaseUrl();
  const logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET);
  // YUQUE_DATASET_BASE_URL 由部署方配置，可能指向内网代理，不使用 SSRF 拦截器。
  const instance = createProxyAxios(
    {
      baseURL: getYuqueBaseUrl(),
      timeout: 60000, // 超时时间
      headers: {
        'X-Auth-Token': yuqueServer.token
      }
    },
    false
  );

  /**
   * 响应数据检查
   */
  const checkRes = (data: ResponseDataType) => {
    if (data === undefined) {
      logger.warn('Yuque dataset response data is empty');
      return Promise.reject('服务器异常');
    }
    // 代理或旧协议可能用 HTTP 200 返回失败；不能把它当作空知识库列表。
    if (data.success === false || data.error) {
      return Promise.reject(data);
    }
    return data.data;
  };
  const responseError = (err: any) => {
    logger.error('Yuque dataset request failed', { error: err });

    if (!err) {
      return Promise.reject({ message: '未知错误' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: err });
    }
    // 保留 HTTP 状态、网络错误码和响应体，详情层统一分类时不能丢失删除判断依据。
    return Promise.reject(err);
  };

  /** 缓存不可用时继续访问来源；只保存完整有效快照，Provider 失败仍原样向外抛出。 */
  const getSnapshot = async <T>({
    resource,
    load,
    isValid
  }: {
    resource: string;
    load: () => Promise<T>;
    isValid: (value: unknown) => value is T;
  }): Promise<T> => {
    if (!cache) return load();
    const key = JSON.stringify([
      yuqueBaseUrl,
      yuqueServer.userId,
      hashStr(yuqueServer.token ?? ''),
      resource
    ]);
    const pending = pendingSnapshots.get(cache) ?? new Map<string, Promise<unknown>>();
    pendingSnapshots.set(cache, pending);
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      const value = await cache.get(key).catch((error) => {
        logger.warn('Yuque snapshot cache read failed', { error });
        return undefined;
      });
      if (isValid(value)) return value;

      const data = await load();
      if (isValid(data)) {
        await cache.set(key, data).catch((error) => {
          logger.warn('Yuque snapshot cache write failed', { error });
        });
      }
      return data;
    })();
    pending.set(key, promise);
    try {
      return await promise;
    } finally {
      pending.delete(key);
      if (pending.size === 0) pendingSnapshots.delete(cache);
    }
  };

  const tocCache = new Map<string, Promise<YuqueTocListResponse>>();
  const getRepoToc = (repoId: string | number) => {
    const key = String(repoId);
    if (!tocCache.has(key)) {
      tocCache.set(
        key,
        getSnapshot({
          resource: `toc:${key}`,
          load: () => request<YuqueTocListResponse>(`/api/v2/repos/${key}/toc`, {}, 'GET'),
          isValid: (value): value is YuqueTocListResponse =>
            Array.isArray(value) &&
            value.every(
              (item) =>
                item &&
                (typeof item.id === 'string' || typeof item.id === 'number') &&
                String(item.id).length > 0 &&
                typeof item.uuid === 'string' &&
                item.uuid.length > 0 &&
                typeof item.type === 'string' &&
                typeof item.title === 'string' &&
                typeof item.parent_uuid === 'string'
            )
        }).catch((err) => {
          tocCache.delete(key);
          return Promise.reject(err);
        })
      );
    }
    return tocCache.get(key)!;
  };

  const request = <T>(url: string, data: any, method: Method): Promise<T> => {
    /* 去空 */
    for (const key in data) {
      if (data[key] === undefined) {
        delete data[key];
      }
    }

    return instance
      .request({
        url,
        method,
        data: ['POST', 'PUT'].includes(method) ? data : undefined,
        params: !['POST', 'PUT'].includes(method) ? data : undefined
      })
      .then((res) => checkRes(res.data))
      .catch((err) => responseError(err));
  };

  let repoList: Promise<YuqueRepoListResponse> | undefined;
  /** 全部分页完成后才缓存；列表和知识库根详情共用本实例快照，失败后可重试。 */
  const getRepoList = () => {
    repoList ??= getSnapshot({
      resource: 'repos',
      load: async () => {
        const limit = 100;
        const allData: YuqueRepoListResponse = [];
        for (let offset = 0; ; offset += limit) {
          const data = await request<YuqueRepoListResponse>(
            `/api/v2/groups/${yuqueServer.userId}/repos`,
            { offset, limit },
            'GET'
          );
          if (!data || data.length === 0) break;
          if (!Array.isArray(data)) return Promise.reject('Invalid file data format');
          allData.push(...data);
          if (data.length < limit) break;
        }
        return allData;
      },
      isValid: (value): value is YuqueRepoListResponse =>
        Array.isArray(value) &&
        value.every(
          (item) =>
            item &&
            (typeof item.id === 'string' || typeof item.id === 'number') &&
            String(item.id).length > 0 &&
            typeof item.name === 'string' &&
            item.name.length > 0
        )
    }).catch((error) => {
      repoList = undefined;
      return Promise.reject(error);
    });
    return repoList;
  };

  const listFiles = async ({ parentId }: { parentId?: ParentIdType }) => {
    // Auto set baseurl to parentId
    if (!parentId) {
      if (yuqueServer.basePath) parentId = yuqueServer.basePath;
    }

    let files: APIFileItemType[] = [];

    if (!parentId) {
      const allData = await getRepoList();
      files = allData.map((item) => {
        return {
          id: String(item.id),
          rawId: String(item.id),
          name: item.name,
          parentId: null,
          type: 'folder',
          updateTime: item.updated_at,
          createTime: item.created_at,
          hasChild: true,
          slug: item.slug
        };
      });
    } else {
      const numParentId = Number(parentId);
      if (!isNaN(numParentId)) {
        // 获取目录树
        const data = await getRepoToc(parentId);

        return data
          .filter((item) => !item.parent_uuid && item.type !== 'LINK')
          .map((item) => ({
            id: `${parentId}-${item.id}-${item.uuid}`,
            rawId: String(item.uuid),
            name: item.title,
            parentId: item.parent_uuid,
            type: item.type === 'TITLE' ? ('folder' as const) : ('file' as const),
            updateTime: new Date(),
            createTime: new Date(),
            uuid: item.uuid,
            slug: item.slug,
            hasChild: !!item.child_uuid
          }));
      } else {
        const [repoId, uuid, parentUuid] = parentId.split(/-(.*?)-(.*)/);
        const data = await getRepoToc(repoId);
        return data
          .filter((item) => item.parent_uuid === parentUuid)
          .map((item) => ({
            id: `${repoId}-${item.id}-${item.uuid}`,
            rawId: String(item.uuid),
            name: item.title,
            parentId: item.parent_uuid,
            type: item.type === 'TITLE' ? ('folder' as const) : ('file' as const),
            updateTime: new Date(),
            createTime: new Date(),
            uuid: item.uuid,
            slug: item.slug,
            hasChild: !!item.child_uuid
          }));
      }
    }

    if (!Array.isArray(files)) {
      return Promise.reject('Invalid file list format');
    }
    if (files.some((file) => !file.id || !file.name || typeof file.type === 'undefined')) {
      return Promise.reject('Invalid file data format');
    }
    return files;
  };

  const getFileContent = async ({
    apiFileId
  }: {
    apiFileId: string;
    usageId?: string;
  }): Promise<ApiFileReadContentResponseType> => {
    if (typeof apiFileId !== 'string') return Promise.reject('Invalid file id');
    const [parentId, fileId] = apiFileId.split(/-(.*?)-(.*)/);

    const data = await request<{ title: string; body: string }>(
      `/api/v2/repos/${parentId}/docs/${fileId}`,
      {},
      'GET'
    );

    if (!data.title) {
      return Promise.reject('Cannot find the file');
    }

    return {
      title: data.title,
      rawText: data.body
    };
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }) => {
    const [parentId, fileId] = apiFileId.split(/-(.*?)-(.*)/);

    const { slug: parentSlug } = await request<{ slug: string }>(
      `/api/v2/repos/${parentId}`,
      { id: apiFileId },
      'GET'
    );

    const { slug: fileSlug } = await request<{ slug: string }>(
      `/api/v2/repos/${parentId}/docs/${fileId}`,
      {},
      'GET'
    );

    return `${getYuqueBaseUrl()}/${yuqueServer.userId}/${parentSlug}/${fileSlug}`;
  };

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetResult<ApiDatasetDetailResponse>> => {
    try {
      // 数字 ID 表示知识库，复用本轮已完整加载的列表。
      if (typeof apiFileId === 'number' || !isNaN(Number(apiFileId))) {
        const allData = await getRepoList();
        const file = allData.find((item) => Number(item.id) === Number(apiFileId));
        if (!file) {
          return toApiDatasetError({ code: 'NOT_FOUND', message: '文件不存在', status: 404 });
        }
        return toApiDatasetSuccess({
          id: String(file.id),
          rawId: String(file.id),
          name: file.name,
          parentId: null,
          type: 'folder' as const,
          updateTime: file.updated_at,
          createTime: file.created_at,
          hasChild: true
        });
      } else {
        // 语雀特殊：一个 TOC 节点有三套 id（repoId / docId / uuid），单用 docId 在同 repo 内唯一但跨 repo 会撞。
        // 因此 `listFiles` 统一用复合 id `repoId-docId-uuid` 作为 `id`，`getFileDetail`/`getFileContent` 必须按同一
        // 复合形态返回/解析 —— 否则 buildSeeds 拿到裸 docId 去比对本地 apiFileId 会全部落空，
        // 把本地已有 collection 误判为「远端已删除」后删掉重建。
        const [repoId, parentUuid, fileId] = apiFileId.split(/-(.*?)-(.*)/);
        const data = await getRepoToc(repoId);
        const file = data.find((item) => item.uuid === fileId);
        if (!file) {
          return toApiDatasetError({ code: 'NOT_FOUND', message: '文件不存在', status: 404 });
        }
        const parentfile = data.find((item) => item.uuid === file.parent_uuid);
        const parentId = `${repoId}-${parentfile?.id}-${parentfile?.uuid}`;
        const id = `${repoId}-${file.id}-${file.uuid}`;

        //判断如果parent_uuid为空，则认为是知识库的根目录，返回知识库
        if (file.parent_uuid) {
          return toApiDatasetSuccess({
            id,
            rawId: String(file.uuid),
            name: file.title,
            parentId: parentId,
            type: file.type === 'TITLE' ? ('folder' as const) : ('file' as const),
            updateTime: new Date(),
            createTime: new Date(),
            hasChild: !!file.child_uuid
          });
        } else {
          return toApiDatasetSuccess({
            id,
            rawId: String(file.uuid),
            name: file.title,
            parentId: repoId,
            type: file.type === 'TITLE' ? ('folder' as const) : ('file' as const),
            updateTime: new Date(),
            createTime: new Date(),
            hasChild: !!file.child_uuid
          });
        }
      }
    } catch (err: any) {
      return classifyApiDatasetError(err);
    }
  };

  const getFileRawId = (fileId: string) => {
    const [repoId, parentUuid, fileUuid] = fileId.split(/-(.*?)-(.*)/);
    if (fileUuid) {
      return `${fileUuid}`;
    } else {
      return `${repoId}`;
    }
  };

  return {
    getFileContent,
    listFiles,
    getFilePreviewUrl,
    getFileDetail,
    getFileRawId
  };
};
