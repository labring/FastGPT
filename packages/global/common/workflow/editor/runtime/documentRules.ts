import {
  ArrayTypeMap,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../../../../core/workflow/constants';
import {
  CanonicalWorkflowDataSchema,
  type CanonicalWorkflowData
} from '../../../../core/workflow/migration/schema';
import { normalizeWorkflowSnapshotArrayReferences, stripCanvasSizeInputs } from '../../migration';
import { assertWorkflowDocumentStructure, getWorkflowBranchInputKey } from '../../connection';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum,
  LoopRunModeEnum,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '../../../../core/workflow/node/constant';
import type { NodeTemplateContext, StoreNodeItemType } from '../../../../core/workflow/type/node';
import type { FlowNodeInputItemType } from '../../../../core/workflow/type/io';
import type { AppChatConfigType } from '../../../../core/app/type';
import {
  arrayReferenceInputKeyByNodeType,
  isWorkflowArrayReferenceInput,
  isWorkflowReferenceItem
} from '../../reference';
import { getNodeContainerCheckError } from '../../../../core/workflow/template/context';
import type { NodeContainerCheckError } from '../../../../core/workflow/template/context';
import { moduleTemplatesFlat } from '../../../../core/workflow/template/constants';
import type { FlowNodeTemplateOutputItemType } from '../../../../core/workflow/template/output';
import type {
  NodeViewState,
  WorkflowCommandError,
  WorkflowFieldIdentity,
  WorkflowNodeData
} from '../../../../core/workflow/editor/types';
import { getWorkflowGlobalVariables } from '../variables';
import { i18nT } from '../../../i18n/utils';
import {
  addFieldIdentity,
  cloneValue,
  getError,
  getFieldIdentity,
  getFieldIdentityKey,
  isObject,
  valuesEqual
} from './kernel';
import { compactReferenceSnapshotsForNodes, updateReferenceGraphNode } from './referenceModule';
import { updateWorkflowNodeOutputValidity } from '../utils';
import type { WorkflowLLMModelMap } from '../../../../core/workflow/template/output';
import type {
  CanonicalResult,
  EdgeRecord,
  GraphIndex,
  IndexedNode,
  MutationMeta,
  NodeRecord,
  NodeViewStore,
  ReferenceGraph,
  RuntimeDocument
} from './types';

/**
 * Document 领域的无状态部分：canonical 转换、node/graph 索引构建与增量维护、
 * placement 与删除规则、事务内的变更记录登记。
 * Document module 的有状态工厂只组合这些规则，不重复实现。
 */

// region documentConstruction Document normalization and change recording

const systemProtectedDeleteTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.pluginOutput,
  FlowNodeTypeEnum.nestedStart,
  FlowNodeTypeEnum.nestedEnd,
  FlowNodeTypeEnum.loopRunStart
]);
const uniqueRootNodeTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.pluginOutput
]);

/** 根级唯一节点类型判定：root context 的 takenUniqueTypes 只统计这一批。 */
export const isUniqueRootNodeType = (flowNodeType: FlowNodeTypeEnum) =>
  uniqueRootNodeTypes.has(flowNodeType);

/**
 * placement 拒绝码：容器拒绝沿用模板规则的结构化码（host 可翻译成用户文案），
 * 其余硬规则（根级放系统子节点、父节点不是容器、系统子节点与容器不匹配）只有开发期 message。
 */
export type PlacementReject = NodeContainerCheckError | 'invalid_placement';

/** 把 placement 拒绝码转成命令错误；reason 只承载容器拒绝码。 */
export const placementError = (reject: PlacementReject): WorkflowCommandError => ({
  code: 'invalid_placement',
  message: 'Node placement is not allowed',
  ...(reject === 'invalid_placement' ? {} : { reason: reject })
});

export const hasForbidDelete = (value: unknown): boolean =>
  isObject(value) && value.forbidDelete === true;

/** 复用未改变的字段对象，维持 scoped field snapshot 的稳定 identity。 */
export const reuseEqualItems = <T>(previous: T[], next: T[]): T[] =>
  next.map((item, index) => (valuesEqual(previous[index], item) ? previous[index] : item));

export const buildNodeIndex = (nodes: NodeRecord[]): Map<string, IndexedNode> =>
  new Map(nodes.map((node, index) => [node.data.nodeId, { record: node, index }] as const));

export const recordNodeChange = ({
  meta,
  nodeId,
  before,
  after,
  afterIndex
}: {
  meta: MutationMeta;
  nodeId: string;
  before?: NodeRecord;
  after?: NodeRecord;
  afterIndex?: number;
}) => {
  const nodeMetadataEqual = (left: WorkflowNodeData, right: WorkflowNodeData) => {
    const { inputs: _leftInputs, outputs: _leftOutputs, ...leftMetadata } = left;
    const { inputs: _rightInputs, outputs: _rightOutputs, ...rightMetadata } = right;
    return valuesEqual(leftMetadata, rightMetadata);
  };
  const previous = meta.nodeChanges.get(nodeId);
  if (previous && !previous.before && !after) {
    meta.nodeChanges.delete(nodeId);
    meta.changedNodeIds.delete(nodeId);
    meta.changedNodeMetadataIds.delete(nodeId);
    [...meta.changedFieldIds].forEach(([key, field]) => {
      if (field.nodeId === nodeId) meta.changedFieldIds.delete(key);
    });
    return;
  }
  if (!before && !after && !previous?.before) {
    meta.nodeChanges.delete(nodeId);
    meta.changedNodeIds.delete(nodeId);
    return;
  }
  meta.nodeChanges.set(nodeId, {
    before: previous?.before ?? before,
    after,
    afterIndex: afterIndex ?? previous?.afterIndex
  });
  meta.changedNodeIds.add(nodeId);
  const original = previous?.before ?? before;
  if (!original || !after || !nodeMetadataEqual(original.data, after.data)) {
    meta.changedNodeMetadataIds.add(nodeId);
  } else {
    meta.changedNodeMetadataIds.delete(nodeId);
  }
};

