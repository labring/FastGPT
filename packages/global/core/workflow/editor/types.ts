import type { AppChatConfigType } from '../../app/type';
import type { CanonicalWorkflowData } from '../migration/schema';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType,
  ReferenceValueType
} from '../type/io';
import type { StoreEdgeItemType } from '../type/edge';
import type { NodeTemplateContext, StoreNodeItemType, WorkflowCheckIssue } from '../type/node';
import type { WorkflowIOValueTypeEnum } from '../constants';
import type { ModelTypeEnum } from '../../ai/constants';
import type { NodeContainerCheckError } from '../template/context';

/** 递归只读类型，用于阻止调用方通过 scoped snapshot 修改运行时数据。 */
export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** 不包含 position/isFolded 的节点语义数据。 */
export type WorkflowNodeData = Omit<StoreNodeItemType, 'position' | 'isFolded'>;

/** 画布持久化节点视图，不携带任何节点配置。 */
export type NodeViewState = {
  position?: { x: number; y: number };
  isFolded?: boolean;
};

/** 单个节点的持久化视图 snapshot。 */
export type WorkflowNodeViewSnapshot = DeepReadonly<NodeViewState>;

/** 单个节点的公开 scoped snapshot。 */
export type WorkflowNodeSnapshot = DeepReadonly<
  WorkflowNodeData & {
    issues: WorkflowCheckIssue[];
  }
>;

/** 单条连接的公开 snapshot；Runtime Edge ID 保持在 runtime 内部。 */
export type WorkflowEdgeSnapshot = DeepReadonly<StoreEdgeItemType>;

/**
 * 图查询返回的只读边端点视图：只带连线判定需要的四个字段。
 * 内部边记录形状（Runtime Edge ID、索引桶）不出现在这里，之后改索引结构不必动 app。
 */
export type WorkflowEdgeEndpoint = DeepReadonly<
  Pick<StoreEdgeItemType, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>
>;

/**
 * `isHandleConnected` 的入参：三个字段一组传，避免位置参数
 * （syntax.md「函数参数不超过 2 个，多参数用对象传递」）。
 */
export type WorkflowHandleConnectionQuery = {
  nodeId: string;
  handleId: string;
  /** 查该节点的出边索引还是入边索引。 */
  direction: 'source' | 'target';
};

/**
 * Runtime 图查询面：直接读已提交的图索引，把「扫全量边/节点算一个 boolean」换成按索引查询。
 *
 * 对象身份在 runtime 生命周期内不变，因此可以当 value hook selector 的稳定入参与 memo 依赖；
 * 集合返回值在同一结构版本内对同一入参保持同一个数组身份（`Object.is` 稳定），结构变化后更新，
 * 所以也能直接当 selector 的返回值。查询只读且便宜（O(度)），适合放在每次通知都会跑的 selector 里。
 * runtime 释放后索引已清空，查询返回空结果而不抛错，避免卸载竞态把渲染打崩。
 */
export type WorkflowGraphQueries = {
  /** 节点是否被 Agent 挂成工具（存在 selectedTools 入边）。O(入度)。 */
  isMountedTool: (nodeId: string) => boolean;
  /** 节点某个 handle 是否已有连线；`direction` 决定查出边还是入边索引。O(度)。 */
  isHandleConnected: (query: WorkflowHandleConnectionQuery) => boolean;
  /** 指向该节点的边端点视图，顺序同内部入边索引；无入边时返回共享空数组。O(入度)。 */
  getIncomingEdges: (nodeId: string) => readonly WorkflowEdgeEndpoint[];
  /** 容器的直接子节点 id，空串表示文档根级；非容器或无子节点返回共享空数组。O(直接子节点)。 */
  getChildNodeIds: (parentId: string) => readonly string[];
};

/** 一条输入或输出字段的引用诊断。 */
export type WorkflowReferenceStatusCode =
  | 'empty'
  | 'valid'
  | 'invalid_reference'
  | 'unreachable_reference'
  | 'invalid_reference_type';

export type WorkflowReferenceStatus = {
  code: WorkflowReferenceStatusCode;
  sourceType?: WorkflowIOValueTypeEnum;
  reference?: ReferenceValueType;
  sourceLabel?: string;
  outputLabel?: string;
  icon?: string;
};

/** Reference View 中可供当前字段选择的实时来源输出。 */
export type WorkflowReferenceOption = {
  reference: ReferenceItemValueType;
  sourceType?: WorkflowIOValueTypeEnum;
  sourceLabel?: string;
  outputLabel?: string;
  icon?: string;
};

/** 字段 scoped snapshot，输入与输出都使用 Node Field Identity。 */
export type WorkflowFieldSnapshot = DeepReadonly<{
  nodeId: string;
  key: string;
  kind: 'input' | 'output';
  input?: FlowNodeInputItemType;
  output?: FlowNodeOutputItemType;
  references: WorkflowReferenceStatus[];
  referenceOptions: WorkflowReferenceOption[];
}>;

