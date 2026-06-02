import type { ClientSession } from '../../common/mongo';
import type {
  ChatHistoryItemResType,
  ChatItemResponseSchemaType
} from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getChildrenResponses, mergeChatResponseData } from '@fastgpt/global/core/chat/utils';
import { MongoChatItemResponse } from './chatItemResponseSchema';
import { getLogger, LogCategories } from '../../common/logger';
import { writePrimary } from '../../common/mongo/utils';
import { mongoSessionRun } from '../../common/mongo/sessionRun';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);
// 常规写入失败后最多重试 3 次；仍失败再进入瘦身 fallback，避免异常详情阻断主流程。
const NODE_RESPONSE_WRITE_RETRY_TIMES = 3;

type ChatItemResponseBase = Pick<
  ChatItemResponseSchemaType,
  'teamId' | 'appId' | 'chatId' | 'chatItemDataId'
>;

export type ChatItemResponseStorageRow = ChatItemResponseBase & {
  /**
   * 完整 nodeResponse 数据。身份字段也放在 data 内：
   * - data.id: 本次节点响应实例 ID。
   * - data.parentId: 父响应实例 ID，用于详情读取时重新拼 childrenResponses。
   */
  data: ChatHistoryItemResType;
};

/**
 * saveChat 仍需要同步得到本轮引用、错误数和根节点费用。
 *
 * nodeResponse 详情 rows 可以失败后丢弃，但这些摘要数据已经在运行期得到，不能因为
 * 某批详情写库失败就影响 chat log、计费展示和 cite 记录。
 */
export type NodeResponseWriteSummary = {
  citeCollectionIds: string[];
  errorCount: number;
  lastError?: string;
  totalPoints: number;
};

type ChatItemResponseRowLike = {
  data?: ChatHistoryItemResType;
};

type CreateRowsParams = ChatItemResponseBase & {
  nodeResponses?: ChatHistoryItemResType[];
};

/**
 * writer 只依赖 create/deleteMany，测试里可以传入轻量 mock model。
 * 这里刻意不暴露 Mongoose Model 全量类型，降低单元测试和业务代码耦合。
 */
type WriterModel = {
  create: (docs: Record<string, unknown>[], options?: Record<string, unknown>) => Promise<unknown>;
  deleteMany: (
    filter: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
};

// 新运行链路里 response.id 必有；getNanoid 只是兜底测试或异常输入，确保 DB row 可唯一定位。
const getResponseId = (response: ChatHistoryItemResType) => response.id || getNanoid();

const getParentId = (response: ChatHistoryItemResType) => response.parentId;

const getRowResponseId = (row: ChatItemResponseStorageRow) => row.data.id;

/**
 * 数据集搜索节点可能携带完整 quote q/a 文本，体积很大且详情展示只需要来源元信息。
 * 入库前瘦身 quoteList，可以降低单条 row 过大导致 Mongo 写失败的概率。
 */
const slimQuoteListForStorage = (response: ChatHistoryItemResType): ChatHistoryItemResType => {
  if (response.moduleType !== FlowNodeTypeEnum.datasetSearchNode || !response.quoteList) {
    return response;
  }

  return {
    ...response,
    quoteList: response.quoteList.map((quote) => ({
      id: quote.id,
      chunkIndex: quote.chunkIndex,
      datasetId: quote.datasetId,
      collectionId: quote.collectionId,
      sourceId: quote.sourceId,
      sourceName: quote.sourceName,
      score: quote.score
    }))
  };
};

const keepString = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string
) => {
  const value = source[key];
  if (typeof value === 'string' && value) {
    target[key] = value;
  }
};

const keepNumber = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string
) => {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[key] = value;
  }
};

/**
 * 构造失败 fallback row。
 *
 * 如果完整 response 因字段异常、对象过大、不可序列化等原因连续写入失败，最后会只保留
 * 展示连续性所需的关键字段：节点身份、名称、类型、父子关系、运行时间和消耗信息。
 */
