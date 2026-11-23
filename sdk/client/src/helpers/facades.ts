import type { BaseClient } from '../core/baseClient';
import type { RequestOptions } from '../core/types';
import {
  AppsLogsResource,
  AppsResource,
  ChatFilesResource,
  ChatHistoriesResource,
  ChatRecordsResource,
  ChatResource,
  DatasetsCollectionsResource,
  DatasetsDataResource,
  DatasetsResource,
  DatasetsSynonymsResource,
  DatasetsTrainingResource,
  ModelsResource,
  SystemResource
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
  DatasetsListRes,
  DatasetsSynonymsListMappingsReq,
  DatasetsSynonymsListMappingsRes,
  DatasetsTrainingListCollectionErrorsReq,
  DatasetsTrainingListCollectionErrorsRes,
  DatasetsTrainingListDatasetErrorsReq,
  DatasetsTrainingListDatasetErrorsRes
} from '../generated/types';
import {
  uploadChatAttachment,
  type UploadChatFileParams,
  type UploadChatFileResult
} from './chatUpload';
import {
  uploadDatasetCollectionFile,
  waitForCollectionTraining,
  waitForDatasetTraining,
  type UploadDatasetFileParams,
  type UploadDatasetFileResult,
  type WaitForCollectionTrainingParams,
  type WaitForCollectionTrainingResult,
  type WaitForDatasetTrainingParams,
  type WaitForDatasetTrainingResult
} from './datasetUpload';
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

export class ChatFilesFacade extends ChatFilesResource {
  private readonly _baseClient: BaseClient;

  constructor(client: BaseClient) {
    super(client);
    this._baseClient = client;
  }

  /**
   * 一键上传对话附件（自动走预签名 Single/Multipart 上传）并附带 `toContentPart()` 构造器。
   */
  upload(params: UploadChatFileParams, options?: RequestOptions): Promise<UploadChatFileResult> {
    return uploadChatAttachment({
      client: this._baseClient,
      chatFilesResource: this,
      params,
      options
    });
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
  override readonly files: ChatFilesFacade;
  override readonly histories: ChatHistoriesFacade;
  override readonly records: ChatRecordsFacade;
  /** 工作流人机交互（userSelect / userInput）识别与一键恢复助手 */
  readonly interactive: ChatInteractiveHelper;

  constructor(client: BaseClient) {
    super(client);
    this.files = new ChatFilesFacade(client);
    this.histories = new ChatHistoriesFacade(client);
    this.records = new ChatRecordsFacade(client);
    this.interactive = new ChatInteractiveHelper(this);
  }
}

export class DatasetsCollectionsFacade extends DatasetsCollectionsResource {
  private readonly _baseClient: BaseClient;
  private readonly _parentDatasets: DatasetsResource;

  constructor(client: BaseClient, parentDatasets: DatasetsResource) {
    super(client);
    this._baseClient = client;
    this._parentDatasets = parentDatasets;
  }

  /**
   * 知识库一键上传文件并创建集合（默认走 S3 预签名两阶段上传，可选等待训练完成）。
   */
  uploadFile(
    params: UploadDatasetFileParams,
    options?: RequestOptions
  ): Promise<UploadDatasetFileResult> {
    return uploadDatasetCollectionFile({
      client: this._baseClient,
      collectionsResource: this,
      filesResource: this._parentDatasets.files,
      trainingResource: this._parentDatasets.training,
      params,
      options
    });
  }

  /**
   * 轮询等待单个知识库集合的训练排队与执行计数归零，可选自动拉取异常分块详情。
   */
  waitForTraining(
    params: WaitForCollectionTrainingParams,
    options?: RequestOptions
  ): Promise<WaitForCollectionTrainingResult> {
    return waitForCollectionTraining({
      collectionsResource: this,
      trainingResource: this._parentDatasets.training,
      params,
      options
    });
  }

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

export class DatasetsSynonymsFacade extends DatasetsSynonymsResource {
  /** 自动分页遍历知识库同义词映射列表。 */
  listMappingsAutoPaging(
    req: DatasetsSynonymsListMappingsReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<DatasetsSynonymsListMappingsRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req.offset ?? 0,
      pageSize: pageSize ?? req.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.listMappings(
          { ...baseReq, offset, pageSize: size } as DatasetsSynonymsListMappingsReq,
          requestOptions
        )
    });
  }
}

export class DatasetsTrainingFacade extends DatasetsTrainingResource {
  /** 自动分页遍历集合训练异常列表。 */
  listCollectionErrorsAutoPaging(
    req: DatasetsTrainingListCollectionErrorsReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<DatasetsTrainingListCollectionErrorsRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req.offset ?? 0,
      pageSize: pageSize ?? req.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.listCollectionErrors(
          { ...baseReq, offset, pageSize: size } as DatasetsTrainingListCollectionErrorsReq,
          requestOptions
        )
    });
  }

  /** 自动分页遍历知识库训练异常集合分组列表。 */
  listDatasetErrorsAutoPaging(
    req: DatasetsTrainingListDatasetErrorsReq,
    options?: AutoPagingOptions
  ): AsyncPageIterable<DatasetsTrainingListDatasetErrorsRes['list'][number]> {
    const { requestOptions, pageSize, maxItems, maxPages } = splitAutoPagingOptions(options);
    const baseReq = stripPaginationCursor(req);
    return createOffsetPaginator({
      initialOffset: req.offset ?? 0,
      pageSize: pageSize ?? req.pageSize,
      maxItems,
      maxPages,
      signal: requestOptions?.signal,
      fetchPage: ({ offset, pageSize: size }) =>
        this.listDatasetErrors(
          { ...baseReq, offset, pageSize: size } as DatasetsTrainingListDatasetErrorsReq,
          requestOptions
        )
    });
  }
}

export class DatasetsFacade extends DatasetsResource {
  override readonly collections: DatasetsCollectionsFacade;
  override readonly data: DatasetsDataFacade;
  override readonly synonyms: DatasetsSynonymsFacade;
  override readonly training: DatasetsTrainingFacade;

  constructor(client: BaseClient) {
    super(client);
    this.collections = new DatasetsCollectionsFacade(client, this);
    this.data = new DatasetsDataFacade(client);
    this.synonyms = new DatasetsSynonymsFacade(client);
    this.training = new DatasetsTrainingFacade(client);
  }

  /**
   * 轮询整个知识库的训练队列直至全部任务完成，并返回是否存在最终异常。
   */
  waitForTraining(
    params: WaitForDatasetTrainingParams,
    options?: RequestOptions
  ): Promise<WaitForDatasetTrainingResult> {
    return waitForDatasetTraining({
      trainingResource: this.training,
      params,
      options
    });
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
  readonly system: SystemResource;
};

/**
 * 组合生成层 Resource 与手写高阶 Helper Facade，确保 `src/generated/` 保持纯净可随时覆写。
 */
export const createSdkResources = (client: BaseClient): SdkResources => ({
  apps: new AppsFacade(client),
  chat: new ChatFacade(client),
  datasets: new DatasetsFacade(client),
  models: new ModelsResource(client),
  system: new SystemResource(client)
});
