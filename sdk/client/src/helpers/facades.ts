import type { BaseClient } from '../core/baseClient';
import {
  AppsLogsResource,
  AppsResource,
  ChatHistoriesResource,
  ChatRecordsResource,
  ChatResource,
  DatasetsCollectionsResource,
  DatasetsDataResource,
  DatasetsResource,
  ModelsResource
} from '../generated/resources';
import type {
  AppsLogsListUsersReq,
  AppsLogsListUsersRes,
  AppsLogsSearchReq,
  AppsLogsSearchRes,
  ChatHistoriesListReq,
  ChatHistoriesListRes,
  ChatRecordsListReq,
  ChatRecordsListRes,
  DatasetsCollectionsListReq,
  DatasetsCollectionsListRes,
  DatasetsDataListReq,
  DatasetsDataListRes,
  DatasetsListReq,
  DatasetsListRes
} from '../generated/types';
import { ChatInteractiveHelper } from './interactive';
import {
  createCursorPaginator,
  createOffsetPaginator,
  splitAutoPagingOptions,
  splitCursorAutoPagingOptions,
  type AsyncPageIterable,
  type AutoPagingOptions,
  type CursorAutoPagingOptions
} from './pagination';

const stripPaginationCursor = <T extends Record<string, unknown>>(
  req: T | undefined
): Omit<T, 'offset' | 'pageNum'> => {
  if (req === undefined) {
    return {} as Omit<T, 'offset' | 'pageNum'>;
  }
  const { offset: _o, pageNum: _p, ...rest } = req;
  return rest as Omit<T, 'offset' | 'pageNum'>;
};

/**
 * 增强版 `apps.logs` 资源外观，追加游标日志搜索与用户列表自动分页迭代器。
 */
export class AppsLogsFacade extends AppsLogsResource {
  /** 按游标自动分页遍历应用对话日志搜索结果（`POST /core/app/logs/search`）。 */
  searchAutoPaging(
    req: AppsLogsSearchReq,
    options?: CursorAutoPagingOptions
  ): AsyncPageIterable<AppsLogsSearchRes['list'][number]> {
    const { requestOptions, maxItems, maxPages } = splitCursorAutoPagingOptions(options);
    const { cursor: initialCursor, ...baseReq } = req;
    return createCursorPaginator({
      initialCursor,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ cursor }) =>
        this.search(
          {
            ...baseReq,
            ...(cursor !== undefined ? { cursor } : {})
          } as AppsLogsSearchReq,
          requestOptions
        )
    });
  }

  /** 自动分页遍历应用日志用户列表。 */
  listUsersAutoPaging(
    req: AppsLogsListUsersReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<AppsLogsListUsersRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req.offset ?? 0,
      pageSize: pageSize ?? req.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.listUsers(
          { ...baseReq, offset, pageSize: size } as AppsLogsListUsersReq,
          requestOptions
        )
    });
  }
}

export class AppsFacade extends AppsResource {
  override readonly logs: AppsLogsFacade;

  constructor(client: BaseClient) {
    super(client);
    this.logs = new AppsLogsFacade(client);
  }
}

export class ChatHistoriesFacade extends ChatHistoriesResource {
  /** 自动分页遍历会话历史列表。 */
  listAutoPaging(
    req?: ChatHistoriesListReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<ChatHistoriesListRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req?.offset ?? 0,
      pageSize: pageSize ?? req?.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.list({ ...baseReq, offset, pageSize: size } as ChatHistoriesListReq, requestOptions)
    });
  }
}

export class ChatRecordsFacade extends ChatRecordsResource {
  /** 自动分页遍历会话消息记录列表。 */
  listAutoPaging(
    req: ChatRecordsListReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<ChatRecordsListRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req.offset ?? 0,
      pageSize: pageSize ?? req.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.list({ ...baseReq, offset, pageSize: size } as ChatRecordsListReq, requestOptions)
    });
  }
}

export class ChatFacade extends ChatResource {
  override readonly histories: ChatHistoriesFacade;
  override readonly records: ChatRecordsFacade;
  /** 工作流人机交互（userSelect / userInput）识别与一键恢复助手 */
  readonly interactive: ChatInteractiveHelper;

  constructor(client: BaseClient) {
    super(client);
    this.histories = new ChatHistoriesFacade(client);
    this.records = new ChatRecordsFacade(client);
    this.interactive = new ChatInteractiveHelper(this);
  }
}

export class DatasetsCollectionsFacade extends DatasetsCollectionsResource {
  /** 自动分页遍历知识库集合列表。 */
  listAutoPaging(
    req: DatasetsCollectionsListReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<DatasetsCollectionsListRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req.offset ?? 0,
      pageSize: pageSize ?? req.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.list(
          { ...baseReq, offset, pageSize: size } as DatasetsCollectionsListReq,
          requestOptions
        )
    });
  }
}

export class DatasetsDataFacade extends DatasetsDataResource {
  /** 自动分页遍历集合数据分块列表。 */
  listAutoPaging(
    req: DatasetsDataListReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<DatasetsDataListRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req.offset ?? 0,
      pageSize: pageSize ?? req.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.list({ ...baseReq, offset, pageSize: size } as DatasetsDataListReq, requestOptions)
    });
  }
}

export class DatasetsFacade extends DatasetsResource {
  override readonly collections: DatasetsCollectionsFacade;
  override readonly data: DatasetsDataFacade;

  constructor(client: BaseClient) {
    super(client);
    this.collections = new DatasetsCollectionsFacade(client);
    this.data = new DatasetsDataFacade(client);
  }

  /** 自动分页遍历知识库列表。 */
  listAutoPaging(
    req?: DatasetsListReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<DatasetsListRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req?.offset ?? 0,
      pageSize: pageSize ?? req?.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.list({ ...baseReq, offset, pageSize: size } as DatasetsListReq, requestOptions)
    });
  }
}

export type SdkResources = {
  readonly apps: AppsFacade;
  readonly chat: ChatFacade;
  readonly datasets: DatasetsFacade;
  readonly models: ModelsResource;
};

/**
 * 组合生成层 Resource 与手写高阶 Helper Facade，确保 `src/generated/` 保持纯净可随时覆写。
 */
export const createSdkResources = (client: BaseClient): SdkResources => ({
  apps: new AppsFacade(client),
  chat: new ChatFacade(client),
  datasets: new DatasetsFacade(client),
  models: new ModelsResource(client)
});