const slimNodeResponseData = (response: ChatHistoryItemResType): ChatHistoryItemResType => {
  const source = response as Record<string, unknown>;
  const data: Record<string, unknown> = {
    nodeId: response.nodeId,
    id: response.id,
    moduleType: response.moduleType,
    moduleName: response.moduleName
  };

  ['parentId', 'moduleLogo', 'model', 'embeddingModel', 'rerankModel'].forEach((key) =>
    keepString(data, source, key)
  );

  [
    'runningTime',
    'tokens',
    'inputTokens',
    'outputTokens',
    'contextTotalLen',
    'totalPoints',
    'childTotalPoints',
    'childResponseCount',
    'embeddingTokens',
    'reRankInputTokens',
    'toolCallInputTokens',
    'toolCallOutputTokens'
  ].forEach((key) => keepNumber(data, source, key));

  return data as ChatHistoryItemResType;
};

const slimRowsForFallback = (rows: ChatItemResponseStorageRow[]): ChatItemResponseStorageRow[] =>
  rows.map((row) => ({
    ...row,
    data: slimNodeResponseData(row.data)
  }));

/**
 * 同一批 buffer 里同一个 data.id 可能被多次 record。
 *
 * 例如某节点先写入 loading 状态，随后写入完成态。入库时只保留最后一次数据，避免同一
 * chatItem 下出现重复 id，也减少 delete/create 的工作量。
 */
const dedupeRowsById = (rows: ChatItemResponseStorageRow[]) => {
  const latestIndexById = new Map<string, number>();
  rows.forEach((row, index) => {
    latestIndexById.set(getRowResponseId(row), index);
  });

  return rows.filter((row, index) => latestIndexById.get(getRowResponseId(row)) === index);
};

type ChildStats = {
  childTotalPoints?: number;
  childResponseCount?: number;
};

/**
 * 将 child 响应整理成一棵可递归统计的树。
 *
 * 新数据可能已经是 flat rows 形态，通过 `id/parentId` 表达父子关系；旧数据或测试数据
 * 也可能还带着嵌套 childrenResponses，甚至没有 id。这里会尽量按 parentId 重新挂树，
 * 同时保留没有 id 的节点作为 root，保证后续 child usage 统计不丢历史/异常输入。
 */
const normalizeChildResponseTree = (children: ChatHistoryItemResType[]) => {
  const responseMap = new Map<string, ChatHistoryItemResType>();
  const rootResponseIds = new Set<string>();
  const childIdsByParent = new Map<string, Set<string>>();

  children.forEach((child) => {
    if (!child.id || responseMap.has(child.id)) return;

    responseMap.set(child.id, {
      ...child,
      ...(child.childrenResponses ? { childrenResponses: [...child.childrenResponses] } : {})
    });
  });

  const rootResponses: ChatHistoryItemResType[] = [];
  children.forEach((child) => {
    // 新数据通过 id/parentId 还原扁平 child 树；旧数据或测试 mock 可能没有 id，
    // 这类节点无法参与挂树，但仍必须按原顺序计入统计，避免 child usage 丢失。
    const response = child.id
      ? responseMap.get(child.id)
      : {
          ...child,
          ...(child.childrenResponses ? { childrenResponses: [...child.childrenResponses] } : {})
        };
    if (!response) return;

    const parent =
      child.parentId && child.parentId !== child.id ? responseMap.get(child.parentId) : undefined;
    if (!parent) {
      if (!response.id || !rootResponseIds.has(response.id)) {
        rootResponses.push(response);
        if (response.id) {
          rootResponseIds.add(response.id);
        }
      }
      return;
    }

    const parentChildren = (parent.childrenResponses ||= []);
    if (!response.id) {
      // 理论上无 id child 不会挂树；这里保留旧逻辑的去重口径，兼容异常/测试输入。
      if (!parentChildren.some((item) => item.id === response.id)) {
        parentChildren.push(response);
      }
      return;
    }

    const parentChildIds = childIdsByParent.get(child.parentId!) || new Set<string>();
    if (!parentChildIds.has(response.id)) {
      parentChildIds.add(response.id);
      childIdsByParent.set(child.parentId!, parentChildIds);
      parentChildren.push(response);
    }
  });

  return rootResponses;
};

