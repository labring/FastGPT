import type { WorkflowIOValueTypeEnum } from '../../constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum, VARIABLE_NODE_ID } from '../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { isToolParamInput } from '../../../app/formEdit/utils';
import { getSelectedInputRenderType, nodeInputIsReference } from '../../utils';
import { i18nT } from '../../../../common/i18n/utils';
import {
  filterSelectableWorkflowNodeOutputs,
  getHTTPToolParamOutputs,
  getWorkflowReferenceItemsFromValue,
  isWorkflowReferenceItem,
  workflowValueTypeIsCompatible
} from '../utils';
import { getWorkflowGlobalVariables } from '../variables';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType,
  WorkflowReferenceSnapshot
} from '../../type/io';
import type { TUpdateListItem } from '../../template/system/variableUpdate/type';
import type {
  WorkflowFieldIdentity,
  WorkflowNodeData,
  WorkflowReferenceOptionsQuery,
  WorkflowReferenceOption,
  WorkflowReferenceStatus
} from '../types';
import type { AppChatConfigType } from '../../../app/type';
import {
  addFieldIdentity,
  getFieldIdentity,
  getFieldIdentityKey,
  getInputReferences,
  isEmptyValue,
  parseFieldIdentityKey,
  valuesEqual
} from './kernel';
import type {
  DocumentReadApi,
  EdgeRecord,
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
const isMountedToolEdge = ({ data }: EdgeRecord) =>
  data.targetHandle === NodeOutputKeyEnum.selectedTools;

/**
 * 节点是否被 Agent 挂成工具：入边里存在 selectedTools 边即挂载。O(入度)。
 * 入参是按 target 取到的入边集合，实时侧传 GraphIndex.byTarget 的桶，定格文档传最小索引。
 */
export const isMountedToolNode = (incomingEdges: readonly EdgeRecord[] | undefined): boolean =>
  (incomingEdges ?? []).some(isMountedToolEdge);

/**
 * 为没有 GraphIndex 的定格文档建最小 byTarget：只收 selectedTools 入边，
 * 代价与原来的「filter + Set」相同，却能复用同一份挂载判定。
 */
const buildMountedToolIndex = (edges: readonly EdgeRecord[]): Map<string, EdgeRecord[]> => {
  const byTarget = new Map<string, EdgeRecord[]>();
  edges.forEach((edge) => {
    if (!isMountedToolEdge(edge)) return;
    const bucket = byTarget.get(edge.data.target);
    if (bucket) bucket.push(edge);
    else byTarget.set(edge.data.target, [edge]);
  });
  return byTarget;
};

const createReferenceGraph = (): ReferenceGraph => ({
  consumersBySource: new Map(),
  sourcesByConsumer: new Map(),
  sourceKeysByNode: new Map(),
  depth: 0
});

const getReferenceGraphSet = <
  K extends 'consumersBySource' | 'sourcesByConsumer' | 'sourceKeysByNode'
>(
  graph: ReferenceGraph,
  key: K,
  id: string
): Set<string> | undefined => {
  let current: ReferenceGraph | undefined = graph;
  while (current) {
    if (current[key].has(id)) return current[key].get(id) ?? undefined;
    current = current.parent;
  }
  return undefined;
};

const setReferenceGraphSet = <
  K extends 'consumersBySource' | 'sourcesByConsumer' | 'sourceKeysByNode'
>(
  graph: ReferenceGraph,
  key: K,
  id: string,
  value: Set<string> | undefined
) => {
  graph[key].set(id, value ?? null);
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
  const apply = <K extends 'consumersBySource' | 'sourcesByConsumer' | 'sourceKeysByNode'>(
    key: K
  ) => {
    const layers: ReferenceGraph[] = [];
    for (let current: ReferenceGraph | undefined = graph; current; current = current.parent) {
      layers.push(current);
    }
    const ids = new Set<string>();
    layers.forEach((layer) => layer[key].forEach((_, id) => ids.add(id)));
    ids.forEach((id) => {
      const value = getReferenceGraphSet(graph, key, id);
      if (value) compacted[key].set(id, new Set(value));
    });
  };
  apply('consumersBySource');
  apply('sourcesByConsumer');
  apply('sourceKeysByNode');
  return compacted;
};

const addReferenceToGraph = (
  graph: ReferenceGraph,
  field: WorkflowFieldIdentity,
  reference: ReferenceItemValueType
) => {
  const fieldKey = getFieldIdentityKey(field);
  const sourceKey = getSourceIdentityKey(reference);
  const consumers = new Set(getReferenceGraphSet(graph, 'consumersBySource', sourceKey));
  consumers.add(fieldKey);
  setReferenceGraphSet(graph, 'consumersBySource', sourceKey, consumers);
  const sources = new Set(getReferenceGraphSet(graph, 'sourcesByConsumer', fieldKey));
  sources.add(sourceKey);
  setReferenceGraphSet(graph, 'sourcesByConsumer', fieldKey, sources);
  const nodeId = sourceKey.slice(0, sourceKey.indexOf('\0'));
  const sourceKeys = new Set(getReferenceGraphSet(graph, 'sourceKeysByNode', nodeId));
  sourceKeys.add(sourceKey);
  setReferenceGraphSet(graph, 'sourceKeysByNode', nodeId, sourceKeys);
};

const removeReferenceFromGraph = (
  graph: ReferenceGraph,
  field: WorkflowFieldIdentity,
  reference: ReferenceItemValueType
) => {
  const fieldKey = getFieldIdentityKey(field);
  const sourceKey = getSourceIdentityKey(reference);
  const consumers = new Set(getReferenceGraphSet(graph, 'consumersBySource', sourceKey));
  consumers?.delete(fieldKey);
  setReferenceGraphSet(
    graph,
    'consumersBySource',
    sourceKey,
    consumers.size ? consumers : undefined
  );
  const sources = new Set(getReferenceGraphSet(graph, 'sourcesByConsumer', fieldKey));
  sources?.delete(sourceKey);
  setReferenceGraphSet(graph, 'sourcesByConsumer', fieldKey, sources.size ? sources : undefined);
  if (consumers.size === 0) {
    const nodeId = sourceKey.slice(0, sourceKey.indexOf('\0'));
    const sourceKeys = new Set(getReferenceGraphSet(graph, 'sourceKeysByNode', nodeId));
    sourceKeys.delete(sourceKey);
    setReferenceGraphSet(
      graph,
      'sourceKeysByNode',
      nodeId,
      sourceKeys.size ? sourceKeys : undefined
    );
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
      getInputReferences(input).forEach((reference) =>
        removeReferenceFromGraph(graph, field, reference)
      );
    });
  }
  if (after) {
    after.inputs.forEach((input) => {
      const field = getFieldIdentity({ nodeId: after.nodeId, field: input, kind: 'input' });
      getInputReferences(input).forEach((reference) =>
        addReferenceToGraph(graph, field, reference)
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
  getNodeById: (nodeId: string) => NodeRecord | undefined;
  /** 节点是否被 Agent 挂成工具：HTTP 节点的参数输出只在挂载时才是可选来源。 */
  isMountedTool: (nodeId: string) => boolean;
};

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
      return {
        output: {
          id: variable.key,
          key: variable.key,
          type: FlowNodeOutputTypeEnum.static,
          valueType: variable.valueType,
          label: variable.label
        },
        sourceLabel: i18nT('common:core.module.Variable'),
        outputLabel: variable.label,
        icon: 'core/workflow/template/variable',
        valueType: variable.valueType
      };
    }
  } else {
    const node = scope.getNodeById(sourceNodeId);
    const outputs = [
      ...((node?.data.outputs ?? []) as FlowNodeOutputItemType[]),
      ...(node?.data.flowNodeType === FlowNodeTypeEnum.httpRequest468 &&
      scope.isMountedTool(sourceNodeId)
        ? node.data.inputs.filter(isToolParamInput).map((input) => ({
            id: input.key,
            key: input.key,
            type: FlowNodeOutputTypeEnum.static,
            label: input.label ?? input.key,
            valueType: input.valueType
          }))
        : [])
    ];
    const output = node && outputs.find((item) => item.id === outputId);
    if (output) {
      return {
        output,
        sourceLabel: node.data.name,
        outputLabel: output.label,
        ...(node.data.avatar ? { icon: node.data.avatar } : {}),
        ...(output.valueType ? { valueType: output.valueType } : {})
      };
    }
  }

  return {};
};

