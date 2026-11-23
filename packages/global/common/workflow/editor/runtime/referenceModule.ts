import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../../../../core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../../core/workflow/node/constant';
import {
  areWorkflowValueTypesCompatible,
  filterSelectableWorkflowNodeOutputs,
  getWorkflowReferenceItemsFromValue,
  isWorkflowErrorBranchReachable,
  isWorkflowReferenceEdgeValid,
  isWorkflowReferenceItem,
  nodeInputIsReference
} from '../../reference';
import { i18nT } from '../../../i18n/utils';
import {
  getHTTPToolParamOutputs,
  isEmptyReferenceValue,
  isWorkflowTemplateOutputLabel
} from '../utils';
import { getWorkflowGlobalVariables } from '../variables';
import { getWorkflowSecretInputKind, inputTypeValueTypeMap } from '../../input';
import { SystemToolSecretInputTypeEnum } from '../../../../core/app/tool/systemTool/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType,
  WorkflowReferenceSnapshot
} from '../../../../core/workflow/type/io';
import type { TUpdateListItem } from '../../../../core/workflow/template/system/variableUpdate/type';
import type {
  WorkflowFieldIdentity,
  WorkflowNodeData,
  WorkflowReferenceOptionsQuery,
  WorkflowReferenceOption,
  WorkflowReferenceStatus
} from '../../../../core/workflow/editor/types';
import type { AppChatConfigType } from '../../../../core/app/type';
import type { StoreEdgeItemType } from '../../../../core/workflow/type/edge';
import {
  addFieldIdentity,
  getFieldIdentity,
  getFieldIdentityKey,
  getInputReferences,
  parseFieldIdentityKey,
  valuesEqual
} from './kernel';
import type {
  DocumentReadApi,
  FieldStatusCache,
  MutationMeta,
  NodeRecord,
  ReferenceGraph,
  ReferenceSource,
  RuntimeDocument
} from './types';

/**
 * Reference module：拥有 Reference Graph 与字段引用状态/可选项计算。
 * 只读 Document 的 staged/committed 状态，不写 Document。
 */

// region referenceGraph Reference graph construction and updates

const getSourceIdentityKey = ([nodeId, outputId]: ReferenceItemValueType) =>
  `${nodeId}\0${outputId}`;

const snapshotMapCache = new WeakMap<object, ReadonlyMap<string, WorkflowReferenceSnapshot>>();

const toSnapshotMap = (
  snapshots: readonly WorkflowReferenceSnapshot[]
): ReadonlyMap<string, WorkflowReferenceSnapshot> => {
  const cached = snapshotMapCache.get(snapshots);
  if (cached) return cached;
  const snapshotMap = new Map(
    snapshots.map((snapshot) => [getSourceIdentityKey(snapshot.reference), snapshot])
  );
  snapshotMapCache.set(snapshots, snapshotMap);
  return snapshotMap;
};

/** selectedTools 入边即「被 Agent 挂成工具」：这条语义只在此处定义，实时与定格文档共用。 */
export const isMountedToolEdge = ({ targetHandle }: Pick<StoreEdgeItemType, 'targetHandle'>) =>
  targetHandle === NodeOutputKeyEnum.selectedTools;

/** 为没有 GraphIndex 的保存及历史文档构建有效工具挂载集合。 */
const getMountedToolNodeIds = (
  edges: readonly StoreEdgeItemType[],
  getNodeById: ReferenceSourceScope['getNodeById']
): Set<string> => {
  const mountedTools = new Set<string>();
  for (const edge of edges) {
    if (
      isMountedToolEdge(edge) &&
      isWorkflowReferenceEdgeValid({
        source: getNodeById(edge.source),
        target: getNodeById(edge.target),
        sourceHandle: edge.sourceHandle
      })
    ) {
      mountedTools.add(edge.target);
    }
  }
  return mountedTools;
};

const createReferenceGraph = (): ReferenceGraph => ({
  consumersBySource: new Map(),
  sourcesByConsumer: new Map(),
  sourceKeysByNode: new Map(),
  depth: 0
});

type ReferenceGraphBucket = 'consumersBySource' | 'sourcesByConsumer' | 'sourceKeysByNode';
type ReferenceBucketLocation = { graph: ReferenceGraph; key: ReferenceGraphBucket; id: string };

const getReferenceGraphSet = ({
  graph,
  key,
  id
}: ReferenceBucketLocation): Set<string> | undefined => {
  let current: ReferenceGraph | undefined = graph;
  while (current) {
    if (current[key].has(id)) return current[key].get(id) ?? undefined;
    current = current.parent;
  }
  return undefined;
};

/** 事务只改写本层桶，每个继承桶首次改写时复制一次。 */
const getWritableReferenceGraphSet = (location: ReferenceBucketLocation): Set<string> => {
  const { graph, key, id } = location;
  const owned = graph[key].get(id);
  if (owned) return owned;
  const writable = new Set(getReferenceGraphSet(location));
  graph[key].set(id, writable);
  return writable;
};

const removeReferenceGraphSetValue = (location: ReferenceBucketLocation, value: string) => {
  const bucket = getWritableReferenceGraphSet(location);
  bucket.delete(value);
  if (!bucket.size) location.graph[location.key].set(location.id, null);
  return bucket.size;
};

/** 建立事务级引用图 overlay；仅复制三张空 mutation map，引用数量不影响命令启动。 */
const forkReferenceGraph = (parent: ReferenceGraph): ReferenceGraph => ({
  parent,
  consumersBySource: new Map(),
  sourcesByConsumer: new Map(),
  sourceKeysByNode: new Map(),
  depth: parent.depth + 1
});

/** 引用图层数达到上限时压平，避免历史事务链让单次读取退化。 */
const compactReferenceGraph = (graph: ReferenceGraph): ReferenceGraph => {
  if (graph.depth < 32) return graph;
  const compacted = createReferenceGraph();
  const apply = (key: ReferenceGraphBucket) => {
    const layers: ReferenceGraph[] = [];
    for (let current: ReferenceGraph | undefined = graph; current; current = current.parent) {
      layers.push(current);
    }
    const ids = new Set<string>();
    layers.forEach((layer) => layer[key].forEach((_, id) => ids.add(id)));
    ids.forEach((id) => {
      const value = getReferenceGraphSet({ graph, key, id });
      if (value) compacted[key].set(id, new Set(value));
    });
  };
  apply('consumersBySource');
  apply('sourcesByConsumer');
  apply('sourceKeysByNode');
  return compacted;
};

