import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useStoreApi, useUpdateNodeInternals } from 'reactflow';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';

type DraggingHandle = {
  nodeElement: HTMLElement;
  handleId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * 排序库将原始行替换为画布外的克隆时，在原节点保留同 ID 的隐藏端口。
 * 仅在拖拽开始读取一次坐标；结束或取消后交还给真实行，并显式刷新最终布局。
 */
export const useNodeHandleDrag = (nodeId: string) => {
  const store = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  const [draggingHandle, setDraggingHandle] = useState<DraggingHandle>();

  const onBeforeCapture = useCallback(
    ({ draggableId }: { draggableId: string }) => {
      const { domNode, transform } = store.getState();
      const nodeElement = Array.from(
        domNode?.querySelectorAll<HTMLElement>('.react-flow__node') ?? []
      ).find((element) => element.dataset.id === nodeId);
      const handleId = getHandleId(nodeId, 'source', draggableId);
      const handle = Array.from(
        nodeElement?.querySelectorAll<HTMLElement>('.react-flow__handle.source') ?? []
      ).find((element) => element.dataset.handleid === handleId);
      if (!nodeElement || !handle) return;

      const nodeRect = nodeElement.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const zoom = transform[2];
      setDraggingHandle({
        nodeElement,
        handleId,
        left: (handleRect.left - nodeRect.left) / zoom,
        top: (handleRect.top - nodeRect.top) / zoom,
        width: handleRect.width / zoom,
        height: handleRect.height / zoom
      });
    },
    [nodeId, store]
  );

  const onDragEnd = useCallback(() => {
    setDraggingHandle(undefined);
    updateNodeInternals(nodeId);
  }, [nodeId, updateNodeInternals]);

  return {
    onBeforeCapture,
    onDragEnd,
    draggingHandle: draggingHandle
      ? createPortal(
          <Handle
            id={draggingHandle.handleId}
            type="source"
            position={Position.Right}
            isConnectable={false}
            style={{
              left: draggingHandle.left,
              top: draggingHandle.top,
              right: 'auto',
              width: draggingHandle.width,
              height: draggingHandle.height,
              transform: 'none',
              visibility: 'hidden',
              pointerEvents: 'none'
            }}
          />,
          draggingHandle.nodeElement
        )
      : null
  };
};
