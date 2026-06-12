import { useState, type DragEvent, useCallback, useRef } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { useBoolean } from 'ahooks';
import {
  canMoveResourceToTarget,
  getDropTargetFolderDepth,
  type GetSubtreeMaxFolderDepthQueryType,
  type GetSubtreeMaxFolderDepthResponseType
} from '@fastgpt/global/common/parentFolder/depth';
import { GET } from '@/web/common/api/request';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';

/** 拖拽深度校验：查询被移动资源的文件夹子树最大相对深度。 */
export const fetchResourceSubtreeMaxFolderDepth = (data: GetSubtreeMaxFolderDepthQueryType) =>
  GET<GetSubtreeMaxFolderDepthResponseType>('/common/parentFolder/subtreeDepth', data).then(
    ({ subtreeMaxFolderDepth }) => subtreeMaxFolderDepth
  );

type MoveDepthLimitConfig = {
  maxDepth: number;
  currentFolderLevel: number;
  isFolderResource: (resourceId: string) => boolean;
  fetchSubtreeMaxFolderDepth: (resourceId: string) => Promise<number>;
};

export const useFolderDrag = ({
  onDrop,
  activeStyles,
  moveDepthLimit
}: {
  onDrop: (dragId: string, targetId: string) => any;
  activeStyles: BoxProps;
  moveDepthLimit?: MoveDepthLimitConfig;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string>();
  const [targetId, setTargetId] = useState<string>();
  const [dragSubtreeMax, setDragSubtreeMax] = useState<number | null>(null);
  const [isDropping, { setTrue, setFalse }] = useBoolean(false);
  const dragSubtreePromiseRef = useRef<Promise<number> | null>(null);

  const dropTargetDepth = moveDepthLimit
    ? getDropTargetFolderDepth(moveDepthLimit.currentFolderLevel)
    : 0;

  const isDropAllowed = useCallback(
    (subtreeMax: number) => {
      if (!moveDepthLimit) return true;
      return canMoveResourceToTarget(dropTargetDepth, subtreeMax, moveDepthLimit.maxDepth);
    },
    [dropTargetDepth, moveDepthLimit]
  );

  const resetDragState = useCallback(() => {
    setTargetId(undefined);
    setDragId(undefined);
    setDragSubtreeMax(null);
    dragSubtreePromiseRef.current = null;
  }, []);

  const getBoxProps = useCallback(
    ({ dataId, isFolder }: { dataId: string; isFolder: boolean }) => {
      const isActiveTarget = targetId === dataId;
      const canHighlight =
        isActiveTarget &&
        (!moveDepthLimit || (dragSubtreeMax !== null && isDropAllowed(dragSubtreeMax)));
      const isBlockedTarget =
        isActiveTarget &&
        !!moveDepthLimit &&
        dragSubtreeMax !== null &&
        !isDropAllowed(dragSubtreeMax);

      return {
        draggable: true,
        userSelect: 'none' as any,
        'data-drag-id': isFolder ? dataId : undefined,
        onDragStart: () => {
          setDragId(dataId);
          setDragSubtreeMax(null);

          if (!moveDepthLimit) return;

          const promise = moveDepthLimit.isFolderResource(dataId)
            ? moveDepthLimit.fetchSubtreeMaxFolderDepth(dataId)
            : Promise.resolve(0);

          dragSubtreePromiseRef.current = promise;
          promise.then(setDragSubtreeMax).catch(() => setDragSubtreeMax(0));
        },
        onDragEnd: resetDragState,
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          const nextTargetId = e.currentTarget.getAttribute('data-drag-id');
          if (!nextTargetId) return;
          setTargetId(nextTargetId);
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
                if (moveDepthLimit) {
                  const subtreeMax = await (dragSubtreePromiseRef.current ?? Promise.resolve(0));
                  if (!isDropAllowed(subtreeMax)) {
                    toast({ status: 'warning', title: t('common:error.folderMoveDepthLimit') });
                    return;
                  }
                }
                await onDrop(dragId, targetId);
              }
            } catch {}

            resetDragState();
            setFalse();
          }
        }),
        ...(activeStyles &&
          canHighlight && {
            ...activeStyles
          }),
        ...(isBlockedTarget && {
          borderColor: 'red.300',
          cursor: 'not-allowed'
        })
      };
    },
    [
      activeStyles,
      dragId,
      dragSubtreeMax,
      isDropAllowed,
      moveDepthLimit,
      onDrop,
      resetDragState,
      setFalse,
      setTrue,
      targetId,
      t,
      toast
    ]
  );

  return {
    getBoxProps,
    isDropping
  };
};
