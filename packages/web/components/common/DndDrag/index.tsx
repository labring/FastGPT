import { Box } from '@chakra-ui/react';
import React, { useState } from 'react';
import {
  DragDropContext,
  DroppableProps,
  Droppable,
  DraggableChildrenFn,
  DragStart,
  DropResult
} from 'react-beautiful-dnd';
export * from 'react-beautiful-dnd';

type Props<T = any> = {
  onDragEndCb: (result: T[]) => void;
  renderClone?: DraggableChildrenFn;
  children: DroppableProps['children'];
  dataList: T[];
};

function DndDrag<T>({ children, renderClone, onDragEndCb, dataList }: Props<T>) {
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
        {(provided, snapshot) => {
          return (
            <Box {...provided.droppableProps} ref={provided.innerRef}>
              {children(provided, snapshot)}
              {snapshot.isDraggingOver && <Box height={`${draggingItemHeight}px`} />}
            </Box>
          );
        }}
      </Droppable>
    </DragDropContext>
  );
}

export default DndDrag;
