import { Box, Tbody } from '@chakra-ui/react';
import React, { ReactNode, useState } from 'react';
import {
  DragDropContext,
  Droppable,
  DraggableChildrenFn,
  DragStart,
  DropResult,
  DroppableProvided,
  DroppableStateSnapshot
} from 'react-beautiful-dnd';
export * from 'react-beautiful-dnd';

type Props<T = any> = {
  onDragEndCb: (result: T[]) => void;
  renderClone?: DraggableChildrenFn;
  children:
    | ((provided: DroppableProvided, snapshot: DroppableStateSnapshot) => ReactNode)
    | ReactNode;
  dataList: T[];
  isTable?: boolean;
  zoom?: number;
};

function DndDrag<T>({
  children,
  renderClone,
  onDragEndCb,
  dataList,
  isTable = false,
  zoom = 1
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
        {(provided, snapshot) => {
          return isTable ? (
            <Tbody {...provided.droppableProps} ref={provided.innerRef}>
              {typeof children !== 'function' && children}
              {snapshot.isDraggingOver && <Box height={`${draggingItemHeight / zoom}px`} />}
            </Tbody>
          ) : (
            <Box {...provided.droppableProps} ref={provided.innerRef}>
              {typeof children === 'function' && children(provided, snapshot)}
              {snapshot.isDraggingOver && <Box height={`${draggingItemHeight / zoom}px`} />}
            </Box>
          );
        }}
      </Droppable>
    </DragDropContext>
  );
}

export default React.memo(DndDrag) as <T>(props: Props<T>) => React.ReactElement;
