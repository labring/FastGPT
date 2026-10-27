import { Box } from '@chakra-ui/react';
import React, { type ReactElement, useState } from 'react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableChildrenFn,
  type DraggableProvided,
  type DraggableStateSnapshot,
  type DragStart,
  type DropResult,
  type DroppableProvided,
  type DroppableStateSnapshot,
  type Omit
} from 'react-beautiful-dnd';

export { Draggable };
export type {
  DraggableChildrenFn,
  DraggableProvided,
  DraggableStateSnapshot,
  DragStart,
  DropResult,
  DroppableProvided,
  DroppableStateSnapshot,
  Omit
};

/**
 * 将 react-beautiful-dnd 的 render-props 对象转换为可直接透传给元素的属性。
 * 适配层避免 React Hooks lint 将第三方对象中的 innerRef 误判为组件渲染期间读取 ref。
 */
export const getDraggableItemProps = (
  provided: DraggableProvided,
  snapshot: DraggableStateSnapshot
) => {
  const { innerRef, draggableProps, dragHandleProps } = provided;

  return {
    draggableItemProps: {
      ref: innerRef,
      ...draggableProps,
      style: {
        ...draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }
    },
    dragHandleProps
  };
};

type Props<T = any> = {
  onDragEndCb: (result: T[]) => void;
  /** 克隆替换原始拖拽项之前，保存依赖原始 DOM 的布局信息。 */
  onBeforeCapture?: (capture: { draggableId: string }) => void;
  /** 成功、取消或移出列表时均调用，供调用方释放拖拽状态。 */
  onDragEnd?: () => void;
  renderClone?: DraggableChildrenFn;
  children: ({
    provided,
    snapshot
  }: {
    provided: DroppableProvided;
    snapshot: DroppableStateSnapshot;
  }) => ReactElement;
  dataList: T[];
  zoom?: number;
  renderInnerPlaceholder?: boolean;
};

function DndDrag<T>({
  children,
  renderClone,
  onDragEndCb,
  onBeforeCapture,
  onDragEnd,
  dataList,
  zoom = 1,
  renderInnerPlaceholder = true
}: Props<T>) {
  const [draggingItemHeight, setDraggingItemHeight] = useState(0);

  const onDragStart = (start: DragStart) => {
    const draggingNode = document.querySelector(`[data-rbd-draggable-id="${start.draggableId}"]`);
    setDraggingItemHeight(draggingNode?.getBoundingClientRect().height || 0);
  };

  const handleDragEnd = (result: DropResult) => {
    setDraggingItemHeight(0);
    onDragEnd?.();
    if (!result.destination) {
      return;
    }

    const startIndex = result.source.index;
    const endIndex = result.destination.index;

    const list = Array.from(dataList);
    const [removed] = list.splice(startIndex, 1);
    list.splice(endIndex, 0, removed);

    onDragEndCb(list);
  };

  return (
    <DragDropContext
      onBeforeCapture={onBeforeCapture}
      onDragStart={onDragStart}
      onDragEnd={handleDragEnd}
    >
      <Droppable droppableId="droppable" renderClone={renderClone}>
        {(provided, snapshot) => (
          <>
            {children({ provided, snapshot })}
            {snapshot.isDraggingOver && renderInnerPlaceholder && (
              <Box height={`${draggingItemHeight / zoom}px`} />
            )}
          </>
        )}
      </Droppable>
    </DragDropContext>
  );
}

export default React.memo(DndDrag) as <T>(props: Props<T>) => React.ReactElement;