const addReferenceToGraph = ({
  graph,
  field,
  reference
}: {
  graph: ReferenceGraph;
  field: WorkflowFieldIdentity;
  reference: ReferenceItemValueType;
}) => {
  const fieldKey = getFieldIdentityKey(field);
  const sourceKey = getSourceIdentityKey(reference);
  getWritableReferenceGraphSet({ graph, key: 'consumersBySource', id: sourceKey }).add(fieldKey);
  getWritableReferenceGraphSet({ graph, key: 'sourcesByConsumer', id: fieldKey }).add(sourceKey);
  getWritableReferenceGraphSet({ graph, key: 'sourceKeysByNode', id: reference[0] }).add(sourceKey);
};

const removeReferenceFromGraph = ({
  graph,
  field,
  reference
}: {
  graph: ReferenceGraph;
  field: WorkflowFieldIdentity;
  reference: ReferenceItemValueType;
}) => {
  const fieldKey = getFieldIdentityKey(field);
  const sourceKey = getSourceIdentityKey(reference);
  const remainingConsumers = removeReferenceGraphSetValue(
    { graph, key: 'consumersBySource', id: sourceKey },
    fieldKey
  );
  removeReferenceGraphSetValue({ graph, key: 'sourcesByConsumer', id: fieldKey }, sourceKey);
  if (!remainingConsumers) {
    removeReferenceGraphSetValue({ graph, key: 'sourceKeysByNode', id: reference[0] }, sourceKey);
  }
};

/** Document reducer 在改写 Node Data 时同步 staged 引用图；before/after 都可选。 */
export const updateReferenceGraphNode = ({
  graph,
  before,
  after
}: {
  graph: ReferenceGraph;
  before?: WorkflowNodeData;
  after?: WorkflowNodeData;
}) => {
  if (before) {
    before.inputs.forEach((input) => {
      const field = getFieldIdentity({ nodeId: before.nodeId, field: input, kind: 'input' });
      getInputReferences(input, before.flowNodeType).forEach((reference) =>
        removeReferenceFromGraph({ graph, field, reference })
      );
    });
  }
  if (after) {
    after.inputs.forEach((input) => {
      const field = getFieldIdentity({ nodeId: after.nodeId, field: input, kind: 'input' });
      getInputReferences(input, after.flowNodeType).forEach((reference) =>
        addReferenceToGraph({ graph, field, reference })
      );
    });
  }
};

const buildReferenceGraph = (nodes: NodeRecord[]): ReferenceGraph => {
  const graph = createReferenceGraph();
  nodes.forEach(({ data }) => updateReferenceGraphNode({ graph, after: data }));
  return graph;
};

const hasMalformedReferenceArray = (value: unknown): boolean => {
  if (!Array.isArray(value) || isWorkflowReferenceItem(value) || !value.some(Array.isArray)) {
    return false;
  }
  return value.some((item) => !isWorkflowReferenceItem(item));
};

/**
 * 来源解析作用域：解析一个引用只需要这三样，实时文档与定格的历史文档都能提供。
 * 实时侧由 Document 的节点索引与 GraphIndex 支撑，不再对 nodes / edges 做线性扫描。
 */
type ReferenceSourceScope = {
  chatConfig: AppChatConfigType;
  getNodeById: (nodeId: string) => WorkflowNodeData | undefined;
  /** 节点是否被 Agent 挂成工具：HTTP 节点的参数输出只在挂载时才是可选来源。 */
  isMountedTool: (nodeId: string) => boolean;
};

const globalVariableNodeIdentity = { nodeId: VARIABLE_NODE_ID };
const getOutputLabelMetadata = (
  node: NonNullable<Parameters<typeof isWorkflowTemplateOutputLabel>[1]>['node'],
  output: Pick<FlowNodeOutputItemType, 'key' | 'label' | 'type'>
) =>
  isWorkflowTemplateOutputLabel(output.label, { node, output })
    ? { localizeOutputLabel: true as const }
    : {};

/** 按稳定引用身份读取当前来源的扁平元数据；不读取历史快照。 */
const getCurrentReferenceSource = ({
  reference,
  scope
}: {
  reference: ReferenceItemValueType;
  scope: ReferenceSourceScope;
}): ReferenceSource => {
  const [sourceNodeId, outputId] = reference;
  if (sourceNodeId === VARIABLE_NODE_ID) {
    const variable = getWorkflowGlobalVariables({ chatConfig: scope.chatConfig }).find(
      (item) => item.key === outputId
    );
    if (variable) {
      const output = {
        id: variable.key,
        key: variable.key,
        type: FlowNodeOutputTypeEnum.static,
        valueType: variable.valueType,
        label: variable.label
      };
      return {
        output,
        sourceLabel: i18nT('common:core.module.Variable'),
        outputLabel: variable.label,
        ...getOutputLabelMetadata(globalVariableNodeIdentity, output),
        icon: 'core/workflow/template/variable',
        valueType: variable.valueType
      };
    }
  } else {
    const node = scope.getNodeById(sourceNodeId);
    if (!node) return {};
    const output =
      node.outputs.find((item) => item.id === outputId) ??
      (node.flowNodeType === FlowNodeTypeEnum.httpRequest468 && scope.isMountedTool(sourceNodeId)
        ? getHTTPToolParamOutputs({ ...node, id: node.nodeId }).find((item) => item.id === outputId)
        : undefined);
    if (output) {
      return {
        output,
        sourceLabel: node.name,
        outputLabel: output.label,
        ...getOutputLabelMetadata(node, output),
        ...(node.avatar ? { icon: node.avatar } : {}),
        ...(output.valueType ? { valueType: output.valueType } : {})
      };
    }
  }

  return {};
};

