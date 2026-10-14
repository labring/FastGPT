import { useMemo, useSyncExternalStore } from 'react';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';
import type { WorkflowNodeActions, WorkflowNodeHandle } from './workflowEditorAdapter';
import { useWorkflowEditorAdapter } from './workflowEditorProvider';

type Listener = () => void;
type NodeSelector<T> = (node: WorkflowNodeHandle | undefined) => T;
type TypedNodeSelector<T> = (node: WorkflowNodeHandle | undefined) => DeepReadonly<T> | undefined;
type RawMode = { raw: true };
type NodeHandleWithData<TData> = Omit<WorkflowNodeHandle, 'data'> & { data: TData };

/** 订阅单节点并返回所选值；完整句柄仅用于确需同时访问 data、view 与写 action 的场景。 */
export function useNode<T>(nodeId: string, selector: NodeSelector<T>): T;
/** 显式泛型仅在编译期匹配消费方类型；selector 仍接收只读 Runtime snapshot。 */
export function useNode<T>(nodeId: string, selector: TypedNodeSelector<T>): T | undefined;
/** Raw 逃生口；TData 由调用方声明，运行时不校验 nodeId 对应形状。 */
export function useNode<TData = WorkflowNodeHandle['data']>(
  nodeId: string,
  options: RawMode
): NodeHandleWithData<TData> | undefined;
export function useNode(
  nodeId: string,
  selectorOrOptions: NodeSelector<unknown> | RawMode
): unknown {
  const adapter = useWorkflowEditorAdapter();
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeNode(nodeId, listener),
    [adapter, nodeId]
  );
  const getSnapshot = () => {
    const node = adapter.getNodeSnapshot(nodeId);
    return typeof selectorOrOptions === 'function' ? selectorOrOptions(node) : node;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 只读取节点写能力，不订阅节点数据；字段叶子用于结构编辑按钮。 */
export const useNodeActions = (nodeId: string): WorkflowNodeActions | undefined => {
  const adapter = useWorkflowEditorAdapter();
  return useMemo(() => adapter.getNodeActions(nodeId), [adapter, nodeId]);
};