export const recordEdgeChange = ({
  meta,
  edge,
  kind
}: {
  meta: MutationMeta;
  edge: EdgeRecord;
  kind: 'add' | 'remove';
}) => {
  if (kind === 'add') {
    meta.removedEdges.delete(edge.id);
    meta.addedEdges.set(edge.id, edge);
  } else {
    if (meta.addedEdges.delete(edge.id)) {
      meta.changedEdgeIds.delete(edge.id);
      return;
    }
    meta.removedEdges.set(edge.id, edge);
  }
  meta.changedEdgeIds.add(edge.id);
};

export const collectNodeFieldChanges = ({
  changedFieldIds,
  before,
  after
}: {
  changedFieldIds: Map<string, WorkflowFieldIdentity>;
  before?: WorkflowNodeData;
  after?: WorkflowNodeData;
}) => {
  const previous = new Map<string, WorkflowFieldIdentity>();
  const next = new Map<string, WorkflowFieldIdentity>();
  before?.inputs.forEach((field) => {
    const identity = getFieldIdentity({ nodeId: before.nodeId, field, kind: 'input' });
    previous.set(getFieldIdentityKey(identity), identity);
  });
  before?.outputs.forEach((field) => {
    const identity = getFieldIdentity({ nodeId: before.nodeId, field, kind: 'output' });
    previous.set(getFieldIdentityKey(identity), identity);
  });
  after?.inputs.forEach((field) => {
    const identity = getFieldIdentity({ nodeId: after.nodeId, field, kind: 'input' });
    next.set(getFieldIdentityKey(identity), identity);
  });
  after?.outputs.forEach((field) => {
    const identity = getFieldIdentity({ nodeId: after.nodeId, field, kind: 'output' });
    next.set(getFieldIdentityKey(identity), identity);
  });

  const keys = new Set([...previous.keys(), ...next.keys()]);
  keys.forEach((key) => {
    const previousIdentity = previous.get(key);
    const nextIdentity = next.get(key);
    const previousField = before
      ? previousIdentity?.kind === 'input'
        ? before.inputs.find((field) => field.key === previousIdentity.key)
        : before.outputs.find((field) => field.id === previousIdentity?.key)
      : undefined;
    const nextField = after
      ? nextIdentity?.kind === 'input'
        ? after.inputs.find((field) => field.key === nextIdentity.key)
        : after.outputs.find((field) => field.id === nextIdentity?.key)
      : undefined;
    if (!valuesEqual(previousField, nextField)) {
      addFieldIdentity(changedFieldIds, nextIdentity ?? previousIdentity!);
    }
  });
};

/** Schema.parse 会剥离模板回调；从输入节点或同类型旧记录恢复 Runtime-only 输出状态。 */
export const restoreRuntimeNodeOutputValidity = <T extends WorkflowNodeData>({
  node,
  rawNode,
  fallbackNode
}: {
  node: T;
  rawNode: unknown;
  fallbackNode?: WorkflowNodeData;
}): T => {
  const getOutputMap = (value: unknown) => {
    const rawOutputs = isObject(value) && Array.isArray(value.outputs) ? value.outputs : [];
    const outputs = new Map<string, Record<string, unknown>>();
    rawOutputs.forEach((output) => {
      if (isObject(output) && typeof output.id === 'string') outputs.set(output.id, output);
    });
    return outputs;
  };
  const rawOutputsById = getOutputMap(rawNode);
  const fallbackOutputsById =
    fallbackNode?.flowNodeType === node.flowNodeType
      ? getOutputMap(fallbackNode)
      : new Map<string, Record<string, unknown>>();
  // 画布新增及复制经 Store Schema 剥离函数；从系统模板恢复运行时判定。
  const templateOutputsById = getOutputMap(
    moduleTemplatesFlat.find((template) => template.flowNodeType === node.flowNodeType)
  );

  return {
    ...node,
    outputs: node.outputs.map((output) => {
      const rawOutput = rawOutputsById.get(output.id);
      const fallbackOutput = fallbackOutputsById.get(output.id);
      const templateOutput = templateOutputsById.get(output.id);
      const invalid =
        typeof rawOutput?.invalid === 'boolean' ? rawOutput.invalid : fallbackOutput?.invalid;
      const invalidCondition =
        typeof rawOutput?.invalidCondition === 'function'
          ? rawOutput.invalidCondition
          : (fallbackOutput?.invalidCondition ?? templateOutput?.invalidCondition);
      if (typeof invalid !== 'boolean' && typeof invalidCondition !== 'function') return output;

      return {
        ...output,
        ...(typeof invalid === 'boolean' ? { invalid } : {}),
        ...(typeof invalidCondition === 'function' ? { invalidCondition } : {})
      } as typeof output;
    })
  } as T;
};

/**
 * 提交一次节点记录替换：同步 staged 引用图，只在语义数据真的变化时登记 node change，
 * 并收集受影响的字段身份。replace/updateNode/updateField 三个命令共用这一条提交路径。
 * 视图变化由 Node View module 单独登记，这里只比较语义数据。
 */
export const commitNodeRecordUpdate = ({
  meta,
  referenceGraph,
  nodeId,
  index,
  before,
  after
}: {
  meta: MutationMeta;
  referenceGraph: ReferenceGraph;
  nodeId: string;
  index: number;
  before: NodeRecord;
  after: NodeRecord;
}) => {
  updateReferenceGraphNode({ graph: referenceGraph, before: before.data, after: after.data });
  if (!valuesEqual(before.data, after.data)) {
    recordNodeChange({ meta, nodeId, before, after, afterIndex: index });
  }
  collectNodeFieldChanges({
    changedFieldIds: meta.changedFieldIds,
    before: before.data,
    after: after.data
  });
};

