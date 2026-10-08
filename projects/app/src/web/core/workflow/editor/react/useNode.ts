import { useMemo, useSyncExternalStore } from 'react';
import type { WorkflowNodeActions, WorkflowNodeHandle } from './workflowEditorAdapter';
import { useWorkflowEditorAdapter } from './workflowEditorProvider';

type Listener = () => void;

/** 读取单节点的 Node Data、Node View State，并提供稳定的 fold action。 */
export const useNode = (nodeId: string): WorkflowNodeHandle | undefined => {
  const adapter = useWorkflowEditorAdapter();
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeNode(nodeId, listener),
    [adapter, nodeId]
  );
  const getSnapshot = useMemo(() => () => adapter.getNodeSnapshot(nodeId), [adapter, nodeId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** 只读取节点写能力，不订阅节点数据；字段叶子用于结构编辑按钮。 */
export const useNodeActions = (nodeId: string): WorkflowNodeActions | undefined => {
  const adapter = useWorkflowEditorAdapter();
  return useMemo(() => adapter.getNodeActions(nodeId), [adapter, nodeId]);
};

/**
 * 从单节点的 scoped 快照派生一个值，只在该节点变化且派生结果变化时重渲染。
 *
 * 订阅什么：`nodeId` 这一个节点的数据通道与视图通道（语义写入、issue 刷新、几何提交、
 * 整文档 replace）。其它节点的任何变更都不通知。
 * 什么时候重渲染：该节点被通知后，selector 返回值与上一次不满足 `Object.is` 时。
 * 只关心语义数据的 selector（例如取 `data.name`）在纯几何提交时不会重渲染。
 *
 * selector 入参是 `WorkflowNodeHandle | undefined`：节点被删除或从未存在时为 `undefined`，
 * selector 必须容忍（用 `?.` 与默认值），不要用 `!` 断言，也不要指望运行时报错。
 * 返回值约束与 `useWorkflowValue` 相同：原始值或稳定引用，不能新建对象。
 *
 * 与 `useNode` 的分工：需要 `setName` / `setFolded` / `updateNode` 这些 action，
 * 或需要把整份 `data` / `view` 交给下游组件时用 `useNode`；只要一个派生的原始值时用本 hook。
 */
export const useNodeValue = <T>(
  nodeId: string,
  selector: (node: WorkflowNodeHandle | undefined) => T
): T => {
  const adapter = useWorkflowEditorAdapter();
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeNode(nodeId, listener),
    [adapter, nodeId]
  );
  const getSnapshot = () => selector(adapter.getNodeSnapshot(nodeId));
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
