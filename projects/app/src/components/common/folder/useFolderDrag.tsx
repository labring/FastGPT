import React, { useState, DragEvent, useCallback } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { useBoolean } from 'ahooks';

export const useFolderDrag = ({
  onDrop,
  activeStyles
}: {
  onDrop: (dragId: string, targetId: string) => any;
  activeStyles: BoxProps;
}) => {
  const [dragId, setDragId] = useState<string>();
  const [targetId, setTargetId] = useState<string>();
  const [isDropping, { setTrue, setFalse }] = useBoolean();

  const getBoxProps = useCallback(
    ({ dataId, isFolder }: { dataId: string; isFolder: boolean }) => {
      return {
        draggable: true,
        userSelect: 'none' as any,
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
        ...(isFolder && {
          onDrop: async (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setTrue();

            try {
              if (targetId && dragId && targetId !== dragId) {
                await onDrop(dragId, targetId);
              }
            } catch (error) {}

            setTargetId(undefined);
            setDragId(undefined);
            setFalse();
          }
        }),
        ...(activeStyles &&
          targetId === dataId && {
            ...activeStyles
          })
      };
    },
    [activeStyles, dragId, onDrop, setFalse, setTrue, targetId]
  );

  return {
    getBoxProps,
    isDropping
  };
};