const getChildStats = (
  children: ChatHistoryItemResType[],
  countedIds = new Set<string>()
): ChildStats => {
  if (children.length === 0) {
    return {
      childTotalPoints: undefined,
      childResponseCount: undefined
    };
  }

  return children.reduce(
    (stats, child) => {
      if (child.id && countedIds.has(child.id)) {
        return stats;
      }
      if (child.id) {
        countedIds.add(child.id);
      }

      const childChildren = normalizeChildResponseTree(getChildrenResponses(child));
      const childStats = getChildStats(childChildren, countedIds);
      // 如果 child 本身还带嵌套 child，则以现场递归结果为准；否则兼容已统计好的 child 字段。
      const nestedTotalPoints =
        childChildren.length > 0 ? childStats.childTotalPoints || 0 : child.childTotalPoints || 0;
      const nestedResponseCount =
        childChildren.length > 0
          ? childStats.childResponseCount || 0
          : child.childResponseCount || 0;

      return {
        childTotalPoints: stats.childTotalPoints + (child.totalPoints || 0) + nestedTotalPoints,
        childResponseCount: stats.childResponseCount + 1 + nestedResponseCount
      };
    },
    {
      childTotalPoints: 0,
      childResponseCount: 0
    }
  );
};

/**
 * 递归统计 child 节点的费用和数量。
 *
 * 父节点自身的 `totalPoints` 仍由调用方单独展示；这里仅统计 child 树，避免父子费用
 * 在详情页和 chat log 里重复累加。
 */
export const getNodeResponseChildStats = (children: ChatHistoryItemResType[] = []): ChildStats =>
  getChildStats(normalizeChildResponseTree(children));

const getResponseChildStats = (
  response: ChatHistoryItemResType,
  children: ChatHistoryItemResType[]
) => {
  // 新写入优先根据现场 children 计算；没有 children 时保留已有统计，兼容调用方已聚合的节点。
  if (children.length > 0) return getChildStats(children);

  return {
    childTotalPoints:
      typeof response.childTotalPoints === 'number' ? response.childTotalPoints : undefined,
    childResponseCount:
      typeof response.childResponseCount === 'number' ? response.childResponseCount : undefined
  };
};

/**
 * 将运行期 nodeResponse 规范化为平铺 rows。
 *
 * record 接收的 nodeResponses 已经是本次要写入的平铺数组：如果某个 response 自身带
 * childrenResponses，说明业务希望它作为该节点的内联详情保存，writer 不再二次展开。
 * 这里只补齐 id/parentId、重算/保留 child 统计并瘦身 quoteList；旧 detail 字段如果
 * 已存在则原样保留，避免 writer 对节点返回结构做额外裁剪。
 */
export const createChatItemResponseRows = ({
  nodeResponses = [],
  ...base
}: CreateRowsParams): ChatItemResponseStorageRow[] => {
  return nodeResponses.map((response) => {
    const id = getResponseId(response);
    const currentParentId = getParentId(response);
    const children = getChildrenResponses(response);
    const { childTotalPoints, childResponseCount } = getResponseChildStats(response, children);
    // data 是当前 nodeResponse 本身：保留 childrenResponses，仅读取时再与 parentId child rows 合并。
    const data = slimQuoteListForStorage({
      ...response,
      id,
      ...(currentParentId ? { parentId: currentParentId } : {}),
      ...(childTotalPoints !== undefined ? { childTotalPoints } : {}),
      ...(childResponseCount !== undefined ? { childResponseCount } : {})
    });

    return {
      ...base,
      data
    };
  });
};

/**
 * 将 `MongoChatItemResponse` rows 还原为前端需要的嵌套 responseData。
 *
 * 新数据只依赖 `data.id/data.parentId` 拼回 `childrenResponses`，返回前统一经过
 * `mergeChatResponseData` 合并交互追加结果。
 */
