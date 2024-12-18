import { Box, Flex } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { useContextSelector } from 'use-context-selector';
import { useReactFlow } from 'reactflow';
import { WorkflowNodeEdgeContext } from '../../context/workflowInitContext';
import { WorkflowEventContext } from '../../context/workflowEventContext';
import { WorkflowContext } from '../../context';

const ContextMenu = () => {
  const { t } = useTranslation();
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);
  const menu = useContextSelector(WorkflowEventContext, (v) => v.menu);
  const setMenu = useContextSelector(WorkflowEventContext, (ctx) => ctx.setMenu);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const { screenToFlowPosition } = useReactFlow();
  const newNode = nodeTemplate2FlowNode({
    template: CommentNode,
    position: screenToFlowPosition({ x: menu?.left ?? 0, y: menu?.top ?? 0 }),
    t
  });

  const allUnFolded = useMemo(() => {
    return !!menu ? nodeList.some((node) => node.isFolded) : false;
  }, [nodeList, menu]);

  return !!menu ? (
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
      <Box
        position={'absolute'}
        top={menu.top}
        left={menu.left}
        bg={'white'}
        w={'120px'}
        rounded={'md'}
        boxShadow={'0px 2px 4px 0px #A1A7B340'}
        className="context-menu"
        color={'myGray.600'}
        p={1}
        zIndex={10}
      >
        <Flex
          alignItems={'center'}
          px={2}
          py={1}
          cursor={'pointer'}
          borderRadius={'sm'}
          _hover={{ bg: 'myGray.50', color: 'primary.500' }}
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
        >
          <MyIcon name="comment" w={'1rem'} ml={1} />
          <Box fontSize={'12px'} fontWeight={'500'} ml={1.5}>
            {t('workflow:context_menu.add_comment')}
          </Box>
        </Flex>
        <Flex
          mt={1}
          alignItems={'center'}
          px={2}
          py={1}
          cursor={'pointer'}
          borderRadius={'sm'}
          _hover={{ bg: 'myGray.50', color: 'primary.500' }}
          onClick={() => {
            setMenu(null);
            setNodes((state) => {
              return state.map((node) => ({
                ...node,
                data: {
                  ...node.data,
                  isFolded: !allUnFolded
                }
              }));
            });
          }}
        >
          <MyIcon name="common/select" w={'1rem'} ml={1} />
          <Box fontSize={'12px'} fontWeight={'500'} ml={1.5}>
            {allUnFolded ? t('workflow:unFoldAll') : t('workflow:foldAll')}
          </Box>
        </Flex>
      </Box>
    </Box>
  ) : null;
};

export default React.memo(ContextMenu);
