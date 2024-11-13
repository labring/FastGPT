import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { useReactFlow } from 'reactflow';
import { WorkflowNodeEdgeContext } from '../../context/workflowInitContext';
import { WorkflowEventContext } from '../../context/workflowEventContext';

const ContextMenu = () => {
  const { t } = useTranslation();
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);
  const menu = useContextSelector(WorkflowEventContext, (v) => v.menu);
  const setMenu = useContextSelector(WorkflowEventContext, (ctx) => ctx.setMenu);

  const { screenToFlowPosition } = useReactFlow();
  const newNode = nodeTemplate2FlowNode({
    template: CommentNode,
    position: screenToFlowPosition({ x: menu?.left ?? 0, y: menu?.top ?? 0 }),
    t
  });

  return (
    !!menu && (
      <Box position="relative">
        <Box
          position="absolute"
          top={`${menu.top - 6}px`}
          left={`${menu.left + 10}px`}
          width={0}
          height={0}
          borderLeft="6px solid transparent"
          borderRight="6px solid transparent"
          borderBottom="6px solid white"
          zIndex={2}
          filter="drop-shadow(0px -1px 2px rgba(0, 0, 0, 0.1))"
        />
        <Flex
          position={'absolute'}
          top={menu.top}
          left={menu.left}
          bg={'white'}
          w={'120px'}
          height={9}
          p={1}
          rounded={'md'}
          boxShadow={'0px 2px 4px 0px #A1A7B340'}
          className="context-menu"
          alignItems={'center'}
          color={'myGray.600'}
          cursor={'pointer'}
          _hover={{
            color: 'primary.500'
          }}
          onClick={() => {
            setMenu(null);
            setNodes((state) => {
              const newState = state
                .map((node) => ({
                  ...node,
                  selected: false
                }))
                // @ts-ignore
                .concat(newNode);
              return newState;
            });
          }}
          zIndex={1}
        >
          <MyIcon name="comment" w={'16px'} h={'16px'} ml={1} />
          <Box fontSize={'12px'} fontWeight={'500'} ml={1.5}>
            {t('workflow:context_menu.add_comment')}
          </Box>
        </Flex>
      </Box>
    )
  );
};

export default React.memo(ContextMenu);