export const composeNodeResponseDetail = (
  rows: ChatItemResponseRowLike[] = []
): ChatHistoryItemResType[] => {
  const flatResponses: ChatHistoryItemResType[] = [];
  const flatResponseMap = new Map<string, ChatHistoryItemResType>();

  rows.forEach((row) => {
    if (!row.data) return;

    const id = row.data.id;
    if (!id) {
      return;
    }

    const response: ChatHistoryItemResType = {
      ...row.data,
      id
    };

    flatResponses.push(response);
    flatResponseMap.set(id, response);
  });

  const rootResponses: ChatHistoryItemResType[] = [];
  flatResponses.forEach((response) => {
    const parentId = response.parentId;
    // parentId 指向自身或找不到 parent 时按 root 展示，避免异常数据让详情节点丢失。
    const parent = parentId && parentId !== response.id ? flatResponseMap.get(parentId) : undefined;

    if (!parent) {
      rootResponses.push(response);
      return;
    }

    (parent.childrenResponses ||= []).push(response);
  });

  // 最后统一跑 mergeChatResponseData，保留交互节点 mergeSignId 等历史合并语义。
  return mergeChatResponseData(rootResponses);
};

export const composeChatItemResponseData = ({ rows = [] }: { rows?: ChatItemResponseRowLike[] }) =>
  composeNodeResponseDetail(rows);

export const getChatItemResponseData = async ({
  appId,
  chatId,
  chatItemDataId,
  fallbackResponseData
}: {
  appId: string;
  chatId: string;
  chatItemDataId: string;
  fallbackResponseData?: ChatHistoryItemResType[];
}) => {
  const rows = await getChatItemResponseRows({
    appId,
    chatId,
    chatItemDataId
  });

  /**
   * 新数据优先来自 chat_item_responses 平铺表；如果调用方传入旧链路的内存/内联详情，
   * 只有在独立表没有 rows 时才回退，避免新数据被空旧字段或空 flowResponses 覆盖。
   */
  return rows.length > 0 ? composeChatItemResponseData({ rows }) : fallbackResponseData || [];
};

export const getChatItemResponseRows = async ({
  appId,
  chatId,
  chatItemDataId
}: {
  appId: string;
  chatId: string;
  chatItemDataId: string;
}) =>
  // _id 顺序就是 writer create 顺序；详情拼树后，同级 children 也按运行时写入顺序展示。
  MongoChatItemResponse.find(
    { appId, chatId, chatItemDataId },
    {
      data: 1
    }
  )
    .sort({ _id: 1 })
    .lean();

/**
 * 请求级 nodeResponse 写入器。
 *
 * 一个 workflow 请求复用同一个 writer，并通过 `writeQueue` 串行化父/子 workflow 的
 * record 调用，保证 Mongo 写入顺序就是详情展示顺序。flush 使用“先删同 data.id 旧
 * rows，再 ordered create(rows[])”的事务批处理；普通写失败会重试，仍失败时写瘦身
 * rows，最后仍失败只丢弃本批并记录日志，避免异常响应详情阻断主工作流。
 */
export class WorkflowNodeResponseWriter {
  // 尚未 flush 的 rows。record 成功后调用方可以释放原始数组引用，writer 只持有待写 row。
  private buffer: ChatItemResponseStorageRow[] = [];
  // retainInMemory 开启时保留本轮规范化后的 flat rows，业务层需要详情树时再 compose。
  private flatResponseRows: ChatItemResponseStorageRow[] = [];
  private readonly model?: WriterModel;
  private readonly batchSize: number;
  private readonly base: CreateRowsParams;
  private readonly session?: ClientSession;
  private readonly persistToDb: boolean;
  private readonly retainInMemory: boolean;
  // 子 workflow 可能共享同一个 writer，并发 record 必须串行化，才能保证写入顺序稳定。
  private writeQueue = Promise.resolve();
  // replace 模式下用于判断是否已经成功写过新 rows，避免失败时过早清空旧详情。
  private hasPersistedRows = false;
  private failedFlushCount = 0;
  // 按 nodeResponse id 保存摘要贡献；相同 id 的节点完成态会覆盖开始态，避免重复累计。
  private readonly summaryContributions = new Map<string, NodeResponseWriteSummary>();
  private replaceBeforeFirstFlush: boolean;

