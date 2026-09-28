import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useContextSelector } from 'use-context-selector';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type {
  WorkflowChange,
  WorkflowGraphQueries,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import { useWorkflowValue } from '@/web/core/workflow/editor';
import { useWorkflowSnapshot, WorkflowHostContext } from '@/web/core/workflow/editor/host';
import { getNodeAllSourceIds } from '@/web/core/workflow/utils';

/**
 * 读取最新文档快照的稳定入口：不订阅工作流数据 Context，也不订阅任何计数器，
 * 因此文档变化不会让调用方重渲染。供「打开时一次性计算」的场景（引用选择器）使用。
 */
export const useWorkflowSnapshotGetter = () => {
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);

  return useCallback(
    () => (runtime && !runtime.isDisposed() ? runtime.getWorkflow() : undefined),
    [runtime]
  );
};

/**
 * Runtime 图查询对象：按已提交的图索引查容器子节点与连线，避免 app 侧重复维护节点和子节点索引。
 *
 * 非订阅读取：对象身份在 runtime 生命周期内不变，可直接当 memo 依赖；
 * 重算时机由调用方的语义快照（`useWorkflowDocument().workflow`）或 `useWorkflowValue` 决定。
 */
export const useGraphQueries = (): WorkflowGraphQueries | undefined => {
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);

  return useMemo(() => runtime?.getGraphQueries(), [runtime]);
};

/**
 * 稳定的「按 id 取文档节点」函数：getRefData / getEditorVariables 等纯函数只接受 getNodeById 入参，
 * 这里走 port 的 getNode 并收敛成恒定签名，避免每个调用点各写一遍兜底并让 memo 依赖失效。
 *
 * 非订阅读取，读到的永远是当前值；只读快照与纯函数入参只差 readonly 修饰，
 * 桥接统一在这里做一次，纯函数签名不动。
 */
export const useDocumentGetNodeById = () => {
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);

  return useCallback(
    (nodeId: string | null | undefined) =>
      nodeId && runtime && !runtime.isDisposed()
        ? (runtime.getNode(nodeId) as unknown as FlowNodeItemType | undefined)
        : undefined,
    [runtime]
  );
};

/**
 * 常驻派生列表（变量列表、编辑器变量、可用引用）的读取入口。
 *
 * `workflow` 是语义通道的快照身份，也是派生计算唯一的缓存 key：Runtime 只在语义版本变化时
 * 更换它，纯几何提交、overlay 写入与标红焦点都不换，所以拖拽落点、写 debug 结果与搜索高亮
 * 都不会让派生列表重算。用快照对象本身而不是计数器当 key 是安全的——同一语义版本内
 * getWorkflow() 返回同一个缓存对象，不存在「两个版本共用一份派生」的可能。
 *
 * `getNodeById` 与 `graph` 都是稳定引用（只随 runtime 变）且读当前值，
 * 因此它们进 memo 依赖不会造成额外重算，重算时机完全由 `workflow` 决定。
 */
export const useWorkflowDocument = () => {
  const workflow = useWorkflowSnapshot();
  const getNodeById = useDocumentGetNodeById();
  const graph = useGraphQueries();

  return { workflow, getNodeById, graph };
};

type UpstreamRevisionStore = {
  subscribe: (listener: () => void) => () => void;
  getRevision: () => number;
};

/**
 * 建一个「本节点来源闭包」的失效计数器。
 *
 * 为什么不用 `runtime.getWorkflow()` 的快照身份：它按 semanticVersion 换，单字段提交也 bump，
 * 于是任意一笔写入都会让所有语义派生列表重算 + 重渲染（N 节点 × M 字段 × O(V+E) 上游遍历）。
 * 这里改成吃 Runtime 已经算好的精确变更记录（`changedRecords`）：只有变更命中本节点、
 * 上游来源闭包或祖先容器链，以及 chatConfig / 结构变化时才 bump。
 *
 * 命中判定按派生列表真正读到的东西收：
 * - 本节点与祖先容器链（`ownNodes`）参与列表的是 canEdit 输入与容器 reference 输入，
 *   所以它们的**任何**变更都算命中；
 * - 其余上游节点只贡献 name / avatar / catchError / outputs，纯输入值写入（`updateField`
 *   与只改 inputs 的 `updateNode`）与列表无关，不算命中——这一条才是「打字不刷新下游」的关键；
 * - `affectedRecords` 整个不参与判定：它是「引用状态需要重算」的下游集合，节点记录本身没变，
 *   字段引用状态由 `useField` 那条通道自己投递。
 *
 * 稳态成本：无关提交通知到达时只做 O(变更条数) 的集合查询；来源闭包只在命中后作废重算，
 * 结构变化时同样作废（闭包本身可能已经不同）。保守方向只会多算不会漏算。
 */