/**
 * 按稳定引用身份读取来源展示元数据：实时来源优先，来源缺失时回落历史快照。
 * 回落只补展示字段，output 依然为空，因此状态判定照旧报 invalid_reference。
 */
const getReferenceSource = ({
  reference,
  scope,
  snapshots
}: {
  reference: ReferenceItemValueType;
  scope: ReferenceSourceScope;
  snapshots?: readonly WorkflowReferenceSnapshot[];
}): ReferenceSource => {
  const currentSource = getCurrentReferenceSource({ reference, scope });
  if (currentSource.output || !snapshots) return currentSource;

  const sourceKey = getSourceIdentityKey(reference);
  const snapshot = toSnapshotMap(snapshots).get(sourceKey);
  return snapshot
    ? {
        ...(snapshot.sourceLabel ? { sourceLabel: snapshot.sourceLabel } : {}),
        ...(snapshot.outputLabel ? { outputLabel: snapshot.outputLabel } : {}),
        ...(snapshot.icon ? { icon: snapshot.icon } : {})
      }
    : currentSource;
};

/** 把来源节点的下游消费字段并入 affected records；graph 可以是 committed 或 staged 版本。 */
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
    const sourceKeys = getReferenceGraphSet(graph, 'sourceKeysByNode', nodeId);
    sourceKeys?.forEach((sourceKey) => {
      getReferenceGraphSet(graph, 'consumersBySource', sourceKey)?.forEach((consumerKey) => {
        const field = parseFieldIdentityKey(consumerKey);
        if (!field) return;
        meta.affectedNodeIds.add(field.nodeId);
        addFieldIdentity(fieldIds, field);
      });
    });
  });
};

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
  /**
   * 可达性查询按派生轮次缓存精确的 target/source 结果；每次失效推进轮次并清表，避免旧图结果残留。
   * 只物化 DFS 已访问路径，命中目标即返回，不构造完整上游集合。
   */
  const reachabilityCache = new Map<string, { stamp: number; result: boolean }>();
  let reachabilityStamp = 0;
  /** 边、引用输入或整份文档变化都会让上游集合与可达性结果失效。 */
  const invalidateIncomingSources = () => {
    incomingSourcesCache.clear();
    reachabilityStamp += 1;
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
    const byTarget = document.getGraphIndex().byTarget;
    const currentSource =
      cached ??
      getCurrentReferenceSource({
        reference,
        scope: {
          chatConfig,
          getNodeById: document.getNodeById,
          isMountedTool: (nodeId) => isMountedToolNode(byTarget.get(nodeId))
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
          ...(snapshot.icon ? { icon: snapshot.icon } : {})
        }
      : currentSource;
  };

  const getGraph = () => referenceGraph;
  const forkGraph = () => forkReferenceGraph(referenceGraph);
  const commitStagedGraph = (graph: ReferenceGraph) => {
    referenceGraph = compactReferenceGraph(graph);
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
      // HTTP 节点的参数配置同样决定其对外引用来源，所以要额外比较 inputs。
      const sourceMetadataChanged =
        previous.data.name !== next.data.name ||
        previous.data.avatar !== next.data.avatar ||
        previous.data.flowNodeType !== next.data.flowNodeType ||
        previous.data.catchError !== next.data.catchError ||
        !valuesEqual(previous.data.outputs, next.data.outputs) ||
        (previous.data.flowNodeType === FlowNodeTypeEnum.httpRequest468 &&
          !valuesEqual(previous.data.inputs, next.data.inputs));
      if (sourceMetadataChanged) changedSourceNodeIds.add(nodeId);
    });
    [...meta.addedEdges.values(), ...meta.removedEdges.values()].forEach((edge) => {
      if (edge.data.targetHandle === NodeOutputKeyEnum.selectedTools) {
        changedSourceNodeIds.add(edge.data.target);
      }
    });
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

  /**
   * 结构变化后需要额外丢弃引用状态缓存的 affected input 字段。
   * 只有真正持有引用的 input 才可能因为结构变化改变状态，其余字段无需失效。
   */
  const getStructureInvalidationFields = (meta: MutationMeta): WorkflowFieldIdentity[] => {
    if (!meta.structureChanged) return [];
    return [...meta.affectedFieldIds.values()].filter((field) => {
      if (field.kind !== 'input') return false;
      const input = document
        .getNodeIndex()
        .get(field.nodeId)
        ?.record.data.inputs.find((item) => item.key === field.key);
      return input ? getInputReferences(input).length > 0 : false;
    });
  };

  /**
   * 从目标节点反向遍历所有上游节点，visited 保证循环图有限终止。
   * 结果按 nodeId 记忆化到本轮派生结束；返回的 Set 共享只读，调用方不得原地修改。
   */
  const getIncomingSources = (nodeId: string, includeChildren = false): ReadonlySet<string> => {
    const cacheKey = includeChildren ? `${nodeId}\0children` : nodeId;
    const memoized = incomingSourcesCache.get(cacheKey);
    if (memoized) return memoized;
    const graphIndex = document.getGraphIndex();
    const sourceIds = new Set<string>();
    const containerNodeIds = [nodeId];
    const visitedParents = new Set<string>(containerNodeIds);
    let parentNodeId = graphIndex.parentByChild.get(nodeId);
    while (parentNodeId && !visitedParents.has(parentNodeId)) {
      containerNodeIds.push(parentNodeId);
      visitedParents.add(parentNodeId);
      parentNodeId = graphIndex.parentByChild.get(parentNodeId);
    }
    const containerNodeIdSet = new Set(containerNodeIds);
    const queue = [...containerNodeIds];
    const searchedTargetIds = new Set<string>();
    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const targetId = queue[queueIndex++];
      if (!targetId) continue;
      if (searchedTargetIds.has(targetId)) continue;
      searchedTargetIds.add(targetId);
      if (targetId !== nodeId && containerNodeIdSet.has(targetId)) {
        const container = document.getNodeById(targetId);
        container?.data.inputs.forEach((input) => {
          if (!nodeInputIsReference(input)) return;
          getInputReferences(input).forEach(([sourceId]) => {
            if (sourceId === VARIABLE_NODE_ID || !document.getNodeById(sourceId)) return;
            sourceIds.add(sourceId);
            queue.push(sourceId);
          });
        });
      }
      (graphIndex.byTarget.get(targetId) ?? []).forEach((edge) => {
        if (sourceIds.has(edge.data.source) || !document.isSourceEdgeValid(edge)) return;
        sourceIds.add(edge.data.source);
        queue.push(edge.data.source);
      });
    }
    if (includeChildren) {
      graphIndex.childrenByParent.get(nodeId)?.forEach((childId) => sourceIds.add(childId));
    }
    incomingSourcesCache.set(cacheKey, sourceIds);
    return sourceIds;
  };

  /** 计算一个引用相对目标节点的状态；循环图通过 GraphIndex 的 visited 集合自然终止。 */
  const getReferenceStatus = ({
    reference,
    targetType,
    targetNodeId
  }: {
    reference: ReferenceItemValueType;
    targetType?: WorkflowIOValueTypeEnum;
    targetNodeId: string;
  }): WorkflowReferenceStatus => {
    /** 反向 DFS 只判断单个来源是否可达；命中即停，不物化目标的完整上游集合。 */
    const canReachUpstream = (sourceNodeId: string): boolean => {
      const cacheKey = `${targetNodeId}\0${sourceNodeId}`;
      const cached = reachabilityCache.get(cacheKey);
      if (cached?.stamp === reachabilityStamp) return cached.result;

      const graphIndex = document.getGraphIndex();
      const containerNodeIds = [targetNodeId];
      const containerNodeIdSet = new Set(containerNodeIds);
      let parentNodeId = graphIndex.parentByChild.get(targetNodeId);
      while (parentNodeId && !containerNodeIdSet.has(parentNodeId)) {
        containerNodeIds.push(parentNodeId);
        containerNodeIdSet.add(parentNodeId);
        parentNodeId = graphIndex.parentByChild.get(parentNodeId);
      }

      const stack = [...containerNodeIds];
      const searchedTargetIds = new Set<string>();
      let result = false;
      while (stack.length > 0 && !result) {
        const targetId = stack.pop();
        if (!targetId || searchedTargetIds.has(targetId)) continue;
        searchedTargetIds.add(targetId);

        if (targetId !== targetNodeId && containerNodeIdSet.has(targetId)) {
          const container = document.getNodeById(targetId);
          for (const input of container?.data.inputs ?? []) {
            if (!nodeInputIsReference(input)) continue;
            for (const [candidateSourceId] of getInputReferences(input)) {
              if (
                candidateSourceId === VARIABLE_NODE_ID ||
                !document.getNodeById(candidateSourceId)
              ) {
                continue;
              }
              if (candidateSourceId === sourceNodeId) {
                result = true;
                break;
              }
              stack.push(candidateSourceId);
            }
            if (result) break;
          }
        }
        if (result) break;

        for (const edge of graphIndex.byTarget.get(targetId) ?? []) {
          if (!document.isSourceEdgeValid(edge)) continue;
          if (edge.data.source === sourceNodeId) {
            result = true;
            break;
          }
          stack.push(edge.data.source);
        }
      }

      reachabilityCache.set(cacheKey, { stamp: reachabilityStamp, result });
      return result;
    };

    const [sourceNodeId] = reference;
    const source = resolveCurrentSource(reference);
    const sourceMetadata = {
      ...(source.sourceLabel ? { sourceLabel: source.sourceLabel } : {}),
      ...(source.outputLabel ? { outputLabel: source.outputLabel } : {}),
      ...(source.icon ? { icon: source.icon } : {})
    };
    if (sourceNodeId === VARIABLE_NODE_ID) {
      if (!source.output) return { code: 'invalid_reference', reference, ...sourceMetadata };
      return workflowValueTypeIsCompatible(source.output.valueType, targetType)
        ? { code: 'valid', sourceType: source.output.valueType, reference, ...sourceMetadata }
        : {
            code: 'invalid_reference_type',
            sourceType: source.output.valueType,
            reference,
            ...sourceMetadata
          };
    }

    const sourceNode = document.getNodeById(sourceNodeId);
    const sourceOutput = source.output;
    if (!sourceNode || !sourceOutput)
      return { code: 'invalid_reference', reference, ...sourceMetadata };
    const selectableOutputs = filterSelectableWorkflowNodeOutputs({
      outputs: [sourceOutput],
      catchError: sourceNode.data.catchError
    });
    if (selectableOutputs.length === 0)
      return { code: 'invalid_reference', reference, ...sourceMetadata };
    if (!canReachUpstream(sourceNodeId)) {
      return {
        code: 'unreachable_reference',
        sourceType: sourceOutput.valueType,
        reference,
        ...sourceMetadata
      };
    }
    return workflowValueTypeIsCompatible(sourceOutput.valueType, targetType)
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
    if (isEmptyValue(value)) {
      fieldStatusCache.set(cacheKey, { field, statuses: [] });
      return [];
    }
    const references = getInputReferences(field);
    if (!nodeInputIsReference(field) && references.length === 0) {
      fieldStatusCache.set(cacheKey, { field, statuses: [] });
      return [];
    }
    const targetType = 'renderTypeList' in field ? field.valueType : undefined;
    const statuses =
      field.key === NodeInputKeyEnum.updateList && Array.isArray(value)
        ? (() => {
            const seen = new Set<string>();
            const result: WorkflowReferenceStatus[] = [];
            const addStatus = (
              reference: ReferenceItemValueType,
              referenceTargetType?: WorkflowIOValueTypeEnum
            ) => {
              const referenceKey = reference.join('\0');
              if (seen.has(referenceKey)) return;
              seen.add(referenceKey);
              result.push(
                getReferenceStatus({
                  reference,
                  targetType: referenceTargetType,
                  targetNodeId: nodeId
                })
              );
            };

            (value as TUpdateListItem[]).forEach((item) => {
              getWorkflowReferenceItemsFromValue(item.variable, {
                includeCanonicalReferences: true
              }).forEach((reference) => {
                addStatus(reference, item.valueType);
              });
              const variableType = getReferenceValueType(item.variable);
              getWorkflowReferenceItemsFromValue(item.value, {
                includeCanonicalReferences: item.renderType === FlowNodeInputTypeEnum.reference
              }).forEach((reference) => addStatus(reference, variableType));
            });
            return result;
          })()
        : references.map((reference) =>
            getReferenceStatus({ reference, targetType, targetNodeId: nodeId })
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
  const isOrdinaryMultipleSelectValue = (targetNodeId: string, value: unknown) => {
    const node = document.getNodeById(targetNodeId);
    return node?.data.inputs.some((input) => {
      const selectedType = getSelectedInputRenderType(input);
      if (selectedType !== FlowNodeInputTypeEnum.multipleSelect) return false;
      return input.value === value || (input.value === undefined && input.defaultValue === value);
    });
  };

  const getValueStatuses = ({
    value,
    targetNodeId,
    targetType
  }: {
    value: unknown;
    targetNodeId: string;
    targetType?: WorkflowIOValueTypeEnum;
  }): WorkflowReferenceStatus[] => {
    // Multiple-select 的选项值也可能是二元字符串数组；只有选中 reference 模式才按引用解释。
    if (isOrdinaryMultipleSelectValue(targetNodeId, value)) return [];

    const statuses = getWorkflowReferenceItemsFromValue(value, {
      includeCanonicalReferences: true
    }).map((reference) => getReferenceStatus({ reference, targetType, targetNodeId }));
    return hasMalformedReferenceArray(value) || (statuses.length === 0 && !isEmptyValue(value))
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
    includeChildren
  }: WorkflowReferenceOptionsQuery): WorkflowReferenceOption[] => {
    const nodeIndex = document.getNodeIndex();
    const graphIndex = document.getGraphIndex();
    const sourceIds = getIncomingSources(nodeId, includeChildren);
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
        const isMountedTool = isMountedToolNode(graphIndex.byTarget.get(sourceNodeId));
        filterSelectableWorkflowNodeOutputs({
          outputs: [
            ...sourceNode.data.outputs,
            ...(isMountedTool
              ? getHTTPToolParamOutputs({ ...sourceNode.data, id: sourceNode.data.nodeId })
              : [])
          ],
          valueType,
          catchError: sourceNode.data.catchError
        }).forEach((output) => {
          options.push({
            reference: [sourceNodeId, output.id],
            sourceType: output.valueType,
            sourceLabel: sourceNode.data.name,
            outputLabel: output.label ?? output.key,
            ...(sourceNode.data.avatar ? { icon: sourceNode.data.avatar } : {})
          });
        });
      });

    getWorkflowGlobalVariables({ chatConfig: document.getDocument().chatConfig }).forEach(
      (variable) => {
        if (!workflowValueTypeIsCompatible(variable.valueType, valueType)) return;
        options.push({
          reference: [VARIABLE_NODE_ID, variable.key],
          sourceType: variable.valueType,
          sourceLabel: i18nT('common:core.module.Variable'),
          outputLabel: variable.label,
          icon: 'core/workflow/template/variable'
        });
      }
    );

    return options;
  };

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
      getReferenceGraphSet(beforeGraph, 'sourceKeysByNode', nodeId)?.forEach((key) =>
        sourceKeys.add(key)
      );
      getReferenceGraphSet(afterGraph, 'sourceKeysByNode', nodeId)?.forEach((key) =>
        sourceKeys.add(key)
      );
    });
    // 本轮没有引用来源被动过：直接沿用上一份数组，连 Map 都不建。
    if (sourceKeys.size === 0) return document.getDocument().referenceSnapshots;

    const parseSourceIdentityKey = (sourceKey: string): ReferenceItemValueType | undefined => {
      const separator = sourceKey.indexOf('\0');
      if (separator < 0) return undefined;
      return [sourceKey.slice(0, separator), sourceKey.slice(separator + 1)];
    };
    /** 为定格文档建来源作用域；两张索引都惰性构建，本轮没有来源消失时不付代价。 */
    const createFrozenSourceScope = (frozen: RuntimeDocument): ReferenceSourceScope => {
      let nodeIndex: Map<string, NodeRecord> | undefined;
      let mountedToolByTarget: Map<string, EdgeRecord[]> | undefined;
      return {
        chatConfig: frozen.chatConfig,
        getNodeById: (nodeId) =>
          (nodeIndex ??= new Map(frozen.nodes.map((node) => [node.data.nodeId, node]))).get(nodeId),
        isMountedTool: (nodeId) =>
          isMountedToolNode(
            (mountedToolByTarget ??= buildMountedToolIndex(frozen.edges)).get(nodeId)
          )
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
      const previousSource = getReferenceSource({
        reference,
        scope: (previousScope ??= createFrozenSourceScope(previous)),
        snapshots: previous.referenceSnapshots
      });
      // 两侧都解析不出来（例如导入的死引用）时不凭空造快照，保留已有的即可。
      if (!previousSource.output) return;
      snapshots.set(sourceKey, {
        reference,
        ...(previousSource.sourceLabel ? { sourceLabel: previousSource.sourceLabel } : {}),
        ...(previousSource.outputLabel ? { outputLabel: previousSource.outputLabel } : {}),
        ...(previousSource.icon ? { icon: previousSource.icon } : {})
      });
    });

    return [...snapshots].flatMap(([sourceKey, snapshot]) =>
      getReferenceGraphSet(afterGraph, 'consumersBySource', sourceKey)?.size ? [snapshot] : []
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
    const snapshots = toSnapshotMap(referenceSnapshots);
    const compacted: WorkflowReferenceSnapshot[] = [];
    const seen = new Set<string>();
    nodes.forEach(({ data }) => {
      data.inputs.forEach((input) => {
        getInputReferences(input).forEach((reference) => {
          const sourceKey = getSourceIdentityKey(reference);
          // 同一来源被多个 consumer 引用只导出一条，顺序取首次引用。
          if (seen.has(sourceKey)) return;
          seen.add(sourceKey);
          const snapshot = snapshots.get(sourceKey);
          if (!snapshot) return;
          if (resolveCurrentSource(reference).output) return;
          compacted.push(snapshot);
        });
      });
    });
    return compacted;
  };

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
    forkGraph,
    rebuildGraph,
    commitTransaction,
    captureSnapshots,
    compactSnapshots,
    getStructureInvalidationFields,
    getFieldStatuses,
    getValueStatuses,
    getReferenceValueType,
    getReferenceOptions,
    invalidateFieldStatuses,
    pruneFieldStatusCache,
    clearFieldStatusCache,
    clear
  };
};