  constructor({
    model,
    batchSize = 5,
    session,
    replaceBeforeFirstFlush = false,
    persistToDb = true,
    retainInMemory = false,
    ...base
  }: CreateRowsParams & {
    model?: WriterModel;
    batchSize?: number;
    session?: ClientSession;
    replaceBeforeFirstFlush?: boolean;
    persistToDb?: boolean;
    retainInMemory?: boolean;
  }) {
    this.model = persistToDb ? model || MongoChatItemResponse : model;
    this.batchSize = batchSize;
    this.base = base;
    this.session = session;
    this.replaceBeforeFirstFlush = replaceBeforeFirstFlush;
    this.persistToDb = persistToDb;
    this.retainInMemory = retainInMemory;
  }

  /**
   * 将所有写入动作串行化。
   *
   * child workflow、parallel 分支可能并发调用同一个 writer；这里用 promise queue 保证
   * buffer 修改和 Mongo flush 的顺序稳定，同时上一任务失败不会阻塞后续任务继续执行。
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const runTask = this.writeQueue.then(task, task);
    // 队列本身吞掉上一任务错误，避免一次 flush 失败后后续 record 永远挂起。
    this.writeQueue = runTask.then(
      () => undefined,
      () => undefined
    );
    return runTask;
  }

  /**
   * 收集 saveChat 需要的轻量摘要。
   *
   * 详情 rows 写库失败后可以丢弃，但引用来源、根节点错误数和根节点费用仍需要保存到
   * chat 记录/日志中。相同 response id 的后续 row 会覆盖前一次贡献，避免节点重试或
   * 完成态更新造成重复累计。
   */
  private collectSummary(rows: ChatItemResponseStorageRow[]) {
    rows.forEach((row) => {
      const contribution: NodeResponseWriteSummary = {
        citeCollectionIds: [],
        errorCount: 0,
        totalPoints: 0
      };

      if (row.data.moduleType === FlowNodeTypeEnum.datasetSearchNode) {
        // citeCollectionIds 用于保存聊天记录引用来源；quote 文本本身已在写库前瘦身。
        row.data.quoteList?.forEach((quote) => {
          if (quote.collectionId) {
            contribution.citeCollectionIds.push(quote.collectionId);
          }
        });
      }

      // 保存历史统计保持旧逻辑口径：只按根节点累计错误数和积分。
      const id = getRowResponseId(row);
      if (!row.data.parentId) {
        const errorText = row.data.errorText || row.data.error;
        if (errorText) {
          contribution.errorCount = 1;
          contribution.lastError = String(errorText);
        }
        contribution.totalPoints = row.data.totalPoints || 0;
      }

      if (
        contribution.citeCollectionIds.length > 0 ||
        contribution.errorCount > 0 ||
        contribution.totalPoints !== 0
      ) {
        // 相同 id 后到的 row 覆盖前一次贡献，保证重试/完成态更新后摘要不重复累计。
        this.summaryContributions.set(id, contribution);
      } else {
        this.summaryContributions.delete(id);
      }
    });
  }

  /**
   * 保留请求内 flat nodeResponse。
   *
   * 内存缓存只作为业务入口最终返回使用，不能提前拼树。这里复用 DB 的同 id 最新态语义：
   * 新 row 会替换旧 row，并按最后写入位置进入 flat 列表。
   */
  private retainFlatRows(rows: ChatItemResponseStorageRow[]) {
    if (!this.retainInMemory) return;

    const incomingIds = new Set(rows.map(getRowResponseId));
    this.flatResponseRows = this.flatResponseRows.filter(
      (row) => !incomingIds.has(getRowResponseId(row))
    );
    this.flatResponseRows.push(...rows);
  }

