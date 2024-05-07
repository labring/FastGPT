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

type Props = {
  onDragEndCb: (result: DropResult) => void;
  renderClone?: DraggableChildrenFn;
  children: DroppableProps['children'];
};

const DndDrag = ({ children, renderClone, onDragEndCb }: Props) => {
  const [draggingItemHeight, setDraggingItemHeight] = useState(0);

  const onDragStart = (start: DragStart) => {
    const draggingNode = document.querySelector(`[data-rbd-draggable-id="${start.draggableId}"]`);
    setDraggingItemHeight(draggingNode?.getBoundingClientRect().height || 0);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }
    onDragEndCb(result);
    setDraggingItemHeight(0);
  };

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Droppable droppableId="droppable" renderClone={renderClone}>
        {(provided, snapshot) => {
          return (
            <Box {...provided.droppableProps} ref={provided.innerRef}>
              {children(provided, snapshot)}
              {snapshot.isDraggingOver && <Box height={draggingItemHeight} />}
            </Box>
          );
        }}
      </Droppable>
    </DragDropContext>
  );
};

export default DndDrag;

export * from 'react-beautiful-dnd';