/**
 * 把入站节点拆成语义记录与视图；两侧分别归 Document 与 Node View module 所有。
 * 容器尺寸类隐藏 input 在这里被剥掉：画布测量值不进入 Workflow Document，命令也写不进来。
 */
export const splitNode = (
  node: StoreNodeItemType,
  forbidDelete = hasForbidDelete(node)
): { record: NodeRecord; view: NodeViewState } => {
  const { position, isFolded, ...data } = cloneValue(node);
  if (data.parentNodeId === '') delete data.parentNodeId;
  return {
    record: {
      data: { ...data, inputs: stripCanvasSizeInputs(data) },
      ...(forbidDelete ? { forbidDelete: true } : {})
    },
    view: {
      ...(position ? { position } : {}),
      ...(isFolded !== undefined ? { isFolded } : {})
    }
  };
};

/** 校验节点 ID、容器环和连线端点，拆分 Node Data/Node View 并分配私有边 ID。 */
export const buildDocument = (input: unknown, edgeIdStart = 0): CanonicalResult => {
  const canonical = CanonicalWorkflowDataSchema.parse(input);
  assertWorkflowDocumentStructure(canonical);
  normalizeWorkflowSnapshotArrayReferences(canonical);

  const rawNodes = isObject(input) && Array.isArray(input.nodes) ? input.nodes : [];
  const views: NodeViewStore = new Map();
  const nodes = canonical.nodes.map((node, index) => {
    const rawNode = rawNodes[index];
    const runtimeNode = restoreRuntimeNodeOutputValidity({ node, rawNode });
    const { record, view } = splitNode(runtimeNode, hasForbidDelete(rawNode));
    views.set(record.data.nodeId, view);
    return record;
  });

  // 多选字段的存量单引用在入站升级，保证 Loop 派生和初始保存点都读取同一形状。
  // 动态选项由渲染类型区分数组引用，其他字段保留执行端当作字面量使用的字符串数组。
  nodes.forEach(({ data }) => {
    const { flowNodeType, inputs } = data;
    inputs.forEach((input) => {
      const value = input.value;
      if (
        isWorkflowArrayReferenceInput(flowNodeType, input) &&
        isWorkflowReferenceItem(value) &&
        (flowNodeType === FlowNodeTypeEnum.userSelect ||
          value[0] === VARIABLE_NODE_ID ||
          views.has(value[0]))
      ) {
        input.value = [value];
      }
    });
  });

  let nextEdgeId = edgeIdStart;
  const edges = canonical.edges.map((edge) => ({
    id: `edge-${nextEdgeId++}`,
    data: cloneValue(edge)
  }));
  return {
    document: {
      nodes,
      edges,
      chatConfig: cloneValue(canonical.chatConfig),
      referenceSnapshots: cloneValue(canonical.referenceSnapshots)
    },
    views,
    nextEdgeId
  };
};

const comparableOutput = ({
  invalid,
  invalidCondition,
  ...output
}: FlowNodeTemplateOutputItemType) =>
  invalid === true && !invalidCondition ? { ...output, invalid } : output;

/** 按文档顺序比较持久化内容。共享记录跳过深比较，忽略输出派生状态和私有 Edge ID。 */
export const documentContentsEqual = ({
  before,
  after,
  beforeViews,
  afterViews
}: {
  before: RuntimeDocument;
  after: RuntimeDocument;
  beforeViews: NodeViewStore;
  afterViews: NodeViewStore;
}): boolean => {
  if (
    before.nodes.length !== after.nodes.length ||
    before.edges.length !== after.edges.length ||
    (before.chatConfig !== after.chatConfig && !valuesEqual(before.chatConfig, after.chatConfig)) ||
    (before.referenceSnapshots !== after.referenceSnapshots &&
      !valuesEqual(before.referenceSnapshots, after.referenceSnapshots))
  ) {
    return false;
  }

  const nodesEqual = before.nodes.every((node, index) => {
    const nextNode = after.nodes[index];
    if (node.data !== nextNode.data) {
      const { outputs, ...data } = node.data;
      const { outputs: nextOutputs, ...nextData } = nextNode.data;
      if (!valuesEqual(data, nextData)) return false;
      if (
        outputs !== nextOutputs &&
        (outputs.length !== nextOutputs.length ||
          !outputs.every(
            (output, outputIndex) =>
              output === nextOutputs[outputIndex] ||
              valuesEqual(comparableOutput(output), comparableOutput(nextOutputs[outputIndex]))
          ))
      ) {
        return false;
      }
    }

    const view = beforeViews.get(node.data.nodeId);
    const nextView = afterViews.get(node.data.nodeId);
    return (
      view === nextView ||
      (view?.isFolded === nextView?.isFolded && valuesEqual(view?.position, nextView?.position))
    );
  });

  return (
    nodesEqual &&
    before.edges.every(({ data }, index) => {
      const nextData = after.edges[index].data;
      return data === nextData || valuesEqual(data, nextData);
    })
  );
};

/**
 * 将内部分离存储重新组合成外部 canonical document：语义记录来自 Document，
 * position/isFolded 来自 Node View module。持久化结构只在这个边界组装一次。
 */
export const documentToCanonical = ({
  document,
  views
}: {
  document: RuntimeDocument;
  views: NodeViewStore;
}): CanonicalWorkflowData => ({
  nodes: document.nodes.map(({ data }) => {
    const view = views.get(data.nodeId);
    return {
      ...cloneValue(data),
      // Core 读取保存时的有效状态；模板回调留在编辑器内。
      outputs: cloneValue(data.outputs).map(
        ({ invalidCondition: _, ...output }: FlowNodeTemplateOutputItemType) => output
      ),
      ...(view?.position ? { position: cloneValue(view.position) } : {}),
      ...(view?.isFolded !== undefined ? { isFolded: view.isFolded } : {})
    };
  }),
  edges: document.edges.map((edge) => cloneValue(edge.data)),
  chatConfig: cloneValue(document.chatConfig),
  referenceSnapshots: cloneValue(document.referenceSnapshots)
});

