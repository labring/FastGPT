import type {
  NodeViewState,
  RuntimeEdgeId,
  WorkflowChange,
  WorkflowCommand,
  WorkflowCommandError,
  WorkflowFieldIdentity,
  WorkflowNodeData,
  WorkflowReferenceStatus
} from '../types';
import type { StoreEdgeItemType } from '../../type/edge';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  WorkflowReferenceSnapshot
} from '../../type/io';
import type { AppChatConfigType } from '../../../app/type';
import type { WorkflowIOValueTypeEnum } from '../../constants';

// region documentTypes Runtime document and reference graph types

/** Runtime 内部私有契约；不通过 editor/index.ts 对外暴露。 */

/** Document 持有的节点语义记录；画布视图不在其中。 */
export type NodeRecord = {
  data: WorkflowNodeData;
  /** 模板运行时元数据；不能进入 StoreWorkflow 或公开 snapshot。 */
  forbidDelete?: true;
};

/** Node View module 的私有存储：位置与折叠按 nodeId 索引，与语义记录分开演进。 */
export type NodeViewStore = Map<string, NodeViewState>;

/** 一笔事务里单个节点的视图变化；缺省一侧表示该侧没有视图（节点新增或删除）。 */
export type NodeViewChange = {
  nodeId: string;
  before?: NodeViewState;
  after?: NodeViewState;
};

export type IndexedNode = {
  record: NodeRecord;
  index: number;
};

export type EdgeRecord = {
  id: RuntimeEdgeId;
  data: StoreEdgeItemType;
};

export type RuntimeDocument = {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  chatConfig: AppChatConfigType;
  /**
   * 已删除引用来源的历史展示元数据。放在文档里而不是单独状态，
   * 语义事务的 checkpoint 就会连同它一起被 undo / redo 恢复。
   * 数组按事务整体替换，不要原地修改。
   */
  referenceSnapshots: WorkflowReferenceSnapshot[];
};

export type GraphIndex = {
  bySource: Map<string, EdgeRecord[]>;
  byTarget: Map<string, EdgeRecord[]>;
  parentByChild: Map<string, string>;
  /** 父容器 id -> 直接子节点 id；根级子节点收在 ROOT_PARENT_KEY（空串）桶里。 */
  childrenByParent: Map<string, string[]>;
  edgeById: Map<string, EdgeRecord>;
};

export type ReferenceSource = {
  output?: FlowNodeOutputItemType;
  sourceLabel?: string;
  outputLabel?: string;
  icon?: string;
  /** 扁平来源元数据表直接消费的类型字段；output 存在时与其 valueType 一致。 */
  valueType?: WorkflowIOValueTypeEnum;
};

export type ReferenceGraph = {
  /** 每层只保存本次事务触碰的 key；parent 让普通命令无需复制全图。 */
  parent?: ReferenceGraph;
  consumersBySource: Map<string, Set<string> | null>;
  sourcesByConsumer: Map<string, Set<string> | null>;
  sourceKeysByNode: Map<string, Set<string> | null>;
  depth: number;
};

/** 一笔事务内所有 reducer 共享的变更记录；由 Runtime Core 创建并在提交时统一读取。 */
export type MutationMeta = {
  kind: 'semantic' | 'geometry' | 'replace';
  changedNodeIds: Set<string>;
  changedFieldIds: Map<string, WorkflowFieldIdentity>;
  changedEdgeIds: Set<RuntimeEdgeId>;
  affectedNodeIds: Set<string>;
  affectedFieldIds: Map<string, WorkflowFieldIdentity>;
  structureChanged: boolean;
  chatConfigChanged: boolean;
  chatConfigVariablesChanged: boolean;
  nodeChanges: Map<string, { before?: NodeRecord; after?: NodeRecord; afterIndex?: number }>;
  /** 视图变化按 nodeId 保存事务前后值；公开事件的 nodeViewIds 与 history 都由它推导。 */
  nodeViewChanges: Map<string, { before?: NodeViewState; after?: NodeViewState }>;
  addedEdges: Map<string, EdgeRecord>;
  removedEdges: Map<string, EdgeRecord>;
};

