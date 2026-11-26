import React, { useEffect, useRef, useState } from 'react';
import NodeCard from './render/NodeCard';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { Box, Textarea } from '@chakra-ui/react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useField, useFieldActions } from '@/web/core/workflow/editor/react/useField';

const defaultSize = { width: 240, height: 140 };

const NodeComment = ({ data }: CanvasNodeProps) => {
  const { nodeId } = data;

  // 备注文本与尺寸都只改字段值，走字段句柄；字段不存在时 setValue 自然不触发写入。
  const commentText = useField(
    { nodeId, fieldKey: NodeInputKeyEnum.commentText, kind: 'input' },
    (field) => field?.data.input
  );
  const commentSize = useField(
    { nodeId, fieldKey: NodeInputKeyEnum.commentSize, kind: 'input' },
    (field) => field?.data.input
  );
  const commentTextActions = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.commentText,
    kind: 'input'
  });
  const commentSizeActions = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.commentSize,
    kind: 'input'
  });

  const { t } = useTranslation();
  const [size, setSize] = useState<typeof defaultSize>(commentSize?.value ?? defaultSize);

  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startSize: typeof defaultSize;
    currentSize: typeof defaultSize;
  }>();

  useEffect(() => {
    if (!resizeRef.current) setSize(commentSize?.value ?? defaultSize);
  }, [commentSize?.value]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || resizeRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startSize: size,
      currentSize: size
    };
  };

  const previewResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resize.currentSize = {
      width: Math.max(120, resize.startSize.width + event.clientX - resize.startX),
      height: Math.max(60, resize.startSize.height + event.clientY - resize.startY)
    };
    setSize(resize.currentSize);
  };

  /** 捕获丢失和系统取消仅丢弃预览，只有所属指针的 pointerup 写入尺寸。 */
  const finishResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizeRef.current = undefined;
    if (event.type !== 'pointerup') {
      setSize(commentSize?.value ?? defaultSize);
      return;
    }
    if (
      resize.currentSize.width !== resize.startSize.width ||
      resize.currentSize.height !== resize.startSize.height
    ) {
      commentSizeActions.setValue(resize.currentSize);
    }
  };

  return (
    <NodeCard
      selected={false}
      {...data}
      minW={`${size.width}px`}
      minH={`${size.height}px`}
      menuForbid={{
        debug: true,
        fold: true
      }}
      customStyle={{
        border: 'none',
        rounded: 'none',
        boxShadow:
          '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
      }}
    >
      <Box
        w={'full'}
        h={'full'}
        borderRadius={'lg'}
        position={'relative'}
        bg={'#D8E9FF'}
        overflow={'hidden'}
      >
        <Box
          position={'absolute'}
          right={'0'}
          bottom={'-2'}
          zIndex={9}
          cursor={'nwse-resize'}
          sx={{ touchAction: 'none' }}
          px={'2px'}
          className="nodrag"
          onPointerDown={startResize}
          onPointerMove={previewResize}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
        >
          <MyIcon name={'common/editor/resizer'} width={'14px'} height={'14px'} />
        </Box>
        <Textarea
          value={commentText?.value}
          border={'none'}
          rounded={'none'}
          minH={`${size.height}px`}
          minW={`${size.width}px`}
          resize={'none'}
          placeholder={t('workflow:enter_comment')}
          onChange={(e) => {
            commentTextActions.setValue(e.target.value);
          }}
        />
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeComment);