// endregion

// region placementRules Placement and deletion rules

const isForbiddenDeleteNode = (node: NodeRecord) =>
  node.forbidDelete === true || systemProtectedDeleteTypes.has(node.data.flowNodeType);

/**
 * 判断节点在指定容器下的放置是否合法。
 * context 由 Document 按目标父容器派生（documentModule.derivePlacementContext）；
 * 派生不出 context 时按允许处理，与模板规则「无上下文即不限制」保持一致。
 */
export const getPlacementError = ({
  working,
  node,
  parentId,
  context
}: {
  working: RuntimeDocument;
  node: NodeRecord;
  parentId?: string;
  /** 目标父容器的 placement context；root 放置不使用。 */
  context?: NodeTemplateContext | null;
}): PlacementReject | undefined => {
  if (!parentId) {
    return isNestedChildSystemNodeType(node.data.flowNodeType) ||
      node.data.flowNodeType === FlowNodeTypeEnum.loopRunBreak
      ? 'invalid_placement'
      : undefined;
  }

  const parent = working.nodes.find(({ data }) => data.nodeId === parentId);
  if (!parent || !isNestedParentNodeType(parent.data.flowNodeType)) return 'invalid_placement';

  const parentType = parent.data.flowNodeType;
  const isValidSystemChild =
    ((node.data.flowNodeType === FlowNodeTypeEnum.nestedStart ||
      node.data.flowNodeType === FlowNodeTypeEnum.nestedEnd) &&
      (parentType === FlowNodeTypeEnum.loop || parentType === FlowNodeTypeEnum.parallelRun)) ||
    (node.data.flowNodeType === FlowNodeTypeEnum.loopRunStart &&
      parentType === FlowNodeTypeEnum.loopRun) ||
    (node.data.flowNodeType === FlowNodeTypeEnum.loopRunBreak &&
      parentType === FlowNodeTypeEnum.loopRun);
  if (isNestedChildSystemNodeType(node.data.flowNodeType)) {
    return isValidSystemChild ? undefined : 'invalid_placement';
  }
  if (isValidSystemChild) return undefined;

  if (!context) return undefined;

  // 文档节点不携带模板展示字段，按类型解析模板补齐 isShowInContext：
  // 侧边栏目录过滤、目标柄判定与 placement 拒绝因此共用同一条可见性规则。
  const template = moduleTemplatesFlat.find((item) => item.id === node.data.flowNodeType);
  return getNodeContainerCheckError({
    node: { ...node.data, isShowInContext: template?.isShowInContext },
    context
  });
};

/** 校验新增或替换节点的容器、系统节点唯一性，保证 placement 规则只有一个入口。 */
export const validateNodePlacement = ({
  working,
  node,
  excludeNodeId,
  context
}: {
  working: RuntimeDocument;
  node: NodeRecord;
  excludeNodeId?: string;
  /** 目标父容器的 placement context；root 放置不需要。 */
  context?: NodeTemplateContext | null;
}) => {
  const reject = getPlacementError({ working, node, parentId: node.data.parentNodeId, context });
  if (reject) {
    throw placementError(reject);
  }
  if (
    uniqueRootNodeTypes.has(node.data.flowNodeType) &&
    working.nodes.some(
      ({ data }) =>
        data.nodeId !== excludeNodeId &&
        data.flowNodeType === node.data.flowNodeType &&
        !data.parentNodeId
    )
  ) {
    throw getError('invalid_placement', 'Only one root system node is allowed');
  }
  if (
    node.data.parentNodeId &&
    isNestedChildSystemNodeType(node.data.flowNodeType) &&
    working.nodes.some(
      ({ data }) =>
        data.nodeId !== excludeNodeId &&
        data.parentNodeId === node.data.parentNodeId &&
        data.flowNodeType === node.data.flowNodeType
    )
  ) {
    throw getError('invalid_placement', 'Only one system child is allowed per container');
  }
};

/**
 * 删除前校验：受保护节点不能单独删除，条件循环必须保留一个 Break 节点。
 * 父节点同时被删除时豁免，因为整棵子树会一起消失。
 */
export const validateNodeDeletion = ({
  nodes,
  deletedIds
}: {
  nodes: NodeRecord[];
  deletedIds: ReadonlySet<string>;
}) => {
  const isParentDeleted = (node: NodeRecord) =>
    node.data.parentNodeId !== undefined && deletedIds.has(node.data.parentNodeId);

  nodes.forEach((node) => {
    if (!deletedIds.has(node.data.nodeId)) return;
    if (isForbiddenDeleteNode(node) && !isParentDeleted(node)) {
      throw getError('invalid_command', `Node cannot be deleted: ${node.data.nodeId}`);
    }
    if (node.data.flowNodeType !== FlowNodeTypeEnum.loopRunBreak || isParentDeleted(node)) return;

    const parent = nodes.find(({ data }) => data.nodeId === node.data.parentNodeId);
    if (parent?.data.flowNodeType !== FlowNodeTypeEnum.loopRun) return;
    const isConditionalLoop =
      parent.data.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunMode)?.value ===
      'conditional';
    if (!isConditionalLoop) return;

    const hasRemainingBreak = nodes.some(
      ({ data }) =>
        data.parentNodeId === node.data.parentNodeId &&
        data.flowNodeType === FlowNodeTypeEnum.loopRunBreak &&
        !deletedIds.has(data.nodeId)
    );
    if (!hasRemainingBreak) {
      throw getError('invalid_command', 'Conditional loop must retain a break node');
    }
  });
};

