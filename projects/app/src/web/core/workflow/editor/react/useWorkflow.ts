import { useSyncExternalStore } from 'react';
import type { WorkflowGraphQueries } from '@fastgpt/global/core/workflow/editor/types';
import type {
  WorkflowActionsHandle,
  WorkflowStructureHandle,
  WorkflowStructureSnapshot
} from './workflowEditorAdapter';
import { useWorkflowEditorAdapter } from './workflowEditorProvider';

type WorkflowSelector<T> = (structure: WorkflowStructureSnapshot, graph: WorkflowGraphQueries) => T;
type RawMode = { raw: true };

/** 订阅 workflow 结构并返回所选值；完整结构句柄仅用于需要结构和写命令的场景。 */
export function useWorkflow<T>(selector: WorkflowSelector<T>): T;
export function useWorkflow(options: RawMode): WorkflowStructureHandle;
export function useWorkflow<T>(
  selectorOrOptions: WorkflowSelector<T> | RawMode
): T | WorkflowStructureHandle {
  const adapter = useWorkflowEditorAdapter();
  const getSnapshot = () =>
    typeof selectorOrOptions === 'function'
      ? selectorOrOptions(adapter.getStructureSnapshot(), adapter.getGraphQueries())
      : adapter.getWorkflowSnapshot();
  return useSyncExternalStore(adapter.subscribeWorkflow, getSnapshot, getSnapshot);
}

/**
 * 稳定的 workflow 写能力句柄：结构句柄里的 command 部分，加上批量 geometry 提交与两个非订阅 getter。
 *
 * 订阅什么：什么都不订阅。返回的对象身份在 adapter 生命周期内恒定，结构变更、节点写入、
 * 字段提交与几何提交都不会让使用它的组件重渲染。
 * 什么时候重渲染：只有 Provider 换 runtime（adapter 重建）时。
 *
 * 与 handle hook 的分工：
 * - 渲染期要读结构 → `useWorkflow(selector)`；需要整份结构句柄时显式传 `{ raw: true }`；
 * - 渲染期要读单节点/单字段 → `useNode(selector)` / `useField(selector)`；
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
