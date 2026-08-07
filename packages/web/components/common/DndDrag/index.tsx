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
  renderClone?: DraggableChildrenFn;
  children: ({
    provided,
    snapshot
  }: {
    provided: DroppableProvided;
    snapshot: DroppableStateSnapshot;
  }) => ReactElement<HTMLElement, string>;
  dataList: T[];
  zoom?: number;
  renderInnerPlaceholder?: boolean;
};

function DndDrag<T>({
  children,
  renderClone,
  onDragEndCb,
  dataList,
  zoom = 1,
  renderInnerPlaceholder = true
}: Props<T>) {
  const [draggingItemHeight, setDraggingItemHeight] = useState(0);

  const onDragStart = (start: DragStart) => {
    const draggingNode = document.querySelector(`[data-rbd-draggable-id="${start.draggableId}"]`);
    setDraggingItemHeight(draggingNode?.getBoundingClientRect().height || 0);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }
    setDraggingItemHeight(0);

    const startIndex = result.source.index;
    const endIndex = result.destination.index;

    const list = Array.from(dataList);
    const [removed] = list.splice(startIndex, 1);
    list.splice(endIndex, 0, removed);

    onDragEndCb(list);
  };

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
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