const createUpstreamRevisionStore = ({
  runtime,
  nodeId,
  includeChildren
}: {
  runtime: WorkflowRuntimePort | null;
  nodeId: string;
  includeChildren?: boolean;
}): UpstreamRevisionStore => {
  const listeners = new Set<() => void>();
  let revision = 0;
  /** 来源闭包（含本节点）；undefined 表示待重算。 */
  let sourceNodes: Set<string> | undefined;
  /** 本节点 + 祖先容器链：这些节点的输入值也参与派生，任何变更都算命中。 */
  let ownNodes: Set<string> | undefined;
  let unsubscribeRuntime: (() => void) | undefined;

  const readNode = (id: string | null | undefined) =>
    id && runtime && !runtime.isDisposed()
      ? (runtime.getNode(id) as unknown as FlowNodeItemType | undefined)
      : undefined;

  const computeNodeSets = () => {
    const sources = new Set<string>([nodeId]);
    const own = new Set<string>([nodeId]);
    if (!runtime || runtime.isDisposed()) return { sources, own };
    const graph = runtime.getGraphQueries();
    getNodeAllSourceIds({
      nodeId,
      getNodeById: readNode,
      edges: runtime.getWorkflow().edges,
      includeChildren,
      getChildNodeIds: graph.getChildNodeIds,
      getIncomingEdges: graph.getIncomingEdges
    }).forEach((id) => sources.add(id));
    // 祖先容器链单独收：容器的 reference 输入会往闭包里追加来源，但容器本身不一定在闭包内。
    const visited = new Set<string>([nodeId]);
    let parentId = readNode(nodeId)?.parentNodeId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      sources.add(parentId);
      own.add(parentId);
      parentId = readNode(parentId)?.parentNodeId;
    }
    return { sources, own };
  };

  const ensureNodeSets = () => {
    if (!sourceNodes || !ownNodes) {
      const sets = computeNodeSets();
      sourceNodes = sets.sources;
      ownNodes = sets.own;
    }
    return { sources: sourceNodes, own: ownNodes };
  };

  const onChange = (change: WorkflowChange) => {
    // 几何提交不进语义快照，派生列表与它无关。
    if (change.kind === 'geometry') return;
    const structureChanged = change.kind === 'replace' || change.affectedRecords.structure;
    let hit = structureChanged || change.changedRecords.chatConfigVariablesChanged;
    if (!hit) {
      const { sources, own } = ensureNodeSets();
      const fieldIds = change.changedRecords.fieldIds;
      const changedIds = new Set([
        ...change.changedRecords.nodeIds,
        ...fieldIds.map((field) => field.nodeId)
      ]);
      hit = [...changedIds].some((id) => {
        if (own.has(id)) return true;
        if (!sources.has(id)) return false;
        // 上游节点：没有任何字段级记录说明是记录级变更（改名、换头像、改 catchError 等），
        // 有记录但全是 input 才是「与派生列表无关的纯输入值写入」。
        const fields = fieldIds.filter((field) => field.nodeId === id);
        return fields.length === 0 || fields.some((field) => field.kind !== 'input');
      });
    }
    if (!hit) return;
    sourceNodes = undefined;
    ownNodes = undefined;
    revision += 1;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      // runtime 订阅按 listener 数量引用计数：StrictMode 的双挂载不能让它 bump 两次。
      if (!unsubscribeRuntime && runtime && !runtime.isDisposed()) {
        unsubscribeRuntime = runtime.subscribe(onChange);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribeRuntime?.();
          unsubscribeRuntime = undefined;
        }
      };
    },
    getRevision: () => revision
  };
};

/**
 * 节点作用域的语义派生读取入口：形状与 `useWorkflowDocument` 相同，可以直接替换，
 * 但 `workflow` 只在「本节点或其上游来源闭包」真的变化时才换身份。
 *
 * 适用面：`getEditorVariables` / `getReferenceList` 这类只读本节点 + 上游 name/outputs +
 * chatConfig 的常驻派生列表。读全量节点（例如按 flowNodeType 找流程开始节点）的场景不要用它，
 * 那些消费点的相关集合是整份文档，窄化没有意义。
 *
 * `includeChildren` 与 `getNodeAllSource` 同名参数一致：容器节点要把子工作流的输出算进来源时传 true。
 */
export const useNodeWorkflowDocument = ({
  nodeId,
  includeChildren
}: {
  nodeId: string;
  includeChildren?: boolean;
}) => {
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);
  const store = useMemo(
    () => createUpstreamRevisionStore({ runtime, nodeId, includeChildren }),
    [runtime, nodeId, includeChildren]
  );
  const revision = useSyncExternalStore(store.subscribe, store.getRevision, store.getRevision);

  const getWorkflow = useWorkflowSnapshotGetter();
  const getNodeById = useDocumentGetNodeById();
  const graph = useGraphQueries();
  // revision 是唯一的失效信号：无关字段提交不 bump，memo 直接命中缓存，
  // 派生列表既不重算也不带动子树重渲染。
  // revision 是刻意的 memo key：闭包里不读它，只借身份变化触发作废。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const workflow = useMemo(() => getWorkflow(), [revision, getWorkflow]);

  return { workflow, getNodeById, graph };
};

/**
 * 当前节点是否被 Agent 当作工具引用：按结构快照里指向该节点的 selectedTools 入边判定。
 *
 * 判定走 Runtime 图查询（`isMountedTool` 读 byTarget 索引，O(入度)），selector 只返回 boolean，
 * 所以别处连线/断线不会让每个调用它的节点组件重渲染；字段编辑与几何提交本来就不通知结构通道。
 */
export const useIsToolNode = (nodeId: string) =>
  useWorkflowValue((_structure, graph) => graph.isMountedTool(nodeId));
