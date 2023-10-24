import { useState } from 'react';

export const useDrag = () => {
  const [moveDataId, setMoveDataId] = useState<string>();
  const [dragStartId, setDragStartId] = useState<string>();
  const [dragTargetId, setDragTargetId] = useState<string>();

  return {
    moveDataId,
    setMoveDataId,
    dragStartId,
    setDragStartId,
    dragTargetId,
    setDragTargetId
  };
};
