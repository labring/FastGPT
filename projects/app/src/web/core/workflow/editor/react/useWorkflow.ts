import { useSyncExternalStore } from 'react';
import type { WorkflowGraphQueries } from '@fastgpt/global/core/workflow/editor/types';
import type {
  WorkflowActionsHandle,
  WorkflowStructureHandle,
  WorkflowStructureSnapshot
} from './workflowEditorAdapter';
import { useWorkflowEditorAdapter } from './workflowEditorProvider';

/** 读取稳定的节点 identity/parent identity 与 edge 结构。 */
export const useWorkflow = (): WorkflowStructureHandle => {
  const adapter = useWorkflowEditorAdapter();
  return useSyncExternalStore(
    adapter.subscribeWorkflow,
    adapter.getWorkflowSnapshot,
    adapter.getWorkflowSnapshot
  );
};

/**
 * 稳定的 workflow 写能力句柄：结构句柄里的 command 部分，加上批量 geometry 提交与两个非订阅 getter。
 *
 * 订阅什么：什么都不订阅。返回的对象身份在 adapter 生命周期内恒定，结构变更、节点写入、
 * 字段提交与几何提交都不会让使用它的组件重渲染。
 * 什么时候重渲染：只有 Provider 换 runtime（adapter 重建）时。
 *
 * 与 handle hook 的分工：
 * - 渲染期要读 nodes/edges → `useWorkflow()`（整份结构句柄）或 `useWorkflowValue(selector)`（派生值）；
 * - 渲染期要读单节点/单字段 → `useNode` / `useField` / `useNodeValue` / `useFieldValue`；
 * - 只在事件回调里写文档 → 本句柄的 command；
 * - 只在事件回调里读当前值 → `getWorkflowSnapshot()` / `getEdges()`。这两个 getter 拿到的是
 *   点击瞬间的文档值，比渲染期快照更准（用户可能在渲染后又连了线再点删除）。
 *
 * 典型误用：在渲染期用 `getEdges()` / `getWorkflowSnapshot()` 的结果参与渲染计算。
 * 渲染期读取必须走订阅，否则文档变化后组件不会重渲染，画面与文档不一致。
 */
export const useWorkflowActions = (): WorkflowActionsHandle => {
  const adapter = useWorkflowEditorAdapter();
  return adapter.getWorkflowActions();
};

/**
 * 从结构快照派生一个值，只在派生结果变化时重渲染。
 *
 * 订阅什么：workflow 结构通道，与 `useWorkflow()` 是同一条订阅（结构变化、整文档 replace，
 * 以及 Runtime 标记 `affectedRecords.structure` 的变更）。节点内部字段写入、几何提交与
 * issue 刷新不通知这条通道。
 * 什么时候重渲染：通知到达后 selector 的返回值与上一次不满足 `Object.is` 时。
 * 原始值天然 bail out；store 内部持有的稳定引用（例如 `structure.edges`）也可以，
 * 因为它们的身份随结构版本变化。
 *
 * selector 约束：
 * 1. 每次通知都会跑，必须便宜。凡是「扫全量边/节点才能算出来」的判定走第二参的图查询，
 *    不要在 selector 里自己扫，否则只是把重渲染换成重计算。
 * 2. 只能返回原始值或稳定引用，**不能返回新建的对象/数组**。比较固定用 `Object.is`，
 *    没有深比较，也不提供 `isEqual` 入参（这是刻意的：深比较兜底会废掉「只取真正需要的信息」）。
 * 3. 第二参是 Runtime 图查询对象（`isMountedTool` / `isHandleConnected` / `getIncomingEdges` /
 *    `getChildNodeIds`），身份在 runtime 生命周期内不变，可以直接当 memo 依赖；
 *    它的集合返回值在同一结构版本内身份稳定，也可以直接当 selector 的返回值。
 *
 * 典型误用（`getSnapshot` 不能每次返回新对象，React 会无限重渲染并报
 * "The result of getSnapshot should be cached to avoid an infinite loop"）：
 *
 * ```ts
 * // ❌ 每次调用都新建数组，Object.is 永远判为变化
 * const ids = useWorkflowValue((structure) => structure.nodes.map((node) => node.nodeId));
 * // ❌ 每次调用都新建对象
 * const stat = useWorkflowValue((structure) => ({ count: structure.nodes.length }));
 *
 * // ✅ 返回原始值
 * const count = useWorkflowValue((structure) => structure.nodes.length);
 * const hasLoop = useWorkflowValue((structure) =>
 *   structure.nodes.some((node) => node.parentNodeId === loopId)
 * );
 * // ✅ 返回 store 内部持有的稳定引用
 * const edges = useWorkflowValue((structure) => structure.edges);
 * // ✅ 「扫全量边才能算出来」的判定走图查询，O(度) 而不是 O(E)
 * const connected = useWorkflowValue((_structure, graph) =>
 *   graph.isHandleConnected({ nodeId, handleId, direction: 'source' })
 * );
 * ```
 *
 * 需要列表内容而不是判定时，用 `useWorkflow()` 拿整份结构句柄，不要在 selector 里拷数组。
 */
export const useWorkflowValue = <T>(
  selector: (structure: WorkflowStructureSnapshot, graph: WorkflowGraphQueries) => T
): T => {
  const adapter = useWorkflowEditorAdapter();
  const getSnapshot = () => selector(adapter.getStructureSnapshot(), adapter.getGraphQueries());
  return useSyncExternalStore(adapter.subscribeWorkflow, getSnapshot, getSnapshot);
};