/** 字段读取参数；使用对象便于后续增加 scoped 查询条件。 */
export type WorkflowFieldQuery = {
  nodeId: string;
  fieldKey: string;
  kind?: 'input' | 'output';
};

/** 工作流 scoped snapshot，issues 为当前所有节点问题的扁平只读视图。 */
export type WorkflowSnapshot = DeepReadonly<{
  nodes: WorkflowNodeSnapshot[];
  edges: WorkflowEdgeSnapshot[];
  chatConfig: AppChatConfigType;
  issues: WorkflowCheckIssue[];
  /** 工作流级问题桶：chatConfig 的模型问题不属于任何画布节点。 */
  chatConfigIssues: WorkflowConfigIssue[];
}>;

/**
 * 工作流级问题：与节点问题共用 code 与 params 约定，但没有归属节点，
 * 因此不带 nodeId。gate 的提示文案把它排在节点问题之后。
 */
export type WorkflowConfigIssue = DeepReadonly<Omit<WorkflowCheckIssue, 'nodeId'>>;

/**
 * editor 在 hydrate 时注入的环境事实来源。
 *
 * Runtime 不缓存结果，每轮派生调用一次，因此实现必须同步且便宜（读已就绪的 store 快照，
 * 不发请求、不做深拷贝）。`models` 为 undefined 表示目录尚未就绪，本轮跳过模型相关规则，
 * 等 host 订阅到目录变化后调用 refreshIssues 补上。
 */
export type WorkflowEnvironment = {
  models?: { modelId: string; model: string; type: ModelTypeEnum }[];
  sandbox: { configured: boolean; planSupported: boolean };
};

/** Issue 刷新范围；'all' 表示整份文档。 */
export type WorkflowIssueScope = readonly string[] | 'all';

/** Issue-only 通知载荷：只带 Issue View 实际变化的节点，不是 Workflow Change。 */
export type WorkflowIssueUpdate = DeepReadonly<{ nodeIds: string[] }>;

/** Runtime 创建参数；editor 特性以只读依赖注入，Runtime 不反向依赖 app。 */
export type WorkflowRuntimeOptions = {
  /**
   * 同步的环境事实来源（模型目录与 sandbox）。Runtime 每轮派生调用一次且不缓存，
   * 实现必须同步且便宜；缺省时本轮跳过所有环境规则。
   */
  getEnvironment?: () => WorkflowEnvironment;
};

/** 一次 history entry 的公开状态。 */
export type HistorySnapshot = DeepReadonly<{
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
}>;

/**
 * 保存点：已确认保存的内容版本，以及当前内容是否与之不同。
 * Content Revision 由 history 恢复，因此撤销回已保存内容会自然回到干净状态。
 */
export type WorkflowSavepoint = DeepReadonly<{
  contentRevision: number;
  isDirty: boolean;
}>;

/** 通知来源，undo/redo 也通过同一 external-store 事件通道发布。 */
export type WorkflowChangeOrigin = 'command' | 'undo' | 'redo';

/** Node Data 内字段的稳定身份；input 用 key，output 用 output id。 */
export type WorkflowFieldIdentity = {
  nodeId: string;
  key: string;
  kind: 'input' | 'output';
};

/** Runtime 内单条边的稳定身份；该身份永不进入 StoreWorkflow。 */
export type RuntimeEdgeId = string;

export type WorkflowChangedRecords = {
  nodeIds: string[];
  nodeViewIds: string[];
  fieldIds: WorkflowFieldIdentity[];
  edgeIds: RuntimeEdgeId[];
  chatConfig: boolean;
  chatConfigVariablesChanged: boolean;
};

export type WorkflowAffectedRecords = {
  nodeIds: string[];
  fieldIds: WorkflowFieldIdentity[];
  structure: boolean;
};

type WorkflowChangeBase = {
  origin: WorkflowChangeOrigin;
  version: number;
  transactionId: number;
};

/** 语义节点、边或 chatConfig 发生变化的事件。 */
export type WorkflowSemanticChange = DeepReadonly<
  WorkflowChangeBase & {
    kind: 'semantic';
    changedRecords: WorkflowChangedRecords;
    affectedRecords: WorkflowAffectedRecords;
  }
>;

/** 几何提交事件；瞬时 Canvas frame 不会产生此事件。 */
export type WorkflowGeometryChange = DeepReadonly<
  WorkflowChangeBase & {
    kind: 'geometry';
    changedRecords: WorkflowChangedRecords;
    affectedRecords: WorkflowAffectedRecords;
  }
>;

/** 完整 document replace 事件。 */
export type WorkflowReplaceChange = DeepReadonly<
  WorkflowChangeBase & {
    kind: 'replace';
    /** replace 是全量失效分支，数组保持为空以避免展开全部身份。 */
    changedRecords: WorkflowChangedRecords;
    affectedRecords: WorkflowAffectedRecords;
  }
>;

/** 成功事务完成所有派生状态更新后发布的一条不可变事件。 */
export type WorkflowChange =
  | WorkflowSemanticChange
  | WorkflowGeometryChange
  | WorkflowReplaceChange;