  /**
   * 记录一批 nodeResponse。
   *
   * 输入就是本次要保存的 nodeResponses；writer 不再递归展开 childrenResponses。这里会
   * 转成 rows、去重、收集摘要，然后进入串行队列写入 buffer。buffer 达到 batchSize
   * 时立即 flush；返回值与实际写入的 row data 一致。
   */
  async record(nodeResponses?: ChatHistoryItemResType[]) {
    const rows = dedupeRowsById(
      createChatItemResponseRows({
        ...this.base,
        nodeResponses
      })
    );
    const ids = rows.map(getRowResponseId);
    // 本地关系和摘要必须在入队前更新；即使本批稍后写库失败，saveChat 仍可读取运行期摘要。
    this.collectSummary(rows);

    await this.enqueue(async () => {
      const incomingIds = new Set(ids);
      // buffer 中相同 id 的旧行被新行替换，内存中只保留最后态。
      this.buffer = this.buffer.filter((row) => !incomingIds.has(getRowResponseId(row)));
      this.buffer.push(...rows);
      this.retainFlatRows(rows);
      if (!this.persistToDb) {
        // 只需要 summary/内存详情的 writer 不保留待写 buffer，避免触达 Mongo 事务。
        this.buffer = [];
        return;
      }
      if (this.buffer.length >= this.batchSize) {
        await this.flushBufferedRows();
      }
    });

    return rows.map((row) => row.data);
  }

  /**
   * 记录 child workflow 产生的 nodeResponse，并为缺少 parentId 的 root child 补父节点。
   *
   * 已经带 parentId 的响应说明它有更细的内部层级，不能被外层 parent 覆盖。
   */
  async recordWithParent(nodeResponses?: ChatHistoryItemResType[], parentId?: string) {
    // 子 workflow 的根响应需要挂到外层父响应下；已有 parentId 的节点不覆盖，避免破坏更细层级。
    const responses = parentId
      ? nodeResponses?.map((response) => ({
          ...response,
          parentId: response.parentId || parentId
        }))
      : nodeResponses;

    return this.record(responses);
  }

  /**
   * 删除当前 chat item 下全部独立 nodeResponse rows。
   *
   * 仅用于 replace 模式第一次 flush，保证重新运行后详情完全来自本轮请求。
   */
  private async deleteExistingRows(session?: ClientSession) {
    // replace 模式首次成功写入前清空旧详情，保证恢复/重新运行后详情只来自当前请求。
    await this.getWriteModel().deleteMany(
      {
        appId: this.base.appId,
        chatId: this.base.chatId,
        chatItemDataId: this.base.chatItemDataId
      },
      {
        session,
        ...writePrimary
      }
    );
  }

  /**
   * 删除当前批次中同 id 的旧 rows。
   *
   * append 或节点更新时使用“先删后插”，配合唯一索引保证同一 chat item 下 `data.id`
   * 只有一份最新 row。
   */
  private async deleteRowsById(ids: string[], session?: ClientSession) {
    // 普通 append/更新采用同 id 先删后插，避免 create 时触发 unique index 冲突。
    await this.getWriteModel().deleteMany(
      {
        appId: this.base.appId,
        chatId: this.base.chatId,
        chatItemDataId: this.base.chatItemDataId,
        'data.id': { $in: ids }
      },
      {
        session,
        ...writePrimary
      }
    );
  }

  /**
   * 在一个 Mongo session 内持久化 rows。
   *
   * 写入前先处理 replace/delete-by-id，再用 ordered create 保证本批 rows 要么全部成功，
   * 要么由事务回滚。这里不做 JSON/BSON 体积预估，大小和序列化问题统一交给 Mongo 报错。
   */
  private async persistRows(rows: ChatItemResponseStorageRow[], session?: ClientSession) {
    const ids = [...new Set(rows.map(getRowResponseId))];
    if (this.replaceBeforeFirstFlush && !this.hasPersistedRows) {
      await this.deleteExistingRows(session);
    } else {
      await this.deleteRowsById(ids, session);
    }
    const time = new Date();
    const rowsWithTime = rows.map((row) => ({
      ...row,
      time
    }));

    // 不在写入前用 JSON.stringify 预估体积；BSON 大小、不可序列化字段等问题统一交给
    // Mongo 写入校验，失败后进入 retry/slim fallback，避免正常路径额外 CPU 和临时内存开销。
    await this.getWriteModel().create(rowsWithTime, {
      ordered: true,
      session,
      ...writePrimary
    });
  }

