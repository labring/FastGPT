import { NodeOutputKeyEnum, VARIABLE_NODE_ID } from '../../constants';
import { stripCanvasSizeInputs } from '../../migration/migrate';
import {
  FlowNodeTypeEnum,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '../../node/constant';
import { StoreEdgeItemTypeSchema, type StoreEdgeItemType } from '../../type/edge';
import { StoreNodeItemTypeSchema, type NodeTemplateContext } from '../../type/node';
import { AppChatConfigTypeSchema } from '../../../app/type';
import {
  getWorkflowReferenceItems,
  isConnectionTargetAllowed,
  isWorkflowEdgeSourceHandleValid
} from '../utils';
import { nodeInputIsReference } from '../../utils';
import { applyWorkflowStartInputAutoFill } from '../startAutoFill';
import type {
  PlacementRequest,
  RuntimeEdgeId,
  WorkflowEdgeEndpoint,
  WorkflowGraphQueries,
  WorkflowHandleConnectionQuery,
  WorkflowNodeData
} from '../types';
import {
  addFieldIdentity,
  cloneValue,
  freezeValue,
  getError,
  getFieldIdentity,
  valuesEqual
} from './kernel';
import {
  deleteStagedNodeView,
  getStagedNodeView,
  mergeNodeView,
  replaceStagedNodeViews,
  setStagedNodeView
} from './nodeViewModule';
import { isMountedToolNode, updateReferenceGraphNode } from './referenceModule';
import type {
  CanonicalResult,
  EdgeRecord,
  GraphIndex,
  IndexedNode,
  MutationMeta,
  RuntimeDocument,
  SemanticCommand,
  TransactionContext
} from './types';
import {
  applyGraphIndexChanges,
  applyPersistedDerivedFields,
  applyWorkflowStartChanges,
  buildDocument,
  buildGraphIndex,
  buildNodeIndex,
  collectDescendantNodeIds,
  collectNodeFieldChanges,
  collectWorkflowStartIds,
  commitNodeRecordUpdate,
  getPlacementError,
  hasForbidDelete,
  isContainerArrayInputKey,
  isUniqueRootNodeType,
  placementError,
  recordEdgeChange,
  recordNodeChange,
  reuseEqualItems,
  ROOT_PARENT_KEY,
  splitNode,
  validateNodeDeletion,
  validateNodePlacement
} from './documentRules';

/**
 * Document module：拥有 Node Data、edges、chatConfig、Runtime Edge ID、node/graph 索引，
 * 以及语义命令的校验与 reduce。无状态规则在 ./documentRules，本文件只保留有状态工厂。
 * 节点视图不在这里：Document 只持有语义记录，视图存储归 Node View module。
 */

/** 图查询的空结果：共用一份冻结数组，「没有入边/子节点」也不产生新身份。 */
const EMPTY_EDGE_ENDPOINTS = freezeValue([]) as readonly WorkflowEdgeEndpoint[];
const EMPTY_NODE_IDS = freezeValue([]) as readonly string[];

/** Create the Workflow Document module；入参是入站边界已经组装好的初始文档与视图。 */
export const createDocumentModule = (initial: CanonicalResult) => {
  let document = initial.document;
  let nextEdgeId = initial.nextEdgeId;
  let nodeIndex: Map<string, IndexedNode> = buildNodeIndex(document.nodes);
  let graphIndex: GraphIndex = {
    bySource: new Map(),
    byTarget: new Map(),
    parentByChild: new Map(),
    childrenByParent: new Map(),
    edgeById: new Map()
  };
  let workflowStartIds = new Set<string>();

  const getDocument = () => document;
  const setDocument = (next: RuntimeDocument) => {
    document = next;
  };
  const getNodeIndex = () => nodeIndex;
  const getGraphIndex = () => graphIndex;
  const getNodeById = (nodeId: string) => nodeIndex.get(nodeId)?.record;

  /** 重建私有邻接索引。 */
  const rebuildGraphIndex = () => {
    graphIndex = buildGraphIndex(document.nodes, document.edges);
  };

  /** 普通命令只提交局部图变化；replace 与 undo/redo 才走全量重建。 */
  const updateGraphIndexIncrementally = (meta: MutationMeta) =>
    applyGraphIndexChanges(graphIndex, meta);

  const rebuildNodeIndex = () => {
    nodeIndex = buildNodeIndex(document.nodes);
  };

  /** 普通字段/节点更新只替换对应 Map entry；删除才需要重排数组索引。 */
  const updateNodeIndexIncrementally = (meta: MutationMeta) => {
    const hasDeletion = [...meta.nodeChanges.values()].some(
      ({ before, after }) => before && !after
    );
    if (hasDeletion) {
      rebuildNodeIndex();
      return;
    }
    meta.nodeChanges.forEach(({ after, afterIndex }, nodeId) => {
      if (!after) return;
      const index = afterIndex ?? nodeIndex.get(nodeId)?.index;
      if (index !== undefined) nodeIndex.set(nodeId, { record: after, index });
    });
  };

  const updateWorkflowStartIndex = (meta: MutationMeta) =>
    applyWorkflowStartChanges(workflowStartIds, meta);

  const rebuildWorkflowStartIds = () => {
    workflowStartIds = collectWorkflowStartIds(document.nodes);
  };

  const getWorkingNode = (nodeId: string, meta?: MutationMeta) => {
    const change = meta?.nodeChanges.get(nodeId);
    if (change) return change.after;
    return nodeIndex.get(nodeId)?.record;
  };

  const getWorkingNodeIndex = ({
    working,
    nodeId,
    meta
  }: {
    working: RuntimeDocument;
    nodeId: string;
    meta?: MutationMeta;
  }) => {
    const change = meta?.nodeChanges.get(nodeId);
    if (change)
      return change.after ? (change.afterIndex ?? working.nodes.indexOf(change.after)) : -1;
    return nodeIndex.get(nodeId)?.index ?? -1;
  };

  const getFlowNodeById = ({
    working,
    nodeId,
    meta
  }: {
    working: RuntimeDocument;
    nodeId: string;
    meta?: MutationMeta;
  }) => {
    const indexedNode = getWorkingNode(nodeId, meta);
    if (indexedNode) return { ...indexedNode.data, id: indexedNode.data.nodeId };
    const data = working.nodes.find(({ data }) => data.nodeId === nodeId)?.data;
    return data ? { ...data, id: data.nodeId } : undefined;
  };

  /** 判断边的 source handle 是否仍由分支节点当前配置提供。 */
  const isSourceEdgeValid = (edge: EdgeRecord) => {
    const sourceData = getNodeById(edge.data.source)?.data;
    return isWorkflowEdgeSourceHandleValid(sourceData, edge.data.sourceHandle);
  };

  const getDescendantNodeIds = (rootIds: ReadonlySet<string>) =>
    collectDescendantNodeIds(graphIndex.childrenByParent, rootIds);

  /**
   * 图查询的集合缓存：记住产出当前结果的那个索引桶。
   * GraphIndex 的桶只整体替换、从不原地修改（见 documentRules 的 buildGraphIndex /
   * applyGraphIndexChanges），所以桶身份不变就等于该入参的结构没变，可以复用同一份数组身份；
   * 桶被替换时缓存自然失效。条目按入参覆盖，缓存大小不超过被查询过的 id 数。
   *
   * 节点删除后条目会持有已 drop 的桶（连带 EdgeRecord），直到下一次 clear() 才释放；
   * 缓存上界是被查询过的不同 id 数。若需要更早释放，可在 applyGraphIndexChanges 处理 removed 时删除条目。
   */
  const incomingEdgesCache = new Map<
    string,
    { bucket: EdgeRecord[]; endpoints: readonly WorkflowEdgeEndpoint[] }
  >();
  const childNodeIdsCache = new Map<string, { bucket: string[]; nodeIds: readonly string[] }>();
  const sourceNodeIdsCache = new Map<
    string,
    { document: RuntimeDocument; nodeIds: readonly string[] }
  >();

  const getSourceNodeIds = ({
    nodeId,
    includeChildren = false
  }: {
    nodeId: string;
    includeChildren?: boolean;
  }) => {
    const cacheKey = `${nodeId}\0${includeChildren ? 'children' : 'sources'}`;
    const cached = sourceNodeIdsCache.get(cacheKey);
    if (cached?.document === document) return cached.nodeIds;

    const node = nodeIndex.get(nodeId)?.record.data;
    if (!node) return EMPTY_NODE_IDS;

    const sourceIds = new Set<string>();
    const searchedTargetNodeIds = new Set<string>();
    const getFlowNode = (sourceNodeId: string) => {
      return nodeIndex.get(sourceNodeId)?.record.data;
    };
    const collectIncoming = (targetNodeIds: readonly string[]) => {
      const queue = [...targetNodeIds];
      while (queue.length > 0) {
        const targetNodeId = queue.shift();
        if (!targetNodeId || searchedTargetNodeIds.has(targetNodeId)) continue;
        searchedTargetNodeIds.add(targetNodeId);
        (graphIndex.byTarget.get(targetNodeId) ?? []).forEach((edge) => {
          if (
            edge.data.target !== targetNodeId ||
            !isWorkflowEdgeSourceHandleValid(getFlowNode(edge.data.source), edge.data.sourceHandle)
          ) {
            return;
          }
          sourceIds.add(edge.data.source);
          queue.push(edge.data.source);
        });
      }
    };

    const containerNodes = [node];
    const visitedParentIds = new Set<string>([node.nodeId]);
    let parentNodeId = node.parentNodeId;
    while (parentNodeId && !visitedParentIds.has(parentNodeId)) {
      const parent = nodeIndex.get(parentNodeId)?.record.data;
      if (!parent) break;
      containerNodes.push(parent);
      visitedParentIds.add(parent.nodeId);
      parentNodeId = parent.parentNodeId;
    }

    collectIncoming([node.nodeId]);
    containerNodes.slice(1).forEach((container) => collectIncoming([container.nodeId]));
    containerNodes.slice(1).forEach((container) => {
      container.inputs.forEach((input) => {
        if (!nodeInputIsReference(input)) return;
        getWorkflowReferenceItems(input.value).forEach(([referenceNodeId]) => {
          if (referenceNodeId === VARIABLE_NODE_ID || !nodeIndex.has(referenceNodeId)) return;
          sourceIds.add(referenceNodeId);
          collectIncoming([referenceNodeId]);
        });
      });
    });

    if (includeChildren) {
      graphIndex.childrenByParent.get(nodeId)?.forEach((childId) => {
        if (nodeIndex.has(childId)) sourceIds.add(childId);
      });
    }

    const nodeIds = freezeValue([...sourceIds]) as readonly string[];
    sourceNodeIdsCache.set(cacheKey, { document, nodeIds });
    return nodeIds;
  };

  /**
   * 图查询面：只读已提交的 GraphIndex，不建第二份索引，也不做深拷贝。
   * 对象在 module 生命周期内只创建一次，port 透传出去的身份因此恒定；
   * 释放后索引已清空，查询返回空结果而不抛错（与 getPlacementContext 一样避免卸载竞态打崩渲染）。
   */
  const graphQueries = freezeValue({
    isMountedTool: (nodeId: string) => isMountedToolNode(graphIndex.byTarget.get(nodeId)),
    isHandleConnected: ({ nodeId, handleId, direction }: WorkflowHandleConnectionQuery) => {
      const isSource = direction === 'source';
      const bucket = isSource ? graphIndex.bySource.get(nodeId) : graphIndex.byTarget.get(nodeId);
      return (bucket ?? []).some(({ data }) =>
        isSource ? data.sourceHandle === handleId : data.targetHandle === handleId
      );
    },
    getIncomingEdges: (nodeId: string) => {
      const bucket = graphIndex.byTarget.get(nodeId);
      if (!bucket?.length) return EMPTY_EDGE_ENDPOINTS;
      const cached = incomingEdgesCache.get(nodeId);
      if (cached?.bucket === bucket) return cached.endpoints;
      // 只投影连线判定需要的端点字段：内部边记录与 Runtime Edge ID 不外泄。
      const endpoints = freezeValue(
        bucket.map(({ data }) => ({
          source: data.source,
          sourceHandle: data.sourceHandle,
          target: data.target,
          targetHandle: data.targetHandle
        }))
      ) as readonly WorkflowEdgeEndpoint[];
      incomingEdgesCache.set(nodeId, { bucket, endpoints });
      return endpoints;
    },
    /** parentId 传空串命中根级桶，因此根级子节点也能查。 */
    getChildNodeIds: (parentId: string) => {
      const bucket = graphIndex.childrenByParent.get(parentId);
      if (!bucket?.length) return EMPTY_NODE_IDS;
      const cached = childNodeIdsCache.get(parentId);
      if (cached?.bucket === bucket) return cached.nodeIds;
      // 复制一份再冻结：索引桶是内部可变结构，不能直接交出去。
      const nodeIds = freezeValue([...bucket]) as readonly string[];
      childNodeIdsCache.set(parentId, { bucket, nodeIds });
      return nodeIds;
    },
    getSourceNodeIds
  }) as WorkflowGraphQueries;

  const getGraphQueries = () => graphQueries;

  /**
   * 从 working document 派生 placement context：侧边栏、handle 快捷添加、模板落点、拖入容器与连线校验共用。
   *
   * 作用域父容器决定 hasToolNode / hasLoopRunNode / takenUniqueTypes 的统计范围（Notes：按直接子节点算），
   * 默认取来源节点的父容器，placement 校验里显式传目标容器；作用域为 null 表示文档根。
   * 既无来源节点又不是侧边栏时返回 null，调用方把 null 当「允许」。
   */
  const derivePlacementContext = ({
    sourceNodeId,
    handleId,
    isSidebar = false,
    parentNodeId,
    working = document,
    meta
  }: {
    sourceNodeId?: string;
    handleId?: string | null;
    isSidebar?: boolean;
    /** undefined 表示按来源节点推导，null 表示文档根。 */
    parentNodeId?: string | null;
    working?: RuntimeDocument;
    meta?: MutationMeta;
  }): NodeTemplateContext | null => {
    const getNodeData = (nodeId?: string | null) =>
      nodeId ? getWorkingNode(nodeId, meta)?.data : undefined;

    const source = getNodeData(sourceNodeId);
    if (!source && !isSidebar) return null;

    const scopeParentId =
      parentNodeId !== undefined ? parentNodeId : (source?.parentNodeId ?? null);
    // 已提交状态直接读图索引（O(直接子节点)，root 作用域读 ROOT_PARENT_KEY 桶）；
    // 事务内有 staged 节点变化时索引还没更新，回落扫描 working。
    const scopeNodes: WorkflowNodeData[] = !meta?.nodeChanges.size
      ? (graphIndex.childrenByParent.get(scopeParentId || ROOT_PARENT_KEY) ?? [])
          .map((nodeId) => nodeIndex.get(nodeId)?.record.data)
          .filter((data): data is WorkflowNodeData => !!data)
      : working.nodes
          .filter(({ data }) =>
            scopeParentId === null ? !data.parentNodeId : data.parentNodeId === scopeParentId
          )
          .map(({ data }) => data);
    const isScopeUniqueType = (flowNodeType: FlowNodeTypeEnum) =>
      scopeParentId === null
        ? isUniqueRootNodeType(flowNodeType)
        : isNestedChildSystemNodeType(flowNodeType);

    /**
     * 工具子流程可经过多个普通节点，沿入边索引上溯找到任一 selectedTools 根边即可。
     * 只读已提交的 graphIndex.byTarget：上面那段 working 回落只覆盖节点，事务内 staged 的边
     * 在这里不可见。当前没有命令会在同一笔事务里既改边又派生 context，因此这是前提而非现行 bug。
     */
    const isConnectedTool = (nodeId: string) => {
      const pendingNodeIds = [nodeId];
      const visitedNodeIds = new Set<string>();
      while (pendingNodeIds.length) {
        const currentId = pendingNodeIds.pop()!;
        if (visitedNodeIds.has(currentId)) continue;
        visitedNodeIds.add(currentId);

        for (const { data } of graphIndex.byTarget.get(currentId) ?? []) {
          if (data.targetHandle === NodeOutputKeyEnum.selectedTools) return true;
          if (data.source) pendingNodeIds.push(data.source);
        }
      }
      return false;
    };

    return {
      isSidebar,
      sourceNodeId: source?.nodeId ?? null,
      sourceType: source?.flowNodeType ?? null,
      isConnectedTool: source ? isConnectedTool(source.nodeId) : false,
      handleId: handleId ?? null,
      parentType: scopeParentId ? (getNodeData(scopeParentId)?.flowNodeType ?? null) : null,
      hasToolNode: scopeNodes.some(
        ({ flowNodeType }) => flowNodeType === FlowNodeTypeEnum.toolCall
      ),
      hasLoopRunNode: scopeNodes.some(
        ({ flowNodeType }) => flowNodeType === FlowNodeTypeEnum.loopRun
      ),
      takenUniqueTypes: scopeNodes.map(({ flowNodeType }) => flowNodeType).filter(isScopeUniqueType)
    };
  };

  /** 公开端口：只读已提交 Document。 */
  const getPlacementContext = (request: PlacementRequest): NodeTemplateContext | null =>
    derivePlacementContext({
      sourceNodeId: request.node?.nodeId,
      handleId: request.node?.handleId,
      isSidebar: request.isSidebar
    });

  /** placement 校验用的容器 context：作用域是目标容器，没有来源节点，按侧边栏口径产出。 */
  const getContainerPlacementContext = (
    containerId: string | undefined,
    working: RuntimeDocument,
    meta: MutationMeta
  ) =>
    containerId
      ? derivePlacementContext({ isSidebar: true, parentNodeId: containerId, working, meta })
      : null;

  const isEdgeConnectionAllowed = (
    working: RuntimeDocument,
    edge: StoreEdgeItemType,
    ignoreEdgeId?: RuntimeEdgeId,
    meta?: MutationMeta
  ) => {
    const source = getFlowNodeById({ working, nodeId: edge.source, meta });
    const target = getFlowNodeById({ working, nodeId: edge.target, meta });
    if (
      !source ||
      !target ||
      edge.source === edge.target ||
      !isWorkflowEdgeSourceHandleValid(source, edge.sourceHandle)
    ) {
      return false;
    }
    if (
      working.edges.some(
        ({ id, data }) =>
          id !== ignoreEdgeId &&
          data.target === edge.target &&
          data.targetHandle === NodeOutputKeyEnum.selectedTools
      )
    ) {
      return false;
    }
    if (
      working.edges.some(
        ({ id, data }) =>
          id !== ignoreEdgeId &&
          data.source === edge.source &&
          data.target === edge.target &&
          data.sourceHandle === edge.sourceHandle
      )
    ) {
      return false;
    }
    return isConnectionTargetAllowed({
      context: derivePlacementContext({
        sourceNodeId: edge.source,
        handleId: edge.sourceHandle,
        working,
        meta
      }),
      targetNode: target,
      sourceParentNodeId: source.parentNodeId
    });
  };

  /** 将一次新增/连线意图产生的流程开始引用补丁并入同一 working transaction。 */
  const applyWorkflowStartAutoFill = ({ working, meta, referenceGraph }: TransactionContext) => {
    const getWorkingTargets = (nodeId: string) => {
      const targets = (graphIndex.bySource.get(nodeId) ?? [])
        .filter((edge) => !meta.removedEdges.has(edge.id))
        .map((edge) => edge.data.target);
      meta.addedEdges.forEach((edge) => {
        if (edge.data.source === nodeId) targets.push(edge.data.target);
      });
      return targets;
    };
    const startIds = new Set(workflowStartIds);
    meta.nodeChanges.forEach(({ before, after }, nodeId) => {
      if (before?.data.flowNodeType === FlowNodeTypeEnum.workflowStart) startIds.delete(nodeId);
      if (after?.data.flowNodeType === FlowNodeTypeEnum.workflowStart) startIds.add(nodeId);
    });

    startIds.forEach((startNodeId) => {
      const startNode = getWorkingNode(startNodeId, meta);
      if (!startNode) return;
      const visited = new Set<string>();
      const queue = getWorkingTargets(startNode.data.nodeId);
      while (queue.length > 0) {
        const nodeId = queue.shift();
        if (!nodeId || visited.has(nodeId)) continue;
        visited.add(nodeId);
        const target = getWorkingNode(nodeId, meta);
        if (!target) continue;

        const nextInputs = applyWorkflowStartInputAutoFill({
          inputs: target.data.inputs,
          workflowStartNodeId: startNode.data.nodeId,
          workflowStartOutputs: startNode.data.outputs
        });
        if (!valuesEqual(target.data.inputs, nextInputs)) {
          const nextData = { ...target.data, inputs: nextInputs };
          const previousData = target.data;
          const targetIndex = getWorkingNodeIndex({ working, nodeId, meta });
          // 保留原记录上的运行时元数据（forbidDelete），只替换语义数据。
          const nextRecord = { ...target, data: nextData };
          working.nodes = working.nodes.slice();
          working.nodes[targetIndex] = nextRecord;
          updateReferenceGraphNode({
            graph: referenceGraph,
            before: previousData,
            after: nextData
          });
          recordNodeChange({
            meta,
            nodeId,
            before: target,
            after: nextRecord,
            afterIndex: targetIndex
          });
          collectNodeFieldChanges({
            changedFieldIds: meta.changedFieldIds,
            before: previousData,
            after: nextData
          });
        }
        queue.push(...getWorkingTargets(nodeId));
      }
    });
  };

  /** 结构边变化会影响目标及其下游的可达性，按两版边集合取保守闭包。 */
  const addAffectedStructure = (meta: MutationMeta) => {
    if (!meta.structureChanged) return;
    const seedNodeIds = new Set<string>();
    meta.nodeChanges.forEach(({ before, after }, nodeId) => {
      if (!before || !after || before.data.parentNodeId !== after.data.parentNodeId) {
        if (after) seedNodeIds.add(nodeId);
        return;
      }
      if (
        !valuesEqual(before.data.outputs, after.data.outputs) ||
        before.data.flowNodeType !== after.data.flowNodeType
      ) {
        seedNodeIds.add(nodeId);
      }
    });
    meta.addedEdges.forEach((edge) => {
      seedNodeIds.add(edge.data.target);
    });
    meta.removedEdges.forEach((edge) => {
      seedNodeIds.add(edge.data.target);
    });

    const queue = [...seedNodeIds];
    const visited = new Set<string>();
    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const nodeId = queue[queueIndex++];
      if (!nodeId || visited.has(nodeId)) continue;
      visited.add(nodeId);
      meta.affectedNodeIds.add(nodeId);
      nodeIndex
        .get(nodeId)
        ?.record.data.inputs.forEach((input) =>
          addFieldIdentity(
            meta.affectedFieldIds,
            getFieldIdentity({ nodeId, field: input, kind: 'input' })
          )
        );
      queue.push(...(graphIndex.bySource.get(nodeId) ?? []).map((edge) => edge.data.target));
    }
  };

  const allocateEdgeId = () => `edge-${nextEdgeId++}`;
  const getNextEdgeId = () => nextEdgeId;
  const setNextEdgeId = (value: number) => {
    nextEdgeId = value;
  };

  /** 在隔离 working document 上应用一个语义命令；异常只会丢弃本次 transaction。 */
  const reduceCommand = (
    { working, views, meta, referenceGraph }: TransactionContext,
    command: SemanticCommand
  ): void => {
    switch (command.type) {
      case 'addNode': {
        const parsedNode = StoreNodeItemTypeSchema.parse(command.node);
        if (getWorkingNode(parsedNode.nodeId, meta)) {
          throw getError('duplicate_node', `Node already exists: ${parsedNode.nodeId}`);
        }
        const { record, view } = splitNode(parsedNode, hasForbidDelete(command.node));
        validateNodePlacement({
          working,
          node: record,
          context: getContainerPlacementContext(record.data.parentNodeId, working, meta)
        });
        working.nodes = [...working.nodes, record];
        setStagedNodeView({ meta, views, nodeId: record.data.nodeId, view });
        updateReferenceGraphNode({ graph: referenceGraph, after: record.data });
        recordNodeChange({
          meta,
          nodeId: parsedNode.nodeId,
          after: record,
          afterIndex: working.nodes.length - 1
        });
        collectNodeFieldChanges({ changedFieldIds: meta.changedFieldIds, after: record.data });
        meta.structureChanged = true;
        return;
      }
      case 'replaceNode': {
        const parsedNode = StoreNodeItemTypeSchema.parse(command.node);
        const index = getWorkingNodeIndex({ working, nodeId: command.nodeId, meta });
        if (index < 0) throw getError('not_found', `Node not found: ${command.nodeId}`);
        if (parsedNode.nodeId !== command.nodeId) {
          throw getError('invalid_command', 'replaceNode cannot change nodeId');
        }
        if (parsedNode.parentNodeId !== working.nodes[index].data.parentNodeId) {
          throw getError('invalid_placement', 'Use attachToContainer to change node placement');
        }
        working.nodes = working.nodes.slice();
        const current = working.nodes[index];
        const { record: nextNode, view } = splitNode(
          parsedNode,
          current.forbidDelete === true || hasForbidDelete(command.node)
        );
        validateNodePlacement({
          working,
          node: nextNode,
          excludeNodeId: command.nodeId,
          context: getContainerPlacementContext(nextNode.data.parentNodeId, working, meta)
        });
        working.nodes[index] = nextNode;
        setStagedNodeView({ meta, views, nodeId: command.nodeId, view });
        commitNodeRecordUpdate({
          meta,
          referenceGraph,
          nodeId: command.nodeId,
          index,
          before: current,
          after: nextNode
        });
        return;
      }
      case 'updateNode': {
        const index = getWorkingNodeIndex({ working, nodeId: command.nodeId, meta });
        if (index < 0) throw getError('not_found', `Node not found: ${command.nodeId}`);
        const current = working.nodes[index];
        const currentView = getStagedNodeView(views, command.nodeId);
        working.nodes = working.nodes.slice();
        // patch 里的 position/isFolded 会被当前视图覆盖：几何只能走 commitGeometry。
        const nextData = StoreNodeItemTypeSchema.parse({
          ...cloneValue(current.data),
          ...cloneValue(command.patch),
          ...(currentView.position ? { position: currentView.position } : {}),
          ...(currentView.isFolded !== undefined ? { isFolded: currentView.isFolded } : {})
        });
        if (nextData.nodeId !== command.nodeId)
          throw getError('invalid_command', 'updateNode cannot change nodeId');
        if (nextData.parentNodeId !== current.data.parentNodeId) {
          throw getError('invalid_placement', 'Use attachToContainer to change node placement');
        }
        const stableData = {
          ...nextData,
          inputs: stripCanvasSizeInputs(reuseEqualItems(current.data.inputs, nextData.inputs)),
          outputs: reuseEqualItems(current.data.outputs, nextData.outputs)
        };
        const { position, isFolded, inputs: _inputs, outputs: _outputs, ...data } = stableData;
        working.nodes[index] = {
          data: { ...data, inputs: stableData.inputs, outputs: stableData.outputs },
          ...(current.forbidDelete ? { forbidDelete: true } : {})
        };
        const nextRecord = working.nodes[index];
        const updateReject = getPlacementError({
          working,
          node: nextRecord,
          parentId: nextData.parentNodeId,
          context: getContainerPlacementContext(nextData.parentNodeId, working, meta)
        });
        if (updateReject) {
          throw placementError(updateReject);
        }
        setStagedNodeView({
          meta,
          views,
          nodeId: command.nodeId,
          view: mergeNodeView({ current: currentView, position, isFolded })
        });
        commitNodeRecordUpdate({
          meta,
          referenceGraph,
          nodeId: command.nodeId,
          index,
          before: current,
          after: nextRecord
        });
        return;
      }
      case 'updateField': {
        const index = getWorkingNodeIndex({ working, nodeId: command.nodeId, meta });
        if (index < 0) throw getError('not_found', `Node not found: ${command.nodeId}`);
        const current = working.nodes[index];
        const inputIndex =
          command.kind !== 'output'
            ? current.data.inputs.findIndex((item) => item.key === command.fieldKey)
            : -1;
        const outputIndex =
          command.kind !== 'input'
            ? current.data.outputs.findIndex((item) => item.id === command.fieldKey)
            : -1;
        if (inputIndex < 0 && outputIndex < 0)
          throw getError('not_found', `Field not found: ${command.nodeId}.${command.fieldKey}`);
        const data = { ...current.data };
        if (inputIndex >= 0) {
          data.inputs = current.data.inputs.map((item, itemIndex) =>
            itemIndex === inputIndex ? { ...item, value: cloneValue(command.value) } : item
          );
        } else {
          data.outputs = current.data.outputs.map((item, itemIndex) =>
            itemIndex === outputIndex ? { ...item, value: cloneValue(command.value) } : item
          );
        }
        working.nodes = working.nodes.slice();
        working.nodes[index] = { ...current, data };
        commitNodeRecordUpdate({
          meta,
          referenceGraph,
          nodeId: command.nodeId,
          index,
          before: current,
          after: working.nodes[index]
        });
        return;
      }
      case 'removeNodes': {
        const rootIds = new Set(command.nodeIds);
        const missing = command.nodeIds.find((nodeId) => !getWorkingNode(nodeId, meta));
        if (missing) throw getError('not_found', `Node not found: ${missing}`);
        const descendantIds = getDescendantNodeIds(rootIds);
        const deletedIds = new Set([...rootIds, ...descendantIds]);
        validateNodeDeletion({ nodes: working.nodes, deletedIds });

        working.nodes.forEach((node, index) => {
          if (!deletedIds.has(node.data.nodeId)) return;
          updateReferenceGraphNode({ graph: referenceGraph, before: node.data });
          recordNodeChange({
            meta,
            nodeId: node.data.nodeId,
            before: node,
            afterIndex: index
          });
          collectNodeFieldChanges({
            changedFieldIds: meta.changedFieldIds,
            before: node.data
          });
        });
        deletedIds.forEach((nodeId) => deleteStagedNodeView({ meta, views, nodeId }));
        working.nodes = working.nodes.filter((node) => !deletedIds.has(node.data.nodeId));
        const removedEdges = working.edges.filter(
          (edge) => deletedIds.has(edge.data.source) || deletedIds.has(edge.data.target)
        );
        removedEdges.forEach((edge) => {
          recordEdgeChange({ meta, edge, kind: 'remove' });
        });
        working.edges = working.edges.filter(
          (edge) => !deletedIds.has(edge.data.source) && !deletedIds.has(edge.data.target)
        );
        meta.structureChanged = true;
        return;
      }
      case 'connectEdge': {
        const edge = StoreEdgeItemTypeSchema.parse(command.edge);
        if (!getWorkingNode(edge.source, meta) || !getWorkingNode(edge.target, meta)) {
          throw getError('invalid_edge', 'Cannot connect an edge to a missing node');
        }
        if (!isEdgeConnectionAllowed(working, edge, undefined, meta)) {
          throw getError('invalid_edge', 'Edge connection is not allowed');
        }
        if (working.edges.some(({ data }) => valuesEqual(data, edge))) {
          throw getError('invalid_edge', 'Identical edge already exists');
        }
        const edgeRecord = { id: allocateEdgeId(), data: cloneValue(edge) };
        working.edges = [...working.edges, edgeRecord];
        recordEdgeChange({ meta, edge: edgeRecord, kind: 'add' });
        meta.structureChanged = true;
        return;
      }
      case 'disconnectEdge': {
        let index = command.edgeId
          ? working.edges.findIndex((item) => item.id === command.edgeId)
          : command.index;
        if (index === undefined && command.edge) {
          const edge = StoreEdgeItemTypeSchema.parse(command.edge);
          index = working.edges.findIndex((item) => valuesEqual(item.data, edge));
        }
        if (index === undefined || index < 0 || index >= working.edges.length) {
          throw getError('not_found', 'Edge not found');
        }
        const edge = working.edges[index];
        working.edges = working.edges.slice();
        working.edges.splice(index, 1);
        recordEdgeChange({ meta, edge, kind: 'remove' });
        meta.structureChanged = true;
        return;
      }
      case 'attachToContainer': {
        const nodeIndex = getWorkingNodeIndex({ working, nodeId: command.nodeId, meta });
        if (nodeIndex < 0) throw getError('not_found', `Node not found: ${command.nodeId}`);
        const container = getWorkingNode(command.containerId, meta);
        if (!container) throw getError('not_found', `Node not found: ${command.containerId}`);

        const node = working.nodes[nodeIndex];
        if (node.data.parentNodeId !== undefined) {
          throw getError('invalid_placement', 'Only a top-level node can be attached');
        }
        if (!isNestedParentNodeType(container.data.flowNodeType)) {
          throw getError('invalid_placement', 'Attach target must be a container');
        }
        if (
          command.nodeId === command.containerId ||
          getDescendantNodeIds(new Set([command.nodeId])).has(command.containerId)
        ) {
          throw getError(
            'invalid_placement',
            'A node cannot be attached to itself or its descendant'
          );
        }
        const attachReject = getPlacementError({
          working,
          node,
          parentId: command.containerId,
          context: getContainerPlacementContext(command.containerId, working, meta)
        });
        if (attachReject) {
          throw placementError(attachReject);
        }

        const previouslyAllowedEdges = new Map(
          working.edges
            .filter(({ data }) => data.source === command.nodeId || data.target === command.nodeId)
            .map((edge) => [edge.id, isEdgeConnectionAllowed(working, edge.data, edge.id, meta)])
        );
        working.nodes = working.nodes.slice();
        const nextData = { ...node.data, parentNodeId: command.containerId };
        working.nodes[nodeIndex] = { ...node, data: nextData };
        recordNodeChange({
          meta,
          nodeId: command.nodeId,
          before: node,
          after: working.nodes[nodeIndex],
          afterIndex: nodeIndex
        });
        meta.structureChanged = true;

        const removedEdges = working.edges.filter(({ id, data }) => {
          if (!previouslyAllowedEdges.get(id)) return false;
          return !isEdgeConnectionAllowed(working, data, id, meta);
        });
        if (removedEdges.length > 0) {
          removedEdges.forEach((edge) => {
            recordEdgeChange({ meta, edge, kind: 'remove' });
          });
          working.edges = working.edges.filter(
            ({ id }) => !removedEdges.some((edge) => edge.id === id)
          );
        }
        return;
      }
      case 'updateChatConfig': {
        const nextChatConfig = AppChatConfigTypeSchema.parse(cloneValue(command.chatConfig));
        meta.chatConfigChanged = !valuesEqual(working.chatConfig, nextChatConfig);
        meta.chatConfigVariablesChanged = !valuesEqual(
          working.chatConfig.variables,
          nextChatConfig.variables
        );
        working.chatConfig = nextChatConfig;
        return;
      }
      case 'replaceDocument': {
        if (
          meta.changedNodeIds.size > 0 ||
          meta.nodeViewChanges.size > 0 ||
          meta.changedFieldIds.size > 0 ||
          meta.changedEdgeIds.size > 0 ||
          meta.chatConfigChanged ||
          meta.chatConfigVariablesChanged
        ) {
          throw getError(
            'invalid_command',
            'replaceDocument must be the only command in a transaction'
          );
        }
        const rebuilt = buildDocument(command.document, nextEdgeId);
        working.nodes = rebuilt.document.nodes;
        working.edges = rebuilt.document.edges;
        working.chatConfig = rebuilt.document.chatConfig;
        // 整文档替换自带一份快照；不能沿用替换前的，否则会把无关文档的历史元数据带进来。
        working.referenceSnapshots = rebuilt.document.referenceSnapshots;
        replaceStagedNodeViews({ meta, views, next: rebuilt.views });
        nextEdgeId = rebuilt.nextEdgeId;
        meta.kind = 'replace';
        meta.structureChanged = true;
        return;
      }
    }
  };

  /**
   * Persisted Derived Field 维护：容器子节点清单与容器数组输入的值类型由 Document 重算，
   * 作为普通字段参与变化记录与历史，渲染副作用不再写回文档。
   * 只在结构、chatConfig 或数组输入自身变化时执行，其余事务直接跳过，避免每次字段编辑全表扫描。
   */
  const applyDerivedFields = ({ working, meta, referenceGraph }: TransactionContext) => {
    const arrayInputChanged = [...meta.changedFieldIds.values()].some(
      (field) => field.kind === 'input' && isContainerArrayInputKey(field.key)
    );
    if (!meta.structureChanged && !meta.chatConfigChanged && !arrayInputChanged) return;

    const derived = applyPersistedDerivedFields({
      nodes: working.nodes,
      chatConfig: working.chatConfig
    });
    if (derived.changes.length === 0) return;
    working.nodes = derived.nodes;
    derived.changes.forEach(({ index, before, after }) => {
      updateReferenceGraphNode({ graph: referenceGraph, before: before.data, after: after.data });
      recordNodeChange({ meta, nodeId: after.data.nodeId, before, after, afterIndex: index });
      collectNodeFieldChanges({
        changedFieldIds: meta.changedFieldIds,
        before: before.data,
        after: after.data
      });
    });
  };

  const clear = () => {
    nodeIndex.clear();
    graphIndex.bySource.clear();
    graphIndex.byTarget.clear();
    graphIndex.parentByChild.clear();
    graphIndex.childrenByParent.clear();
    graphIndex.edgeById.clear();
    incomingEdgesCache.clear();
    childNodeIdsCache.clear();
    workflowStartIds.clear();
    document = { nodes: [], edges: [], chatConfig: {}, referenceSnapshots: [] };
  };

  rebuildGraphIndex();
  rebuildWorkflowStartIds();

  return {
    getDocument,
    setDocument,
    getNodeIndex,
    getGraphIndex,
    getGraphQueries,
    getNodeById,
    getWorkingNodeIndex,
    isSourceEdgeValid,
    rebuildNodeIndex,
    rebuildGraphIndex,
    updateNodeIndexIncrementally,
    updateGraphIndexIncrementally,
    updateWorkflowStartIndex,
    rebuildWorkflowStartIds,
    getNextEdgeId,
    setNextEdgeId,
    getPlacementContext,
    reduceCommand,
    applyWorkflowStartAutoFill,
    applyDerivedFields,
    addAffectedStructure,
    clear
  };
};