/** 输入行配置与动态端口影响画布结构；普通输入值仍由字段订阅读取。 */
const nodeInputStructureChanged = (before: WorkflowNodeData, after: WorkflowNodeData) => {
  if (before.catchError !== after.catchError) return true;
  if (before.inputs === after.inputs) return false;
  if (before.inputs.length !== after.inputs.length) return true;

  const branchKey = getWorkflowBranchInputKey(after.flowNodeType);
  return before.inputs.some((previous, index) => {
    const next = after.inputs[index];
    if (previous === next) return false;
    const { value: previousValue, ...previousShape } = previous;
    const { value: nextValue, ...nextShape } = next;
    return (
      !valuesEqual(previousShape, nextShape) ||
      (next.key === branchKey && !valuesEqual(previousValue, nextValue))
    );
  });
};

/** 边、节点归属和字段结构变化会使画布投影及结构订阅失效。 */
export const resolveStructureChanged = (meta: MutationMeta): boolean =>
  meta.changedEdgeIds.size > 0 ||
  [...meta.nodeChanges.values()].some(
    ({ before, after }) =>
      !before ||
      !after ||
      before.data.parentNodeId !== after.data.parentNodeId ||
      before.data.flowNodeType !== after.data.flowNodeType ||
      nodeInputStructureChanged(before.data, after.data) ||
      !valuesEqual(before.data.outputs, after.data.outputs)
  );

// endregion

// region graphIndexes Graph and workflow start indexes

/** childrenByParent 里文档根对应的桶：parentNodeId 为空即根级子节点。 */
export const ROOT_PARENT_KEY = '';

/** 构建私有邻接索引；索引只服务于 runtime 内部 BFS，不对外暴露。 */
export const buildGraphIndex = (nodes: NodeRecord[], edges: EdgeRecord[]): GraphIndex => {
  const bySource = new Map<string, EdgeRecord[]>();
  const byTarget = new Map<string, EdgeRecord[]>();
  const parentByChild = new Map<string, string>();
  const childrenByParent = new Map<string, string[]>();
  const edgeById = new Map<string, EdgeRecord>();
  nodes.forEach(({ data }) => {
    const parentKey = data.parentNodeId || ROOT_PARENT_KEY;
    const children = childrenByParent.get(parentKey) ?? [];
    children.push(data.nodeId);
    childrenByParent.set(parentKey, children);
    if (data.parentNodeId) parentByChild.set(data.nodeId, data.parentNodeId);
  });
  edges.forEach((edge) => {
    edgeById.set(edge.id, edge);
    const sourceEdges = bySource.get(edge.data.source) ?? [];
    sourceEdges.push(edge);
    bySource.set(edge.data.source, sourceEdges);
    const targetEdges = byTarget.get(edge.data.target) ?? [];
    targetEdges.push(edge);
    byTarget.set(edge.data.target, targetEdges);
  });
  return { bySource, byTarget, parentByChild, childrenByParent, edgeById };
};

/** 把一笔事务的局部图变化写进已有索引：边增删与父子归属迁移。 */
export const applyGraphIndexChanges = (graphIndex: GraphIndex, meta: MutationMeta) => {
  const removeEdge = (edge: EdgeRecord) => {
    graphIndex.edgeById.delete(edge.id);
    const drop = (bucket: Map<string, EdgeRecord[]>, key: string) => {
      const bucketEdges = bucket.get(key);
      if (!bucketEdges) return;
      const next = bucketEdges.filter((item) => item.id !== edge.id);
      if (next.length > 0) bucket.set(key, next);
      else bucket.delete(key);
    };
    drop(graphIndex.bySource, edge.data.source);
    drop(graphIndex.byTarget, edge.data.target);
  };
  const addEdge = (edge: EdgeRecord) => {
    graphIndex.edgeById.set(edge.id, edge);
    const sourceEdges = graphIndex.bySource.get(edge.data.source) ?? [];
    graphIndex.bySource.set(edge.data.source, [...sourceEdges, edge]);
    const targetEdges = graphIndex.byTarget.get(edge.data.target) ?? [];
    graphIndex.byTarget.set(edge.data.target, [...targetEdges, edge]);
  };

  meta.removedEdges.forEach(removeEdge);
  meta.addedEdges.forEach(addEdge);
  meta.nodeChanges.forEach(({ before, after }) => {
    const beforeKey = before?.data.parentNodeId || ROOT_PARENT_KEY;
    const afterKey = after?.data.parentNodeId || ROOT_PARENT_KEY;
    // 根级子节点也要维护：placement context 的 root 作用域直接读 ROOT_PARENT_KEY 桶。
    if (before && (!after || beforeKey !== afterKey)) {
      const children = graphIndex.childrenByParent.get(beforeKey) ?? [];
      const next = children.filter((nodeId) => nodeId !== before.data.nodeId);
      if (next.length > 0) graphIndex.childrenByParent.set(beforeKey, next);
      else graphIndex.childrenByParent.delete(beforeKey);
      graphIndex.parentByChild.delete(before.data.nodeId);
    }
    if (after && (!before || beforeKey !== afterKey)) {
      if (after.data.parentNodeId) {
        graphIndex.parentByChild.set(after.data.nodeId, after.data.parentNodeId);
      }
      const children = graphIndex.childrenByParent.get(afterKey) ?? [];
      graphIndex.childrenByParent.set(afterKey, [...children, after.data.nodeId]);
    }
    // 被删掉的节点自己可能就是某个容器桶的 key。
    if (!after && before) graphIndex.childrenByParent.delete(before.data.nodeId);
  });
};