  private getWriteModel() {
    if (!this.model) {
      throw new Error('Workflow node response writer model is required for persistence');
    }

    return this.model;
  }

  /**
   * 为 persistRows 选择事务边界。
   *
   * 外层已传入 session 时复用外层事务；否则为本次 flush 创建短事务，避免 delete 成功、
   * create 失败后留下空详情。
   */
  private async persistRowsWithSession(rows: ChatItemResponseStorageRow[]) {
    if (this.session) {
      // 外层已经有事务时复用 session，保证 chatItem/chatResponse 的写入边界一致。
      await this.persistRows(rows, this.session);
    } else {
      // 独立 writer flush 使用短事务包裹 delete/create，确保一批 rows 要么替换成功，要么回滚。
      await mongoSessionRun((session) => this.persistRows(rows, session));
    }
  }

  /**
   * 执行正常写入重试和瘦身 fallback。
   *
   * 正常 rows 连续失败 3 次后，改写只保留节点身份、父子关系、运行时间和消耗统计的 slim
   * rows，再尝试一次。slim 仍失败时返回 false，由 flushBufferedRows 丢弃详情 rows。
   */
  private async persistRowsWithRetry(rows: ChatItemResponseStorageRow[]) {
    let lastError: unknown;

    for (let retry = 1; retry <= NODE_RESPONSE_WRITE_RETRY_TIMES; retry++) {
      try {
        await this.persistRowsWithSession(rows);
        if (retry > 1) {
          logger.info('Workflow node responses flushed after retry', {
            retry,
            rowCount: rows.length
          });
        }
        return true;
      } catch (error) {
        lastError = error;
        logger.error('Failed to flush workflow node responses', {
          error,
          retry,
          maxRetry: NODE_RESPONSE_WRITE_RETRY_TIMES,
          rowCount: rows.length
        });
      }
    }

    const fallbackRows = slimRowsForFallback(rows);
    try {
      // 瘦身 fallback 仍复用同样的 delete/create 语义，保证成功后同 id 只保留关键字段版本。
      await this.persistRowsWithSession(fallbackRows);
      logger.error('Workflow node responses flushed with slim fallback rows', {
        error: lastError,
        rowCount: rows.length
      });
      return true;
    } catch (error) {
      logger.error('Failed to flush slim workflow node response fallback rows, dropping rows', {
        error,
        originalError: lastError,
        rowCount: rows.length
      });
      return false;
    }
  }

  /**
   * replace 模式首批 rows 完全落库失败后的兜底清理。
   *
   * 首批彻底失败时如果仍保留旧 rows，用户会误以为详情来自本轮运行；因此这里尽量清掉
   * 旧详情。清理失败也只打日志，不阻断 workflow 主流程。
   */
  private async cleanupReplaceRowsAfterDrop() {
    if (!this.replaceBeforeFirstFlush || this.hasPersistedRows) return;

    try {
      // replace 模式第一次写入彻底失败时，清掉旧 rows，避免用户误以为看到了本次运行详情。
      if (this.session) {
        await this.deleteExistingRows(this.session);
      } else {
        await mongoSessionRun((session) => this.deleteExistingRows(session));
      }
      this.replaceBeforeFirstFlush = false;
    } catch (error) {
      logger.error('Failed to clear stale workflow node responses after dropped write rows', {
        error
      });
    }
  }