// endregion

// region historyTypes Runtime mutation and history types

/** 两种记录都带事务前后的 Content Revision，replay 时恢复，Savepoint 因此可被撤销回干净状态。 */
export type HistoryEntry =
  | {
      kind: 'delta';
      viewChanges: NodeViewChange[];
      beforeContentRevision: number;
      afterContentRevision: number;
      change: WorkflowChange;
    }
  | {
      kind: 'checkpoint';
      before: RuntimeDocument;
      after: RuntimeDocument;
      viewChanges: NodeViewChange[];
      beforeContentRevision: number;
      afterContentRevision: number;
      change: WorkflowChange;
    };

// endregion

// region statusTypes Runtime field status types

export type FieldStatusCache = {
  field: FlowNodeInputItemType;
  statuses: WorkflowReferenceStatus[];
};

// endregion

// region moduleContracts Runtime module interfaces and staging types

export type CanonicalResult = {
  document: RuntimeDocument;
  views: NodeViewStore;
  nextEdgeId: number;
};

/** 交给后续 module 的 Document 只读窄接口；module 不能写 Document 状态。 */
export type DocumentReadApi = {
  readonly getDocument: () => RuntimeDocument;
  readonly getNodeById: (nodeId: string) => NodeRecord | undefined;
  readonly getNodeIndex: () => ReadonlyMap<string, IndexedNode>;
  readonly getGraphIndex: () => GraphIndex;
  readonly isSourceEdgeValid: (edge: EdgeRecord) => boolean;
  /** 读取 staged 事务中的节点下标；始终以 working.nodes 当前顺序为准。 */
  readonly getWorkingNodeIndex: (args: {
    working: RuntimeDocument;
    nodeId: string;
    meta?: MutationMeta;
  }) => number;
};

/** Issue module 需要的 Reference 只读窄接口。 */
export type ReferenceReadApi = {
  readonly getFieldStatuses: (
    nodeId: string,
    field: FlowNodeInputItemType | FlowNodeOutputItemType
  ) => WorkflowReferenceStatus[];
  /**
   * 任意值的引用状态集合。ifElse 条件与 variableUpdate 条目的引用嵌在结构化 value 里，
   * 不是独立字段，因此按值判定；来源范围与类型兼容规则和整字段完全一致。
   */
  readonly getValueStatuses: (args: {
    value: unknown;
    targetNodeId: string;
    targetType?: WorkflowIOValueTypeEnum;
  }) => WorkflowReferenceStatus[];
  /** 引用来源的值类型；来源不存在时返回 undefined，调用方按 any 处理。 */
  readonly getReferenceValueType: (reference: unknown) => WorkflowIOValueTypeEnum | undefined;
};

/**
 * 事务级 staging 上下文。Runtime Core 创建，按命令归属交给对应 module 的 reducer。
 * reducer 只写 `working` 中自己负责的记录，并把结果登记到 `meta`。
 */
export type TransactionContext = {
  working: RuntimeDocument;
  /** 已提交视图的可写副本；提交成功后由 Node View module 接管。 */
  views: NodeViewStore;
  meta: MutationMeta;
  referenceGraph: ReferenceGraph;
};

/** 不参与 Node View 的命令；commitGeometry 由 NodeView module 单独处理。 */
export type SemanticCommand = Exclude<WorkflowCommand, { type: 'commitGeometry' }>;

export type GeometryCommand = Extract<WorkflowCommand, { type: 'commitGeometry' }>;

/** 纯 geometry 事务的 staging 结果；views 缺省表示本笔事务没有任何视图变化。 */
export type GeometryStageResult =
  | { ok: false; error: WorkflowCommandError }
  | { ok: true; views?: NodeViewStore };

// endregion