/** 运行时可接受的闭合工作流命令。瞬时 Canvas frame 不属于该联合。 */
export type WorkflowCommand =
  | { type: 'addNode'; node: StoreNodeItemType }
  | { type: 'replaceNode'; nodeId: string; node: StoreNodeItemType }
  | { type: 'updateNode'; nodeId: string; patch: Partial<WorkflowNodeData> }
  | {
      type: 'updateField';
      nodeId: string;
      fieldKey: string;
      value: unknown;
      kind?: 'input' | 'output';
    }
  | { type: 'removeNodes'; nodeIds: string[] }
  | { type: 'connectEdge'; edge: StoreEdgeItemType }
  | {
      type: 'disconnectEdge';
      edgeId?: RuntimeEdgeId;
      edge?: StoreEdgeItemType;
      index?: number;
    }
  | { type: 'attachToContainer'; nodeId: string; containerId: string }
  | { type: 'updateChatConfig'; chatConfig: AppChatConfigType }
  | {
      type: 'commitGeometry';
      nodeId: string;
      position?: { x: number; y: number };
      isFolded?: boolean;
    }
  | { type: 'replaceDocument'; document: CanonicalWorkflowData };

/** 失败事务的结构化原因。失败不会修改任何 observable state。 */
export type WorkflowCommandError = {
  code:
    | 'disposed'
    | 'invalid_command'
    | 'not_found'
    | 'duplicate_node'
    | 'invalid_edge'
    | 'invalid_placement';
  message: string;
  /**
   * `invalid_placement` 的容器拒绝码，供 host 翻译成用户文案；runtime 不接触 i18n。
   * 唯一性拒绝（根级唯一、每容器一个系统子节点）不带 reason：目录侧已按 takenUniqueTypes 过滤。
   */
  reason?: NodeContainerCheckError;
};

/**
 * placement context 请求。`node` 表示来源节点：
 * 缺省即全局/root context（侧边栏添加，添加后由用户自行连线），存在即 handle context
 * （普通 handle 与 tool handle 共用）。无法建立上下文时 runtime 返回 null，调用方按「允许」处理。
 */
export type PlacementRequest = {
  node?: {
    nodeId: string;
    handleId?: string | null;
  };
  /** 侧边栏与画布落点没有来源节点，仍要产出 root context。 */
  isSidebar?: boolean;
};

/** dispatch 的结果；拒绝命令不抛出，也不产生事件或 history。 */
export type WorkflowDispatchResult = {
  ok: boolean;
  change?: WorkflowChange;
  error?: WorkflowCommandError;
};

/** Workflow Runtime Port 的唯一行为测试与 adapter seam。 */
export type WorkflowRuntimePort = {
  getWorkflow: () => WorkflowSnapshot;
  getWorkflowData: () => CanonicalWorkflowData;
  getNode: (nodeId: string) => WorkflowNodeSnapshot | undefined;
  getNodeView: (nodeId: string) => WorkflowNodeViewSnapshot | undefined;
  getField: (query: WorkflowFieldQuery) => WorkflowFieldSnapshot | undefined;
  getHistory: () => HistorySnapshot;
  getSavepoint: () => WorkflowSavepoint;
  getChangeLog: () => readonly WorkflowChange[];
  dispatch: (command: WorkflowCommand | readonly WorkflowCommand[]) => WorkflowDispatchResult;
  subscribe: (listener: (change: WorkflowChange) => void) => () => void;
  undo: () => WorkflowDispatchResult;
  redo: () => WorkflowDispatchResult;
  /** 一次性回放多条相邻 history，最终状态只发布一条 change。 */
  replayHistory: (direction: 'undo' | 'redo', count: number) => WorkflowDispatchResult;
  /**
   * 回填保存点。host 在发起保存请求前读取内容版本，请求成功后用该版本调用本方法，
   * 失败不调用；请求期间产生的新编辑因此仍然算未保存。
   */
  markSaved: (contentRevision: number) => void;
  /**
   * 按当前环境事实重算 Issue View。
   * 它不是 Workflow Command：Content Revision、History、Savepoint 与 dirty 全部不变，
   * 只通过 subscribeIssues 发布 issue-only 通知。
   */
  refreshIssues: (scope?: WorkflowIssueScope) => WorkflowIssueUpdate;
  /** 订阅 issue-only 刷新；语义、几何与 replace 事件仍走 subscribe。 */
  subscribeIssues: (listener: (update: WorkflowIssueUpdate) => void) => () => void;
  /**
   * 按当前 Document 推导模板展示上下文：侧边栏、handle 快捷添加、模板落点、拖入容器与连线校验共用。
   * host 不再从画布数组重建 nodes/edges map。
   */
  getPlacementContext: (request: PlacementRequest) => NodeTemplateContext | null;
  /**
   * 稳定的图查询对象：按已提交的图索引查连线与容器归属，代替 app 侧扫全量边/节点。
   * 返回对象身份在 runtime 生命周期内不变。
   */
  getGraphQueries: () => WorkflowGraphQueries;
  isDisposed: () => boolean;
  dispose: () => void;
};
