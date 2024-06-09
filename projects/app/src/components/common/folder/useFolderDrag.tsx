import React, { useState, DragEvent, useCallback } from 'react';
import type { BoxProps } from '@chakra-ui/react';

export const useFolderDrag = ({
  onDrop,
  activeStyles
}: {
  onDrop: (dragId: string, targetId: string) => any;
  activeStyles: BoxProps;
}) => {
  const [dragId, setDragId] = useState<string>();
  const [targetId, setTargetId] = useState<string>();

  const getBoxProps = useCallback(
    ({ dataId, isFolder }: { dataId: string; isFolder: boolean }) => {
      return {
        draggable: true,
        'data-drag-id': isFolder ? dataId : undefined,
        onDragStart: (e: DragEvent<HTMLDivElement>) => {
          setDragId(dataId);
        },
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          const targetId = e.currentTarget.getAttribute('data-drag-id');
          if (!targetId) return;
          setTargetId(targetId);
        },
        onDragLeave: (e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setTargetId(undefined);
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();

          if (targetId && dragId && targetId !== dragId) {
            onDrop(dragId, targetId);
          }

          setTargetId(undefined);
          setDragId(undefined);
        },
        ...(activeStyles &&
          targetId === dataId && {
            ...activeStyles
          })
      };
    },
    [activeStyles, dragId, onDrop, targetId]
  );

  return {
    getBoxProps
  };
};