/** 跟随首次消费顺序保留失效来源的快照，同一来源最多保留一条。 */
const compactReferenceSnapshots = ({
  nodes,
  referenceSnapshots,
  resolveSource
}: {
  nodes: readonly Pick<WorkflowNodeData, 'inputs' | 'flowNodeType'>[];
  referenceSnapshots: readonly WorkflowReferenceSnapshot[];
  resolveSource: (reference: ReferenceItemValueType) => ReferenceSource;
}): WorkflowReferenceSnapshot[] => {
  const snapshots = toSnapshotMap(referenceSnapshots);
  const seen = new Set<string>();
  const compacted: WorkflowReferenceSnapshot[] = [];
  for (const { inputs, flowNodeType } of nodes) {
    for (const input of inputs) {
      for (const reference of getInputReferences(input, flowNodeType)) {
        const sourceKey = getSourceIdentityKey(reference);
        const snapshot = snapshots.get(sourceKey);
        if (!snapshot || seen.has(sourceKey)) continue;
        seen.add(sourceKey);
        if (!resolveSource(reference).output) compacted.push(snapshot);
      }
    }
    if (seen.size === snapshots.size) break;
  }
  return compacted;
};

/** 基于已完成派生的节点，过滤来源已恢复或无人使用的历史快照。 */
export const compactReferenceSnapshotsForNodes = ({
  nodes,
  edges,
  chatConfig,
  referenceSnapshots
}: {
  nodes: readonly WorkflowNodeData[];
  edges: readonly StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
  referenceSnapshots: readonly WorkflowReferenceSnapshot[];
}): WorkflowReferenceSnapshot[] => {
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const getNodeById = (nodeId: string) => nodeById.get(nodeId);
  const mountedTools = getMountedToolNodeIds(edges, getNodeById);
  const scope: ReferenceSourceScope = {
    chatConfig,
    getNodeById,
    isMountedTool: (nodeId) => mountedTools.has(nodeId)
  };
  return compactReferenceSnapshots({
    nodes,
    referenceSnapshots,
    resolveSource: (reference) => getCurrentReferenceSource({ reference, scope })
  });
};

/** 把来源节点的下游消费字段并入 affected records；graph 可以是 committed 或 staged 版本。 */
const getConsumerNodeIds = ({
  graph,
  sourceNodeIds
}: {
  graph: ReferenceGraph;
  sourceNodeIds: Iterable<string>;
}): Set<string> => {
  const consumerNodeIds = new Set<string>();
  for (const nodeId of sourceNodeIds) {
    const sourceKeys = getReferenceGraphSet({ graph, key: 'sourceKeysByNode', id: nodeId });
    sourceKeys?.forEach((sourceKey) => {
      getReferenceGraphSet({ graph, key: 'consumersBySource', id: sourceKey })?.forEach(
        (consumerKey) => {
          const field = parseFieldIdentityKey(consumerKey);
          if (field) consumerNodeIds.add(field.nodeId);
        }
      );
    });
  }
  return consumerNodeIds;
};

const addAffectedConsumerFields = ({
  meta,
  graph,
  sourceNodeIds,
  fieldIds = meta.affectedFieldIds
}: {
  meta: MutationMeta;
  graph: ReferenceGraph;
  sourceNodeIds: ReadonlySet<string>;
  fieldIds?: Map<string, WorkflowFieldIdentity>;
}) => {
  sourceNodeIds.forEach((nodeId) => {
    const sourceKeys = getReferenceGraphSet({ graph, key: 'sourceKeysByNode', id: nodeId });
    sourceKeys?.forEach((sourceKey) => {
      getReferenceGraphSet({ graph, key: 'consumersBySource', id: sourceKey })?.forEach(
        (consumerKey) => {
          const field = parseFieldIdentityKey(consumerKey);
          if (!field) return;
          meta.affectedNodeIds.add(field.nodeId);
          addFieldIdentity(fieldIds, field);
        }
      );
    });
  });
};

// endregion

// region referenceState Reference module state and source resolution