  /**
   * flush 当前 buffer。
   *
   * flush 前再次按 id 去重，确保同一批内只保留最后态；失败后释放详情 rows 并保留
   * summary。无论成功失败，都会清空 buffer 以降低运行期内存占用。
   */
  private async flushBufferedRows() {
    if (this.buffer.length === 0) return;

    const rows = dedupeRowsById(this.buffer);
    const persisted = await this.persistRowsWithRetry(rows);
    // flush 后立即释放 buffer，避免完整 nodeResponse 长时间占用内存。
    this.buffer = [];

    if (persisted) {
      this.hasPersistedRows = true;
    } else {
      this.failedFlushCount += 1;
      // 写库失败只丢弃详情 rows；运行期已累计的引用、错误数和积分仍要给 saveChat 使用。
      await this.cleanupReplaceRowsAfterDrop();
    }
    if (persisted) {
      // 首次成功写入后 replace 模式结束，后续同 id 更新只做局部 delete/create。
      this.replaceBeforeFirstFlush = false;
    }
  }

  /**
   * 手动 flush 入口。
   *
   * 暴露给调用方在关键阶段主动落库；实际执行仍进入 writeQueue，避免和并发 record 交错。
   */
  async flush() {
    // 手动 flush 也进入同一个队列，避免和并发 record 交错。
    await this.enqueue(() => this.flushBufferedRows());
  }

  /**
   * 关闭 writer 前的最终 flush。
   *
   * root workflow 在 saveChat 前调用 close，尽最大努力写完剩余 rows。失败策略仍是记录日志、
   * 保留 summary、不中断主流程。
   */
  async close() {
    await this.enqueue(async () => {
      // close 是 saveChat 前的最终检查：尽量把剩余 rows 写完；失败则只打日志并保留摘要。
      await this.flushBufferedRows();
      if (this.buffer.length > 0) {
        logger.error('Workflow node response writer closed with pending rows', {
          pendingRows: this.buffer.length,
          failedFlushCount: this.failedFlushCount
        });
      }
    });
  }

  /** 当前 writer 是否已经没有待写入的本地 buffer。 */
  get isFullyFlushed() {
    return this.buffer.length === 0;
  }

  /**
   * 返回 saveChat 使用的运行期摘要。
   *
   * 摘要来源于 record 阶段，不依赖详情 rows 是否最终写库成功；collectionId 会去重，错误
   * 和积分沿用旧逻辑只统计根节点贡献。
   */
  getSummary(): NodeResponseWriteSummary {
    const citeCollectionIds = new Set<string>();
    let errorCount = 0;
    let lastError: string | undefined;
    let totalPoints = 0;

    this.summaryContributions.forEach((contribution) => {
      // collectionId 去重，避免同一引用在节点更新或多次搜索中重复记录。
      contribution.citeCollectionIds.forEach((collectionId) => {
        citeCollectionIds.add(collectionId);
      });
      errorCount += contribution.errorCount;
      totalPoints += contribution.totalPoints;
      if (contribution.lastError) {
        lastError = contribution.lastError;
      }
    });

    return {
      citeCollectionIds: Array.from(citeCollectionIds),
      errorCount,
      lastError,
      totalPoints
    };
  }

  /** 返回本轮请求内保留的 flat nodeResponses。未开启 retainInMemory 时恒为空数组。 */
  getFlatNodeResponses(): ChatHistoryItemResType[] {
    return this.flatResponseRows.map((row) => row.data);
  }
}

/**
 * 创建 workflow nodeResponse writer。
 *
 * `replace` 模式不会在创建时立刻删除旧 rows，而是延迟到第一次 flush 的事务里执行；
 * 这样如果本轮完全没有可写 rows，或第一次写入失败，不会先清空用户还能查看的旧详情。
 */
export const createWorkflowNodeResponseWriter = async ({
  mode,
  session,
  model = MongoChatItemResponse,
  persistToDb = true,
  retainInMemory = false,
  ...params
}: CreateRowsParams & {
  mode: 'replace' | 'append';
  session?: ClientSession;
  model?: WriterModel;
  persistToDb?: boolean;
  retainInMemory?: boolean;
}) => {
  return new WorkflowNodeResponseWriter({
    ...params,
    model,
    session,
    replaceBeforeFirstFlush: persistToDb && mode === 'replace',
    persistToDb,
    retainInMemory
  });
};
