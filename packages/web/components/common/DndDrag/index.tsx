import { Box, Tbody } from '@chakra-ui/react';
import React, { type ReactElement, type ReactNode, useState } from 'react';
import {
  DragDropContext,
  Droppable,
  type DraggableChildrenFn,
  type DragStart,
  type DropResult,
  type DroppableProvided,
  type DroppableStateSnapshot
} from 'react-beautiful-dnd';
export * from 'react-beautiful-dnd';

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
