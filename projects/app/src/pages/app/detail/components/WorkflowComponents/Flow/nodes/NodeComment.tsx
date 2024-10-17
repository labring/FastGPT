import React, { useCallback, useMemo, useRef, useState } from 'react';
import NodeCard from './render/NodeCard';
import { NodeProps } from 'reactflow';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { Box, Textarea } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';

const NodeComment = ({ data }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs } = data;
  const { commentText, commentSize } = useMemo(
    () => ({
      commentText: inputs.find((item) => item.key === NodeInputKeyEnum.commentText),
      commentSize: inputs.find((item) => item.key === NodeInputKeyEnum.commentSize)
    }),
    [inputs]
  );

  const onChangeNode = useContextSelector(WorkflowContext, (ctx) => ctx.onChangeNode);

  const { t } = useTranslation();
  const [size, setSize] = useState<{
    width: number;
    height: number;
  }>(commentSize?.value);

  const initialY = useRef(0);
  const initialX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      initialY.current = e.clientY;
      initialX.current = e.clientX;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaY = e.clientY - initialY.current;
        const deltaX = e.clientX - initialX.current;
        setSize((prevSize) => ({
          width: prevSize.width + deltaX < 120 ? 120 : prevSize.width + deltaX,
          height: prevSize.height + deltaY < 60 ? 60 : prevSize.height + deltaY
        }));
        initialY.current = e.clientY;
        initialX.current = e.clientX;
        commentSize &&
          onChangeNode({
            nodeId: nodeId,
            type: 'updateInput',
            key: NodeInputKeyEnum.commentSize,
            value: {
              ...commentSize,
              value: {
                width: size.width + deltaX,
                height: size.height + deltaY
              }
            }
          });
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [commentSize, nodeId, onChangeNode, size.height, size.width]
  );

  const Render = useMemo(() => {
    return (
      <NodeCard
        selected={false}
        {...data}
        minW={`${size.width}px`}
        minH={`${size.height}px`}
        menuForbid={{
          debug: true
        }}
        customStyle={{
          border: 'none',
          rounded: 'none',
          bg: '#D8E9FF',
          boxShadow:
            '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
        }}
      >
        <Box w={'full'} h={'full'} position={'relative'}>
          <Box
            position={'absolute'}
            right={'0'}
            bottom={'-2'}
            zIndex={9}
            cursor={'nwse-resize'}
            px={'2px'}
            className="nodrag"
            onMouseDown={handleMouseDown}
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
              commentText &&
                onChangeNode({
                  nodeId: nodeId,
                  type: 'updateInput',
                  key: NodeInputKeyEnum.commentText,
                  value: {
                    ...commentText,
                    value: e.target.value
                  }
                });
            }}
          />
        </Box>
      </NodeCard>
    );
  }, [commentText, data, handleMouseDown, nodeId, onChangeNode, size.height, size.width, t]);

  return Render;
};

export default React.memo(NodeComment);