/** 收集所有流程开始节点 id。 */
export const collectWorkflowStartIds = (nodes: NodeRecord[]) =>
  new Set(
    nodes
      .filter(({ data }) => data.flowNodeType === FlowNodeTypeEnum.workflowStart)
      .map(({ data }) => data.nodeId)
  );

/** 按节点变更增量维护流程开始节点集合。 */
export const applyWorkflowStartChanges = (startIds: Set<string>, meta: MutationMeta) => {
  meta.nodeChanges.forEach(({ before, after }, nodeId) => {
    if (before?.data.flowNodeType === FlowNodeTypeEnum.workflowStart) startIds.delete(nodeId);
    if (after?.data.flowNodeType === FlowNodeTypeEnum.workflowStart) startIds.add(nodeId);
  });
};

/** 收集容器后代节点 id；childrenByParent 来自 graph index。 */
export const collectDescendantNodeIds = (
  childrenByParent: Map<string, string[]>,
  rootIds: ReadonlySet<string>
) => {
  const descendants = new Set<string>();
  const visit = (nodeId: string) => {
    childrenByParent.get(nodeId)?.forEach((childId) => {
      if (descendants.has(childId)) return;
      descendants.add(childId);
      visit(childId);
    });
  };
  rootIds.forEach(visit);
  return descendants;
};

// endregion

// region derivedFields Persisted derived field maintenance

/** Persisted Derived Field：容器子节点清单。执行层读它，因此必须留在持久化数据里。 */
const childrenNodeIdListKey = NodeInputKeyEnum.childrenNodeIdList;

/** 条件模式的 Loop Run 没有数组输入，与旧编辑器一致跳过值类型推断。 */
const skipsArrayValueTypeInference = (data: WorkflowNodeData) =>
  data.flowNodeType === FlowNodeTypeEnum.loopRun &&
  data.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunMode)?.value ===
    LoopRunModeEnum.conditional;

/** 选择允许派生类型的系统数组输入，保留同名自定义业务输入。 */
const getDerivedArrayInput = (data: WorkflowNodeData) =>
  skipsArrayValueTypeInference(data)
    ? undefined
    : data.inputs.find(
        (input) =>
          input.key === arrayReferenceInputKeyByNodeType[data.flowNodeType] &&
          input.canEdit !== true
      );

const deriveNodeInputs = ({
  node,
  getSourceType,
  children,
  includeChildrenNodeIds
}: {
  node: NodeRecord;
  getSourceType: DerivedSourceTypeReader;
  children: string[];
  includeChildrenNodeIds: boolean;
}): FlowNodeInputItemType[] => {
  const childrenInput = includeChildrenNodeIds
    ? node.data.inputs.find(
        (input) => input.key === childrenNodeIdListKey && input.canEdit !== true
      )
    : undefined;
  const arrayInput = getDerivedArrayInput(node.data);
  const sourceType = arrayInput && getSourceType(arrayInput.value, true);
  const valueType =
    (sourceType ? ArrayTypeMap[sourceType] : undefined) ?? WorkflowIOValueTypeEnum.arrayAny;
  const nextChildren =
    childrenInput && !valuesEqual(childrenInput.value ?? [], children) ? children : undefined;
  if (!nextChildren && (!arrayInput || arrayInput.valueType === valueType)) return node.data.inputs;

  return node.data.inputs.map((input) => {
    if (input === childrenInput && nextChildren) return { ...input, value: [...nextChildren] };
    if (input === arrayInput && input.valueType !== valueType) return { ...input, valueType };
    return input;
  });
};

type DerivedSourceTypeReader = (
  value: unknown,
  arrayReference?: boolean
) => WorkflowIOValueTypeEnum | undefined;

/** 将循环数组类型映射为单次迭代元素类型；非数组不提供元素输出。 */
const getLoopArrayItemType = (valueType?: WorkflowIOValueTypeEnum) => {
  switch (valueType) {
    case WorkflowIOValueTypeEnum.arrayString:
      return WorkflowIOValueTypeEnum.string;
    case WorkflowIOValueTypeEnum.arrayNumber:
      return WorkflowIOValueTypeEnum.number;
    case WorkflowIOValueTypeEnum.arrayBoolean:
      return WorkflowIOValueTypeEnum.boolean;
    case WorkflowIOValueTypeEnum.arrayObject:
      return WorkflowIOValueTypeEnum.object;
    case WorkflowIOValueTypeEnum.arrayAny:
      return WorkflowIOValueTypeEnum.any;
    default:
      return undefined;
  }
};

