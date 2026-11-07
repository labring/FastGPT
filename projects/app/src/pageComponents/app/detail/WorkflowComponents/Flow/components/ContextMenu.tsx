import { Box, HStack, type StackProps } from '@chakra-ui/react';
import React, { useCallback } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { useContextSelector } from 'use-context-selector';
import { useReactFlow } from 'reactflow';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowUIContext } from '../../context/workflowUIContext';
import { useWorkflowAutoLayout } from '../hooks/useWorkflowAutoLayout';

const ContextMenuItem = ({
  icon,
  label,
  onClick,
  setMenu,
  ...props
}: {
  icon: string;
  label: string;
  onClick: () => any;
  setMenu: (menu: null) => void;
} & StackProps) => {
  return (
    <HStack
      px={2}
      py={1}
      cursor={'pointer'}
      borderRadius={'sm'}
      _hover={{ bg: 'myGray.50', color: 'primary.500' }}
      onClick={() => {
        onClick();
        setMenu(null);
      }}
      {...props}
    >
      <MyIcon name={icon as any} w={'1rem'} ml={1} />
      <Box fontSize={'sm'} fontWeight={'500'}>
        {label}
      </Box>
    </HStack>
  );
};

const ContextMenu = () => {
  const { t } = useTranslation();
  const menu = useContextSelector(WorkflowUIContext, (value) => value.menu);
  const setMenu = useContextSelector(WorkflowUIContext, (value) => value.setMenu);
  const { setNodes, allNodeFolded } = useContextSelector(
    WorkflowBufferDataContext,
    (value) => value
  );
  const { screenToFlowPosition } = useReactFlow();
  const { autoLayout } = useWorkflowAutoLayout();

  const onAddComment = useCallback(() => {
    // Compensate for menu position offset (set in onPaneContextMenu)
    // menu.left = e.clientX - 12, menu.top = e.clientY + 6
    const mouseX = (menu?.left ?? 0) + 12;
    const mouseY = (menu?.top ?? 0) - 6;

    const newNode = nodeTemplate2FlowNode({
      template: CommentNode,
      position: screenToFlowPosition({ x: mouseX, y: mouseY }),
      t
    });

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
  }, [menu?.left, menu?.top, screenToFlowPosition, setNodes, t]);

  const onFold = useCallback(() => {
    setNodes((state) => {
      return state.map((node) => {
        // Skip comment nodes
        if (node.data.flowNodeType === FlowNodeTypeEnum.comment) {
          return node;
        }
        return {
          ...node,
          data: {
            ...node.data,
            isFolded: !allNodeFolded
          }
        };
      });
    });
  }, [allNodeFolded, setNodes]);

  if (!menu) return null;

  return (
    <Box>
      <Box
        position={'fixed'}
        top={`${menu.top - 6}px`}
        left={`${menu.left + 10}px`}
        width={0}
        height={0}
        borderLeft="6px solid transparent"
        borderRight="6px solid transparent"
        borderBottom="6px solid white"
        zIndex={10}
        filter="drop-shadow(0px -1px 2px rgba(0, 0, 0, 0.1))"
      />
      <Box
        position={'fixed'}
        top={menu.top}
        left={menu.left}
        bg={'white'}
        w={'120px'}
        rounded={'md'}
        boxShadow={'0px 2px 4px 0px #A1A7B340'}
        color={'myGray.600'}
        p={1}
        zIndex={10}
      >
        <ContextMenuItem
          mb={1}
          icon="alignLeft"
          label={t('workflow:auto_align')}
          onClick={autoLayout}
          setMenu={setMenu}
        />
        <ContextMenuItem
          mb={1}
          icon="comment"
          label={t('workflow:context_menu.add_comment')}
          onClick={onAddComment}
          setMenu={setMenu}
        />
        <ContextMenuItem
          icon="common/select"
          label={allNodeFolded ? t('workflow:unFoldAll') : t('workflow:foldAll')}
          onClick={onFold}
          setMenu={setMenu}
        />
      </Box>
    </Box>
  );
};

export default React.memo(ContextMenu);
