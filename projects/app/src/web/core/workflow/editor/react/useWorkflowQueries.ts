import { useMemo, useSyncExternalStore } from 'react';
import type {
  PlacementRequest,
  WorkflowReferenceOptionsQuery,
  WorkflowReferenceOption
} from '@fastgpt/global/core/workflow/editor/types';
import type { NodeTemplateContext } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowCanvasHandle } from './workflowEditorAdapter';
import { useWorkflowEditorAdapter } from './workflowEditorProvider';
import { useWorkflow } from './useWorkflow';

type Listener = () => void;

/** 仅提供批量 geometry commit，不向 UI 暴露 runtime 或 generic dispatch。 */
export const useCanvas = (): WorkflowCanvasHandle => {
  const adapter = useWorkflowEditorAdapter();
  return adapter.getCanvasHandle();
};

/** 订阅 Runtime 的引用候选项；字段外嵌套值与普通 input 共用 Reference module。 */
export const useReferenceOptions = (
  query: WorkflowReferenceOptionsQuery
): readonly WorkflowReferenceOption[] => {
  const adapter = useWorkflowEditorAdapter();
  const stableQuery = useMemo(
    () => ({
      nodeId: query.nodeId,
      ...(query.valueType !== undefined ? { valueType: query.valueType } : {}),
      ...(query.includeChildren ? { includeChildren: true } : {})
    }),
    [query.includeChildren, query.nodeId, query.valueType]
  );
  const subscribe = useMemo(
    () => (listener: Listener) => adapter.subscribeReferenceOptions(listener),
    [adapter]
  );
  const getSnapshot = useMemo(
    () => () => adapter.getReferenceOptions(stableQuery),
    [adapter, stableQuery]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * 读取当前文档下的 placement context：侧边栏、handle 快捷添加、模板落点与连线校验共用。
 * host 不再从画布数组重建 nodes/edges map，也不自己跑一遍容器校验。
 *
 * useWorkflow 只作为订阅触发器：结构或节点类型变化才重渲染；几何与 issue 刷新不影响
 * placement 规则，因此不会触发无效重算。
 */
export const usePlacementContext = ({
  node,
  isSidebar
}: PlacementRequest): NodeTemplateContext | null => {
  const adapter = useWorkflowEditorAdapter();
  const structure = useWorkflow((snapshot) => snapshot);
  const sourceNodeId = node?.nodeId;
  const sourceHandleId = node?.handleId ?? null;

  return useMemo(
    () =>
      adapter.getPlacementContext({
        node: sourceNodeId ? { nodeId: sourceNodeId, handleId: sourceHandleId } : undefined,
        isSidebar
      }),
    // structure 是刻意的 memo key：节点类型或 outputs 变化时，快照字段可能保持不变。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter, isSidebar, sourceHandleId, sourceNodeId, structure]
  );
};