/** 在同一 Runtime 事务内推导 Loop 的持久化输出，供执行层与 handle 投影共同读取。 */
const deriveLoopOutputs = ({
  node,
  parent,
  endReference,
  getSourceType
}: {
  node: NodeRecord;
  parent?: NodeRecord;
  endReference?: unknown;
  getSourceType: DerivedSourceTypeReader;
}): WorkflowNodeData['outputs'] => {
  const { flowNodeType, inputs } = node.data;
  const finish = (outputs: WorkflowNodeData['outputs']) =>
    valuesEqual(node.data.outputs, outputs) ? node.data.outputs : outputs;

  if (flowNodeType === FlowNodeTypeEnum.nestedStart) {
    const parentArray = parent?.data.inputs.find(
      (input) => input.key === NodeInputKeyEnum.nestedInputArray
    );
    const valueType = getLoopArrayItemType(parentArray?.valueType);
    const outputs = node.data.outputs.filter(
      (output) => output.key !== NodeOutputKeyEnum.nestedStartInput
    );
    if (!valueType) return finish(outputs);
    const current = node.data.outputs.find(
      (output) => output.key === NodeOutputKeyEnum.nestedStartInput
    );
    return finish([
      ...outputs,
      current
        ? { ...current, valueType }
        : {
            id: NodeOutputKeyEnum.nestedStartInput,
            key: NodeOutputKeyEnum.nestedStartInput,
            label: i18nT('workflow:Array_element'),
            type: FlowNodeOutputTypeEnum.static,
            valueType
          }
    ]);
  }

  if (flowNodeType === FlowNodeTypeEnum.loopRunStart) {
    if (parent?.data.flowNodeType !== FlowNodeTypeEnum.loopRun) return node.data.outputs;
    const mode = parent.data.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunMode)
      ?.value as LoopRunModeEnum | undefined;
    const modeOutputs = new Set<string>([
      NodeOutputKeyEnum.currentIndex,
      NodeOutputKeyEnum.currentItem,
      NodeOutputKeyEnum.currentIteration
    ]);
    const outputs = node.data.outputs.filter((output) => !modeOutputs.has(output.key));
    if (mode === LoopRunModeEnum.conditional) {
      return finish([
        ...outputs,
        {
          id: NodeOutputKeyEnum.currentIteration,
          key: NodeOutputKeyEnum.currentIteration,
          label: i18nT('workflow:current_iteration'),
          description: i18nT('workflow:current_iteration_desc'),
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.number
        }
      ]);
    }
    const arrayInput = parent.data.inputs.find(
      (input) => input.key === NodeInputKeyEnum.loopRunInputArray
    );
    const itemType = getLoopArrayItemType(arrayInput?.valueType);
    return finish([
      ...outputs,
      {
        id: NodeOutputKeyEnum.currentIndex,
        key: NodeOutputKeyEnum.currentIndex,
        label: i18nT('workflow:current_index'),
        description: i18nT('workflow:current_index_desc'),
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.number
      },
      {
        id: NodeOutputKeyEnum.currentItem,
        key: NodeOutputKeyEnum.currentItem,
        label: i18nT('workflow:current_item'),
        description: i18nT('workflow:current_item_desc'),
        type: FlowNodeOutputTypeEnum.static,
        valueType: itemType ?? WorkflowIOValueTypeEnum.any
      }
    ]);
  }

  if (flowNodeType === FlowNodeTypeEnum.loopRun) {
    const declarations = inputs.filter((input) => input.canEdit === true);
    const declarationKeys = new Set(declarations.map((input) => input.key));
    const outputs = node.data.outputs
      .filter(
        (output) =>
          output.type !== FlowNodeOutputTypeEnum.dynamic || declarationKeys.has(output.key)
      )
      .map((output) => {
        const input = declarations.find((item) => item.key === output.key);
        if (!input) return output;
        return {
          ...output,
          label: input.label || input.key,
          valueType: input.valueType
        };
      });
    declarations.forEach((input) => {
      if (outputs.some((output) => output.key === input.key)) return;
      outputs.push({
        id: input.key,
        key: input.key,
        label: input.label || input.key,
        type: FlowNodeOutputTypeEnum.dynamic,
        valueType: input.valueType
      });
    });
    return finish(outputs);
  }

  if (flowNodeType === FlowNodeTypeEnum.loop || flowNodeType === FlowNodeTypeEnum.parallelRun) {
    const sourceType = getSourceType(endReference);
    const outputKey =
      flowNodeType === FlowNodeTypeEnum.parallelRun
        ? NodeOutputKeyEnum.parallelSuccessResults
        : NodeOutputKeyEnum.nestedArrayResult;
    const valueType =
      (sourceType ? ArrayTypeMap[sourceType] : undefined) ?? WorkflowIOValueTypeEnum.arrayAny;
    return finish(
      node.data.outputs.map((output) =>
        output.key === outputKey && output.valueType !== valueType
          ? { ...output, valueType }
          : output
      )
    );
  }

  return node.data.outputs;
};

/**
 * 重算文档派生字段，并返回逐节点变化供 Runtime 登记事务与历史。
 * 输入类型、Loop 输出和容器结果互相依赖，因此按节点数上限迭代到稳定。
 */
