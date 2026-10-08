import { useMemo } from 'react';
import type { PlacementRequest } from '@fastgpt/global/core/workflow/editor/types';
import type { NodeTemplateContext } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowCanvasHandle } from './workflowEditorAdapter';
import { useWorkflowEditorAdapter } from './workflowEditorProvider';
import { useWorkflow } from './useWorkflow';

/** 仅提供批量 geometry commit，不向 UI 暴露 runtime 或 generic dispatch。 */
export const useCanvas = (): WorkflowCanvasHandle => {
  const adapter = useWorkflowEditorAdapter();
  return adapter.getCanvasHandle();
};

/**
 * 读取当前文档下的 placement context：侧边栏、handle 快捷添加、模板落点与连线校验共用。
 * host 不再从画布数组重建 nodes/edges map，也不自己跑一遍容器校验。
 *
 * useWorkflow 只作为订阅触发器（结构或节点类型变化才重渲染），memo key 用文档内容版本。
 * 几何提交同样会 bump contentRevision，所以拖拽落点后会重算一次 context；issue 刷新不会。
 */
export const usePlacementContext = ({
  node,
  isSidebar
}: PlacementRequest): NodeTemplateContext | null => {
  const adapter = useWorkflowEditorAdapter();
  useWorkflow();
  const sourceNodeId = node?.nodeId;
  const sourceHandleId = node?.handleId ?? null;
  const documentVersion = adapter.getDocumentVersion();

  return useMemo(
    () =>
      adapter.getPlacementContext({
        node: sourceNodeId ? { nodeId: sourceNodeId, handleId: sourceHandleId } : undefined,
        isSidebar
      }),
    // documentVersion 是刻意的 memo key：context 由 runtime 内部索引派生，闭包里不读它。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter, documentVersion, sourceNodeId, sourceHandleId, isSidebar]
  );
};