/** Create the Workflow Reference module. */
export const createReferenceModule = (document: DocumentReadApi) => {
  let referenceGraph = buildReferenceGraph(document.getDocument().nodes);
  const fieldStatusCache = new Map<string, FieldStatusCache>();
  /** 来源展示字段按稳定 sourceKey 缓存；失效只删受影响来源，避免复制引用图。 */
  const sourceMetadataCache = new Map<string, ReferenceSource>();

  /**
   * 每轮派生共享的上游可达性记忆化：同一字段的多个引用、同一轮 rebuild 里的多个节点
   * 命中同一份结果，长链上不再重复跑反向 BFS。
   * 返回的 Set 是共享只读对象，调用方只能读（.has 或展开后排序），不要原地修改。
   */
  const incomingSourcesCache = new Map<string, ReadonlySet<string>>();
  /** 普通来源和错误输出分别按 target/source 缓存可达性结果。 */
  const reachabilityCache = new Map<string, boolean>();
  /** 边、引用输入或整份文档变化都会让上游集合与可达性结果失效。 */
  const invalidateIncomingSources = () => {
    incomingSourcesCache.clear();
    reachabilityCache.clear();
  };

  const invalidateSourceMetadata = (sourceNodeIds?: Iterable<string>) => {
    if (!sourceNodeIds) {
      sourceMetadataCache.clear();
      return;
    }
    const sourceKeys = new Set(sourceNodeIds);
    sourceMetadataCache.forEach((_source, sourceKey) => {
      const separator = sourceKey.indexOf('\0');
      if (separator >= 0 && sourceKeys.has(sourceKey.slice(0, separator))) {
        sourceMetadataCache.delete(sourceKey);
      }
    });
  };

  /** 读当前已提交文档的来源元数据；来源缺失时回落文档上的历史快照。 */
  const resolveCurrentSource = (reference: ReferenceItemValueType): ReferenceSource => {
    const sourceKey = getSourceIdentityKey(reference);
    const cached = sourceMetadataCache.get(sourceKey);
    const { chatConfig, referenceSnapshots } = document.getDocument();
    const currentSource =
      cached ??
      getCurrentReferenceSource({
        reference,
        scope: {
          chatConfig,
          getNodeById: (nodeId) => document.getNodeById(nodeId)?.data,
          isMountedTool: document.isMountedTool
        }
      });
    if (!cached) sourceMetadataCache.set(sourceKey, currentSource);
    if (currentSource.output) return currentSource;
    const snapshot = toSnapshotMap(referenceSnapshots).get(sourceKey);
    return snapshot
      ? {
          ...currentSource,
          ...(snapshot.sourceLabel ? { sourceLabel: snapshot.sourceLabel } : {}),
          ...(snapshot.outputLabel ? { outputLabel: snapshot.outputLabel } : {}),
          ...(snapshot.localizeOutputLabel
            ? { localizeOutputLabel: snapshot.localizeOutputLabel }
            : {}),
          ...(snapshot.icon ? { icon: snapshot.icon } : {})
        }
      : currentSource;
  };

  // endregion

  // region referenceTransactions Reference graph transaction updates

  const getGraph = () => referenceGraph;
  const getAffectedConsumerNodeIds = (sourceNodeIds: Iterable<string>) =>
    getConsumerNodeIds({ graph: referenceGraph, sourceNodeIds });
  const forkGraph = () => forkReferenceGraph(referenceGraph);
  const commitStagedGraph = (graph: ReferenceGraph) => {
    referenceGraph = compactReferenceGraph(graph);
  };
  /** 语义事务失败时恢复引用图；缓存全部作废，避免残留 staged 派生。 */
  const restoreGraph = (graph: ReferenceGraph) => {
    referenceGraph = graph;
    clearFieldStatusCache();
  };
  const rebuildGraph = () => {
    referenceGraph = buildReferenceGraph(document.getDocument().nodes);
    invalidateIncomingSources();
    invalidateSourceMetadata();
  };

  /**
   * 提交本笔事务的 staged Reference Graph，并把领域依赖闭包写回 meta 的 affected records。
   * 调用顺序即事件语义：先按 changed 节点传播，再按引用来源元数据变化传播，最后处理全局变量。
   * 返回值是只用于缓存失效的额外字段身份，它们不进入 affected records。
   */
  const commitTransaction = ({
    meta,
    stagedGraph,
    beforeGraph
  }: {
    meta: MutationMeta;
    stagedGraph: ReferenceGraph;
    beforeGraph: ReferenceGraph;
  }): Map<string, WorkflowFieldIdentity> => {
    commitStagedGraph(stagedGraph);
    // 本笔事务可能改了边或引用输入，上游可达性记忆化整体作废，下一轮派生重新计算。
    invalidateIncomingSources();
    const committedGraph = referenceGraph;
    const cacheOnlyFieldIds = new Map<string, WorkflowFieldIdentity>();
    addAffectedConsumerFields({ meta, graph: beforeGraph, sourceNodeIds: meta.changedNodeIds });
    addAffectedConsumerFields({ meta, graph: committedGraph, sourceNodeIds: meta.changedNodeIds });

    const changedSourceNodeIds = new Set<string>();
    meta.nodeChanges.forEach(({ before: previous, after: next }, nodeId) => {
      if (!previous || !next) {
        changedSourceNodeIds.add(nodeId);
        return;
      }
      // HTTP 参数和动态分支配置都决定对外可用的来源/句柄，所以要额外比较 inputs。
      const sourceMetadataChanged =
        previous.data.name !== next.data.name ||
        previous.data.avatar !== next.data.avatar ||
        previous.data.pluginId !== next.data.pluginId ||
        previous.data.parentNodeId !== next.data.parentNodeId ||
        previous.data.flowNodeType !== next.data.flowNodeType ||
        previous.data.catchError !== next.data.catchError ||
        !valuesEqual(previous.data.outputs, next.data.outputs) ||
        ((previous.data.flowNodeType === FlowNodeTypeEnum.httpRequest468 ||
          previous.data.flowNodeType === FlowNodeTypeEnum.userSelect ||
          previous.data.flowNodeType === FlowNodeTypeEnum.classifyQuestion) &&
          !valuesEqual(previous.data.inputs, next.data.inputs));
      if (sourceMetadataChanged) changedSourceNodeIds.add(nodeId);
      if (previous.data.parentNodeId !== next.data.parentNodeId) {
        for (const { data } of document.getGraphIndex().bySource.get(nodeId) ?? []) {
          if (isMountedToolEdge(data)) changedSourceNodeIds.add(data.target);
        }
      }
    });
    [...meta.addedEdges.values(), ...meta.removedEdges.values()].forEach((edge) => {
      if (edge.data.targetHandle === NodeOutputKeyEnum.selectedTools) {
        changedSourceNodeIds.add(edge.data.target);
      }
    });
    changedSourceNodeIds.forEach((nodeId) => meta.candidateSourcesChanged.add(nodeId));
    invalidateSourceMetadata(
      meta.chatConfigVariablesChanged
        ? [...changedSourceNodeIds, VARIABLE_NODE_ID]
        : changedSourceNodeIds
    );
    addAffectedConsumerFields({
      meta,
      graph: beforeGraph,
      sourceNodeIds: changedSourceNodeIds,
      fieldIds: cacheOnlyFieldIds
    });
    addAffectedConsumerFields({
      meta,
      graph: committedGraph,
      sourceNodeIds: changedSourceNodeIds,
      fieldIds: cacheOnlyFieldIds
    });

    if (meta.chatConfigVariablesChanged) {
      const variableSources = new Set([VARIABLE_NODE_ID]);
      meta.candidateSourcesChanged.add(VARIABLE_NODE_ID);
      addAffectedConsumerFields({ meta, graph: beforeGraph, sourceNodeIds: variableSources });
      addAffectedConsumerFields({ meta, graph: committedGraph, sourceNodeIds: variableSources });
      addAffectedConsumerFields({
        meta,
        graph: beforeGraph,
        sourceNodeIds: variableSources,
        fieldIds: cacheOnlyFieldIds
      });
      addAffectedConsumerFields({
        meta,
        graph: committedGraph,
        sourceNodeIds: variableSources,
        fieldIds: cacheOnlyFieldIds
      });
    }
    return cacheOnlyFieldIds;
  };

  /** 结构变化后失效关联容器的引用字段缓存，sibling 增删会改变子画布候选。 */
  const getStructureInvalidationFields = (meta: MutationMeta): WorkflowFieldIdentity[] => {
    if (!meta.structureChanged) return [];
    const { childrenByParent, parentByChild } = document.getGraphIndex();
    const nodeIds = new Set([...meta.affectedNodeIds, ...meta.changedNodeIds]);
    const queue = [...nodeIds];
    for (let index = 0; index < queue.length; index++) {
      const nodeId = queue[index]!;
      const parentId = parentByChild.get(nodeId);
      if (parentId) {
        [parentId, ...(childrenByParent.get(parentId) ?? [])].forEach((id) => {
          if (!nodeIds.has(id)) queue.push(id);
          nodeIds.add(id);
        });
      }
      childrenByParent.get(nodeId)?.forEach((childId) => {
        if (!nodeIds.has(childId)) queue.push(childId);
        nodeIds.add(childId);
      });
    }
    const fields = new Map<string, WorkflowFieldIdentity>();
    nodeIds.forEach((nodeId) => {
      document.getNodeById(nodeId)?.data.inputs.forEach((input) => {
        if (!('renderTypeList' in input)) return;
        const identity = { nodeId, key: input.key, kind: 'input' as const };
        fields.set(getFieldIdentityKey(identity), identity);
      });
    });
    return [...fields.values()];
  };

  /** 输出变化会改变其下游与所在容器的候选来源，已填字段也必须刷新候选快照。 */
  const getOutputInvalidationFields = (
    sourceNodeIds: Iterable<string>
  ): WorkflowFieldIdentity[] => {
    const fields = new Map<string, WorkflowFieldIdentity>();
    const { bySource, childrenByParent, parentByChild } = document.getGraphIndex();
    const sources = [...sourceNodeIds];
    const nodeIds = new Set<string>(
      sources.includes(VARIABLE_NODE_ID)
        ? document.getDocument().nodes.map((node) => node.data.nodeId)
        : []
    );
    const queue = sources;
    for (let index = 0; index < queue.length; index++) {
      const nodeId = queue[index]!;
      if (nodeIds.has(nodeId)) continue;
      nodeIds.add(nodeId);
      bySource.get(nodeId)?.forEach((edge) => queue.push(edge.data.target));
      const parentId = parentByChild.get(nodeId);
      if (parentId) queue.push(parentId);
      childrenByParent.get(nodeId)?.forEach((childId) => queue.push(childId));
    }
    nodeIds.forEach((nodeId) => {
      document.getNodeById(nodeId)?.data.inputs.forEach((input) => {
        if (!('renderTypeList' in input)) return;
        const identity = { nodeId, key: input.key, kind: 'input' as const };
        fields.set(getFieldIdentityKey(identity), identity);
      });
    });
    return [...fields.values()];
  };

  // endregion

  // region referenceQueries Reference status and option queries

  /**
   * 复用 Document 的上游来源计算结果并转为 Set 记忆化到本轮派生结束；
   * 返回的 Set 共享只读，调用方不得原地修改。
   */
  const getIncomingSources = (nodeId: string, includeChildren = false): ReadonlySet<string> => {
    const cacheKey = includeChildren ? `${nodeId}\0children` : nodeId;
    const memoized = incomingSourcesCache.get(cacheKey);
    if (memoized) return memoized;
    const sourceIds = new Set(document.getSourceNodeIds({ nodeId, includeChildren }));
    incomingSourcesCache.set(cacheKey, sourceIds);
    return sourceIds;
  };

  /** 引用选择器和字段状态共用错误输出的执行路径及缓存。 */
  const canReachErrorOutput = ({
    sourceNodeId,
    targetNodeId
  }: {
    sourceNodeId: string;
    targetNodeId: string;
  }) => {
    const cacheKey = `${targetNodeId}\0${sourceNodeId}\0true`;
    const cached = reachabilityCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = isWorkflowErrorBranchReachable({
      sourceNodeId,
      targetNodeId,
      parentByNodeId: document.getGraphIndex().parentByChild,
      getIncomingEdges: document.getIncomingReferenceEdges
    });
    reachabilityCache.set(cacheKey, result);
    return result;
  };

  /** 计算一个引用相对目标节点的状态；循环图通过 GraphIndex 的 visited 集合自然终止。 */
  const getReferenceStatus = ({
    reference,
    targetType,
    targetNodeId,
    allowLoopRunChildSource,
    allowAllSourceTypes = false
  }: {
    reference: ReferenceItemValueType;
    targetType?: WorkflowIOValueTypeEnum;
    targetNodeId: string;
    allowLoopRunChildSource?: boolean;
    allowAllSourceTypes?: boolean;
  }): WorkflowReferenceStatus => {
    const canReachUpstream = (sourceNodeId: string) => {
      if (sourceNodeId === targetNodeId) return false;
      const sources = incomingSourcesCache.get(targetNodeId);
      if (sources) return sources.has(sourceNodeId);

      const cacheKey = `${targetNodeId}\0${sourceNodeId}\0false`;
      const cached = reachabilityCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const result = document.hasSourceNode({ nodeId: targetNodeId, sourceNodeId });
      reachabilityCache.set(cacheKey, result);
      return result;
    };

    const [sourceNodeId] = reference;
    const source = resolveCurrentSource(reference);
    const sourceNode = document.getNodeById(sourceNodeId);
    const sourceMetadata = {
      ...(source.sourceLabel ? { sourceLabel: source.sourceLabel } : {}),
      ...(source.outputLabel ? { outputLabel: source.outputLabel } : {}),
      ...(source.localizeOutputLabel ? { localizeOutputLabel: source.localizeOutputLabel } : {}),
      ...(source.icon ? { icon: source.icon } : {})
    };
    if (sourceNodeId === VARIABLE_NODE_ID) {
      if (!source.output) return { code: 'invalid_reference', reference, ...sourceMetadata };
      if (allowAllSourceTypes) {
        return { code: 'valid', sourceType: source.output.valueType, reference, ...sourceMetadata };
      }
      return areWorkflowValueTypesCompatible({
        actual: source.output.valueType,
        expected: targetType
      })
        ? { code: 'valid', sourceType: source.output.valueType, reference, ...sourceMetadata }
        : {
            code: 'invalid_reference_type',
            sourceType: source.output.valueType,
            reference,
            ...sourceMetadata
          };
    }

    const sourceOutput = source.output;
    if (!sourceNode || !sourceOutput)
      return { code: 'invalid_reference', reference, ...sourceMetadata };
    const selectableOutputs = filterSelectableWorkflowNodeOutputs({
      outputs: [sourceOutput],
      catchError: sourceNode.data.catchError
    });
    if (selectableOutputs.length === 0)
      return { code: 'invalid_reference', reference, ...sourceMetadata };
    // loopRun 的可编辑动态输出可引用直接子节点；其它字段仍限制为上游可达来源。
    const isAllowedLoopRunChild =
      allowLoopRunChildSource &&
      document.getGraphIndex().parentByChild.get(sourceNodeId) === targetNodeId;
    const isReachable =
      isAllowedLoopRunChild ||
      (sourceOutput.type === FlowNodeOutputTypeEnum.error
        ? canReachErrorOutput({ sourceNodeId, targetNodeId })
        : canReachUpstream(sourceNodeId));
    if (!isReachable) {
      return {
        code: 'unreachable_reference',
        sourceType: sourceOutput.valueType,
        reference,
        ...sourceMetadata
      };
    }
    return allowAllSourceTypes ||
      areWorkflowValueTypesCompatible({ actual: sourceOutput.valueType, expected: targetType })
      ? { code: 'valid', sourceType: sourceOutput.valueType, reference, ...sourceMetadata }
      : {
          code: 'invalid_reference_type',
          sourceType: sourceOutput.valueType,
          reference,
          ...sourceMetadata
        };
  };

  /** 惰性计算输入字段引用状态；普通非 reference 输入不会进入诊断。 */
  const getFieldStatuses = (
    nodeId: string,
    field: FlowNodeInputItemType | FlowNodeOutputItemType
  ): WorkflowReferenceStatus[] => {
    if (!('renderTypeList' in field)) return [];
    const cacheKey = getFieldIdentityKey({ nodeId, key: field.key, kind: 'input' });
    const cached = fieldStatusCache.get(cacheKey);
    if (cached?.field === field) return cached.statuses;

    const value = field.value ?? field.defaultValue;
    if (isEmptyReferenceValue(value)) {
      fieldStatusCache.set(cacheKey, { field, statuses: [] });
      return [];
    }
    const flowNodeType = document.getNodeById(nodeId)?.data.flowNodeType;
    const references = getInputReferences(field, flowNodeType);
    if (!nodeInputIsReference(field) && references.length === 0) {
      fieldStatusCache.set(cacheKey, { field, statuses: [] });
      return [];
    }
    const secretInputKind = getWorkflowSecretInputKind({
      flowNodeType,
      inputKey: field.key
    });
    const getTargetTypes = (reference: ReferenceItemValueType) => {
      if (secretInputKind === 'headers') return [WorkflowIOValueTypeEnum.string];
      if (
        secretInputKind === 'systemConfig' &&
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const secretValues =
          'type' in value &&
          value.type === SystemToolSecretInputTypeEnum.manual &&
          typeof value.value === 'object' &&
          value.value !== null &&
          !Array.isArray(value.value)
            ? value.value
            : value;
        // 同一来源可以被不同类型的凭据项复用，每种目标类型都要参与校验。
        const targetTypes = new Set<FlowNodeInputItemType['valueType']>();
        for (const [key, itemValue] of Object.entries(secretValues)) {
          if (
            getWorkflowReferenceItemsFromValue(itemValue, {
              includeSecretReferences: true
            }).some(
              ([sourceNodeId, outputId]) =>
                sourceNodeId === reference[0] && outputId === reference[1]
            )
          ) {
            const inputType = field.inputList?.find((item) => item.key === key)?.inputType;
            targetTypes.add(inputType ? inputTypeValueTypeMap[inputType] : field.valueType);
          }
        }
        if (targetTypes.size > 0) return [...targetTypes];
      }
      return [field.valueType];
    };
    const allowLoopRunChildSource =
      field.canEdit === true && flowNodeType === FlowNodeTypeEnum.loopRun;
    const statuses =
      flowNodeType === FlowNodeTypeEnum.variableUpdate &&
      field.key === NodeInputKeyEnum.updateList &&
      Array.isArray(value)
        ? (() => {
            const seen = new Set<string>();
            const result: WorkflowReferenceStatus[] = [];
            const addStatus = ({
              reference,
              referenceTargetType,
              allowAllSourceTypes = false
            }: {
              reference: ReferenceItemValueType;
              referenceTargetType?: WorkflowIOValueTypeEnum;
              allowAllSourceTypes?: boolean;
            }) => {
              // 同一来源在不同更新行中可能对应不同目标类型或输入模式，不能跨验证上下文合并。
              const referenceKey = JSON.stringify([
                reference,
                referenceTargetType ?? null,
                allowAllSourceTypes
              ]);
              if (seen.has(referenceKey)) return;
              seen.add(referenceKey);
              result.push(
                getReferenceStatus({
                  reference,
                  targetType: referenceTargetType,
                  targetNodeId: nodeId,
                  allowLoopRunChildSource,
                  allowAllSourceTypes
                })
              );
            };

            (value as TUpdateListItem[]).forEach((item) => {
              getWorkflowReferenceItemsFromValue(item.variable, {
                includeCanonicalReferences: true
              }).forEach((reference) => {
                addStatus({ reference, referenceTargetType: item.valueType });
              });
              const variableType = getReferenceValueType(item.variable);
              getWorkflowReferenceItemsFromValue(item.value, {
                includeCanonicalReferences: item.renderType !== FlowNodeInputTypeEnum.input
              }).forEach((reference) =>
                addStatus({
                  reference,
                  referenceTargetType: variableType,
                  allowAllSourceTypes: item.renderType === FlowNodeInputTypeEnum.input
                })
              );
            });
            return result;
          })()
        : references.flatMap((reference) =>
            getTargetTypes(reference).map((targetType) =>
              getReferenceStatus({
                reference,
                targetType,
                targetNodeId: nodeId,
                allowLoopRunChildSource,
                allowAllSourceTypes: !nodeInputIsReference(field) && !secretInputKind
              })
            )
          );
    const result = hasMalformedReferenceArray(value)
      ? [{ code: 'invalid_reference' as const }, ...statuses]
      : statuses.length > 0
        ? statuses
        : [{ code: 'invalid_reference' as const }];
    fieldStatusCache.set(cacheKey, { field, statuses: result });
    return result;
  };

  /**
   * 按值判定引用状态：ifElse 条件与 variableUpdate 条目的引用嵌在结构化 value 里，
   * 不是独立字段，因此复用整字段的来源范围与类型兼容规则；malformed 数组同样报 invalid_reference。
   */
  const getValueStatuses = ({
    value,
    targetNodeId,
    targetType,
    allowAllSourceTypes = false,
    includeCanonicalReferences = true
  }: {
    value: unknown;
    targetNodeId: string;
    targetType?: WorkflowIOValueTypeEnum;
    allowAllSourceTypes?: boolean;
    includeCanonicalReferences?: boolean;
  }): WorkflowReferenceStatus[] => {
    const statuses = getWorkflowReferenceItemsFromValue(value, {
      includeCanonicalReferences
    }).map((reference) =>
      getReferenceStatus({
        reference,
        targetType,
        targetNodeId,
        allowAllSourceTypes
      })
    );
    return includeCanonicalReferences &&
      (hasMalformedReferenceArray(value) ||
        (statuses.length === 0 && !isEmptyReferenceValue(value)))
      ? [{ code: 'invalid_reference' as const }, ...statuses]
      : statuses;
  };

  /** 引用来源的值类型；来源缺失返回 undefined，调用方按 any 处理。 */
  const getReferenceValueType = (reference: unknown) => {
    if (!isWorkflowReferenceItem(reference)) return undefined;
    return resolveCurrentSource(reference).output?.valueType;
  };

  /** 返回当前字段可选的实时来源；失效引用不会重新出现在选择列表。 */
  const getReferenceOptions = ({
    nodeId,
    valueType,
    allowedValueTypes,
    includeChildren
  }: WorkflowReferenceOptionsQuery): WorkflowReferenceOption[] => {
    const nodeIndex = document.getNodeIndex();
    const sourceIds = getIncomingSources(nodeId, includeChildren);
    const canReadLoopRunChild =
      includeChildren &&
      nodeIndex.get(nodeId)?.record.data.flowNodeType === FlowNodeTypeEnum.loopRun;
    const options: WorkflowReferenceOption[] = [];
    [...sourceIds]
      .sort(
        (left, right) =>
          (nodeIndex.get(left)?.index ?? Number.MAX_SAFE_INTEGER) -
          (nodeIndex.get(right)?.index ?? Number.MAX_SAFE_INTEGER)
      )
      .forEach((sourceNodeId) => {
        const sourceNode = nodeIndex.get(sourceNodeId)?.record;
        if (!sourceNode) return;
        const isMountedTool = document.isMountedTool(sourceNodeId);
        filterSelectableWorkflowNodeOutputs({
          outputs: [
            ...sourceNode.data.outputs,
            ...(isMountedTool
              ? getHTTPToolParamOutputs({ ...sourceNode.data, id: sourceNode.data.nodeId })
              : [])
          ],
          valueType,
          allowedValueTypes,
          catchError: sourceNode.data.catchError
        }).forEach((output) => {
          if (
            output.type === FlowNodeOutputTypeEnum.error &&
            !(canReadLoopRunChild && sourceNode.data.parentNodeId === nodeId) &&
            !canReachErrorOutput({ sourceNodeId, targetNodeId: nodeId })
          )
            return;
          options.push({
            reference: [sourceNodeId, output.id],
            sourceType: output.valueType,
            sourceLabel: sourceNode.data.name,
            outputLabel: output.label ?? output.key,
            ...getOutputLabelMetadata(sourceNode.data, output),
            ...(sourceNode.data.avatar ? { icon: sourceNode.data.avatar } : {})
          });
        });
      });

    getWorkflowGlobalVariables({ chatConfig: document.getDocument().chatConfig }).forEach(
      (variable) => {
        if (
          allowedValueTypes
            ? variable.valueType !== undefined && !allowedValueTypes.includes(variable.valueType)
            : !areWorkflowValueTypesCompatible({ actual: variable.valueType, expected: valueType })
        )
          return;
        options.push({
          reference: [VARIABLE_NODE_ID, variable.key],
          sourceType: variable.valueType,
          sourceLabel: i18nT('common:core.module.Variable'),
          outputLabel: variable.label,
          ...getOutputLabelMetadata(globalVariableNodeIdentity, {
            key: variable.key,
            label: variable.label,
            type: FlowNodeOutputTypeEnum.static
          }),
          icon: 'core/workflow/template/variable'
        });
      }
    );

    return options;
  };

  // endregion

  // region referenceSnapshots Reference snapshot capture and compaction

  /**
   * 语义事务里增量捕获引用来源快照，只扫描本轮受影响的 source key：
   * `meta.changedNodeIds`、selectedTools 边变化、chatConfig 变化（映射到全局变量）。
   * 来源仍可解析就丢掉旧快照；来源刚消失就从 before 文档抓展示元数据；
   * 最后只保留 after Reference Graph 里仍有 consumer 的项，因此捕获结果天然没有孤立索引。
   *
   * 调用时机有约束：必须在 Document 提交与索引更新之后、Issue 重算之前，
   * 实时侧读到的才是本轮结果，Issue View 才能拿到历史展示字段。geometry 事务不进这里。
   */
  const captureSnapshots = ({
    previous,
    beforeGraph,
    afterGraph,
    meta
  }: {
    /** 事务开始前的文档；来源刚消失时从它读历史展示元数据。 */
    previous: RuntimeDocument;
    beforeGraph: ReferenceGraph;
    afterGraph: ReferenceGraph;
    meta: MutationMeta;
  }): WorkflowReferenceSnapshot[] => {
    const changedSourceNodeIds = new Set(meta.changedNodeIds);
    [...meta.addedEdges.values(), ...meta.removedEdges.values()].forEach((edge) => {
      if (edge.data.targetHandle === NodeOutputKeyEnum.selectedTools) {
        changedSourceNodeIds.add(edge.data.target);
      }
    });
    if (meta.chatConfigVariablesChanged) changedSourceNodeIds.add(VARIABLE_NODE_ID);

    const sourceKeys = new Set<string>();
    changedSourceNodeIds.forEach((nodeId) => {
      getReferenceGraphSet({ graph: beforeGraph, key: 'sourceKeysByNode', id: nodeId })?.forEach(
        (key) => sourceKeys.add(key)
      );
      getReferenceGraphSet({ graph: afterGraph, key: 'sourceKeysByNode', id: nodeId })?.forEach(
        (key) => sourceKeys.add(key)
      );
    });
    // 本轮没有引用来源被动过：直接沿用上一份数组，连 Map 都不建。
    if (sourceKeys.size === 0) return document.getDocument().referenceSnapshots;

    const parseSourceIdentityKey = (
      sourceKey: string
    ): WorkflowReferenceSnapshot['reference'] | undefined => {
      const separator = sourceKey.indexOf('\0');
      if (separator <= 0 || separator === sourceKey.length - 1) return;
      return [sourceKey.slice(0, separator), sourceKey.slice(separator + 1)];
    };
    /** 为定格文档建来源作用域；两张索引都惰性构建，本轮没有来源消失时不付代价。 */
    const createFrozenSourceScope = (frozen: RuntimeDocument): ReferenceSourceScope => {
      let nodeIndex: Map<string, WorkflowNodeData> | undefined;
      let mountedTools: Set<string> | undefined;
      const getNodeById = (nodeId: string) =>
        (nodeIndex ??= new Map(frozen.nodes.map(({ data }) => [data.nodeId, data]))).get(nodeId);
      return {
        chatConfig: frozen.chatConfig,
        getNodeById,
        isMountedTool: (nodeId) =>
          (mountedTools ??= getMountedToolNodeIds(
            frozen.edges.map(({ data }) => data),
            getNodeById
          )).has(nodeId)
      };
    };

    // 缓存 Map 只读；本次事务需要删改时复制，避免污染历史文档共享的缓存。
    const snapshots = new Map(toSnapshotMap(previous.referenceSnapshots));
    let previousScope: ReferenceSourceScope | undefined;
    sourceKeys.forEach((sourceKey) => {
      const reference = parseSourceIdentityKey(sourceKey);
      if (!reference) return;
      if (resolveCurrentSource(reference).output) {
        // 来源还在或被恢复：内存里也不留冗余，导出压缩少一项要过滤。
        snapshots.delete(sourceKey);
        return;
      }
      const previousSource = getCurrentReferenceSource({
        reference,
        scope: (previousScope ??= createFrozenSourceScope(previous))
      });
      // 两侧都解析不出来（例如导入的死引用）时不凭空造快照，保留已有的即可。
      if (!previousSource.output) return;
      snapshots.set(sourceKey, {
        reference,
        ...(previousSource.sourceLabel ? { sourceLabel: previousSource.sourceLabel } : {}),
        ...(previousSource.outputLabel ? { outputLabel: previousSource.outputLabel } : {}),
        ...(previousSource.localizeOutputLabel
          ? { localizeOutputLabel: previousSource.localizeOutputLabel }
          : {}),
        ...(previousSource.icon ? { icon: previousSource.icon } : {})
      });
    });

    return [...snapshots].flatMap(([sourceKey, snapshot]) =>
      getReferenceGraphSet({ graph: afterGraph, key: 'consumersBySource', id: sourceKey })?.size
        ? [snapshot]
        : []
    );
  };

  /**
   * 导出压缩：只保留「实时来源已不可解析且当前文档仍有 consumer」的快照，按首次引用顺序去重。
   * consumer 直接来自文档里现存的引用，来源判定只走节点索引，
   * 因此不会像 getReferenceStatus 那样再跑一轮全量上游 BFS。
   */
  const compactSnapshots = (): WorkflowReferenceSnapshot[] => {
    const { nodes, referenceSnapshots } = document.getDocument();
    if (referenceSnapshots.length === 0) return [];
    return compactReferenceSnapshots({
      nodes: nodes.map(({ data }) => data),
      referenceSnapshots,
      resolveSource: resolveCurrentSource
    });
  };

  // endregion

  // region referenceLifecycle Reference cache invalidation and cleanup

  /** 事务提交后按字段身份丢弃缓存，避免 scoped snapshot 复用过期状态。 */
  const invalidateFieldStatuses = (fields: Iterable<WorkflowFieldIdentity>) => {
    invalidateIncomingSources();
    // commitTransaction 已按 changedSourceNodeIds 定向失效来源 metadata；这里仅清字段状态。
    for (const field of fields) {
      fieldStatusCache.delete(getFieldIdentityKey(field));
    }
  };

  /** 全量重建后按字段对象身份清理缓存；字段对象已替换的条目不再有效。 */
  const pruneFieldStatusCache = () => {
    invalidateIncomingSources();
    invalidateSourceMetadata();
    fieldStatusCache.forEach((cached, cacheKey) => {
      const identity = parseFieldIdentityKey(cacheKey);
      const field =
        identity?.kind === 'input'
          ? document
              .getNodeById(identity.nodeId)
              ?.data.inputs.find((item) => item.key === identity.key)
          : undefined;
      if (!field || field !== cached.field) fieldStatusCache.delete(cacheKey);
    });
  };

  /** undo / redo 恢复整份文档：字段状态与上游可达性记忆化一起作废，不依赖调用方再补一次 rebuild。 */
  const clearFieldStatusCache = () => {
    fieldStatusCache.clear();
    invalidateIncomingSources();
    invalidateSourceMetadata();
  };

  const clear = () => {
    fieldStatusCache.clear();
    invalidateIncomingSources();
    invalidateSourceMetadata();
    referenceGraph = createReferenceGraph();
  };

  return {
    getGraph,
    getConsumerNodeIds: getAffectedConsumerNodeIds,
    forkGraph,
    restoreGraph,
    rebuildGraph,
    commitTransaction,
    captureSnapshots,
    compactSnapshots,
    getStructureInvalidationFields,
    getOutputInvalidationFields,
    getFieldStatuses,
    getValueStatuses,
    getReferenceValueType,
    getReferenceOptions,
    invalidateFieldStatuses,
    pruneFieldStatusCache,
    clearFieldStatusCache,
    clear
  };

  // endregion
};