export const applyPersistedDerivedFields = ({
  nodes,
  chatConfig,
  includeChildrenNodeIds = true
}: {
  nodes: NodeRecord[];
  chatConfig: AppChatConfigType;
  /** 仅为引用快照裁剪派生类型和输出时，可跳过子节点清单。 */
  includeChildrenNodeIds?: boolean;
}): {
  nodes: NodeRecord[];
  changes: Array<{
    index: number;
    before: NodeRecord;
    after: NodeRecord;
    removedOutputKeys: string[];
  }>;
} => {
  const nextNodes = nodes.slice();
  const indexById = new Map(nodes.map(({ data }, index) => [data.nodeId, index]));
  const childrenByParent = new Map<string, string[]>();
  const endReferences = new Map<string, unknown>();
  const globalTypes = new Map(
    getWorkflowGlobalVariables({ chatConfig }).map(({ key, valueType }) => [key, valueType])
  );
  const inputDependents = new Map<string, Set<number>>();
  const outputDependents = new Map<string, Set<number>>();
  const childStarts = new Map<string, Set<number>>();
  let pendingInputs = new Set<number>();
  let pendingOutputs = new Set<number>();

  const getNode = (id: string) => nextNodes[indexById.get(id) ?? -1];
  const getSourceType: DerivedSourceTypeReader = (value, arrayReference = false) => {
    if (arrayReference) {
      if (
        !Array.isArray(value) ||
        !value.every(
          (ref) =>
            isWorkflowReferenceItem(ref) && (ref[0] === VARIABLE_NODE_ID || indexById.has(ref[0]))
        )
      )
        return;
      value = value[0];
    }
    if (!isWorkflowReferenceItem(value)) return;
    const [sourceId, outputId] = value;
    return sourceId === VARIABLE_NODE_ID
      ? globalTypes.get(outputId)
      : getNode(sourceId)?.data.outputs.find((output) => output.id === outputId)?.valueType;
  };

  // 结构、引用和全局变量在派生期间不变，索引只需构建一次。
  nodes.forEach(({ data }) => {
    if (!data.parentNodeId) return;
    const children = childrenByParent.get(data.parentNodeId) ?? [];
    children.push(data.nodeId);
    childrenByParent.set(data.parentNodeId, children);
    if (data.flowNodeType === FlowNodeTypeEnum.nestedEnd && !endReferences.has(data.parentNodeId)) {
      endReferences.set(
        data.parentNodeId,
        data.inputs.find((input) => input.key === NodeInputKeyEnum.nestedEndInput)?.value
      );
    }
  });

  nodes.forEach(({ data }, index) => {
    const addDependency = (map: Map<string, Set<number>>, source: string) => {
      const dependents = map.get(source) ?? new Set();
      dependents.add(index);
      map.set(source, dependents);
    };
    if (isNestedParentNodeType(data.flowNodeType)) {
      pendingInputs.add(index);
      pendingOutputs.add(index);

      const inputValue = getDerivedArrayInput(data)?.value;
      const firstReference = Array.isArray(inputValue) ? inputValue[0] : undefined;
      if (isWorkflowReferenceItem(firstReference)) {
        addDependency(inputDependents, firstReference[0]);
      }
      const endReference = endReferences.get(data.nodeId);
      if (isWorkflowReferenceItem(endReference)) {
        addDependency(outputDependents, endReference[0]);
      }
    } else if (
      data.flowNodeType === FlowNodeTypeEnum.nestedStart ||
      data.flowNodeType === FlowNodeTypeEnum.loopRunStart
    ) {
      pendingOutputs.add(index);
      if (data.parentNodeId) addDependency(childStarts, data.parentNodeId);
    }
  });

  // 每轮先提交输入，再统一读取和提交输出，保持循环引用的原有更新顺序及上限。
  for (
    let pass = 0;
    pass <= nodes.length && (pendingInputs.size > 0 || pendingOutputs.size > 0);
    pass++
  ) {
    for (const index of pendingInputs) {
      const node = nextNodes[index];
      const inputs = deriveNodeInputs({
        node,
        getSourceType,
        children: childrenByParent.get(node.data.nodeId) ?? [],
        includeChildrenNodeIds
      });
      if (inputs === node.data.inputs) continue;
      nextNodes[index] = { ...node, data: { ...node.data, inputs } };
      childStarts.get(node.data.nodeId)?.forEach((child) => pendingOutputs.add(child));
    }
    pendingInputs = new Set();

    const outputUpdates = new Map<number, WorkflowNodeData['outputs']>();
    for (const index of pendingOutputs) {
      const node = nextNodes[index];
      const parent = node.data.parentNodeId ? getNode(node.data.parentNodeId) : undefined;
      const outputs = deriveLoopOutputs({
        node,
        parent,
        endReference: endReferences.get(node.data.nodeId),
        getSourceType
      });
      if (outputs !== node.data.outputs) outputUpdates.set(index, outputs);
    }
    pendingOutputs = new Set();

    for (const [index, outputs] of outputUpdates) {
      const node = nextNodes[index];
      nextNodes[index] = { ...node, data: { ...node.data, outputs } };
      inputDependents.get(node.data.nodeId)?.forEach((target) => pendingInputs.add(target));
      outputDependents.get(node.data.nodeId)?.forEach((target) => pendingOutputs.add(target));
    }
  }

  const changes: Array<{
    index: number;
    before: NodeRecord;
    after: NodeRecord;
    removedOutputKeys: string[];
  }> = [];
  nodes.forEach((node, index) => {
    const after = nextNodes[index];
    if (after === node) return;
    changes.push({
      index,
      before: node,
      after,
      removedOutputKeys: node.data.outputs
        .filter((output) => !after.data.outputs.some((next) => next.key === output.key))
        .map((output) => output.key)
    });
  });
  return { nodes: changes.length > 0 ? nextNodes : nodes, changes };
};

/** 复用编辑器的类型和输出派生规则，裁剪已失去消费方的历史引用快照。 */
export const compactWorkflowReferenceSnapshots = (workflow: CanonicalWorkflowData) => {
  if (workflow.referenceSnapshots.length === 0) return [];

  const { nodes } = applyPersistedDerivedFields({
    nodes: workflow.nodes.map((data) => ({ data })),
    chatConfig: workflow.chatConfig,
    includeChildrenNodeIds: false
  });
  return compactReferenceSnapshotsForNodes({ ...workflow, nodes: nodes.map(({ data }) => data) });
};

/** 重算未验证记录的输出 invalid，缓存只保存当前目录下已经具有正确输出的记录。 */
export const applyWorkflowNodeOutputValidity = ({
  nodes,
  llmModelMap,
  validatedRecords
}: {
  nodes: NodeRecord[];
  llmModelMap?: WorkflowLLMModelMap;
  validatedRecords: WeakSet<NodeRecord>;
}): {
  nodes: NodeRecord[];
  changes: Array<{ index: number; before: NodeRecord; after: NodeRecord }>;
} => {
  if (!llmModelMap) return { nodes, changes: [] };

  const changes: Array<{ index: number; before: NodeRecord; after: NodeRecord }> = [];
  let nextNodes = nodes;
  nodes.forEach((node, index) => {
    if (validatedRecords.has(node)) return;
    const outputs = updateWorkflowNodeOutputValidity({
      inputs: node.data.inputs,
      outputs: node.data.outputs,
      llmModelMap
    });
    if (outputs === node.data.outputs) {
      validatedRecords.add(node);
      return;
    }
    const after: NodeRecord = { ...node, data: { ...node.data, outputs } };
    validatedRecords.add(after);
    if (nextNodes === nodes) nextNodes = nodes.slice();
    nextNodes[index] = after;
    changes.push({ index, before: node, after });
  });
  return { nodes: nextNodes, changes };
};

// endregion
