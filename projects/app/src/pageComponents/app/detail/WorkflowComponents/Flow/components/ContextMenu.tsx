import { Box, HStack, type StackProps } from '@chakra-ui/react';
import React, { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { useCanvas } from '@/web/core/workflow/editor/react/useWorkflowQueries';
import { canvasNodeToStoreNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import {
  useWorkflowRuntime,
  useWorkflowSnapshot
} from '@/web/core/workflow/editor/session/workflowSession';
import { useWorkflowUIValue } from '../canvas/canvasState';
import { useClearCanvasSelection } from '../canvas/useCanvasController';
import { useWorkflowAutoLayout } from '../hooks/useWorkflowAutoLayout';

const ContextMenuItem = ({
  icon,
  label,
  onClick,
  ...props
}: {
  icon: string;
  label: string;
  onClick: () => any;
} & StackProps) => {
  const closeContextMenu = useWorkflowUIValue((value) => value.closeContextMenu);

  return (
    <HStack
      px={2}
      py={1}
      cursor={'pointer'}
      borderRadius={'sm'}
      _hover={{ bg: 'myGray.50', color: 'primary.500' }}
      onClick={() => {
        onClick();
        closeContextMenu();
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
  const menu = useWorkflowUIValue((value) => value.menu!);
  const actions = useWorkflowActions();
  const canvas = useCanvas();
  const clearCanvasSelection = useClearCanvasSelection();
  const { screenToFlowPosition } = useReactFlow();
  const runtime = useWorkflowRuntime();
  const workflow = useWorkflowSnapshot();
  const { autoLayout } = useWorkflowAutoLayout();

  const allNodeFolded = (workflow?.nodes ?? []).every(
    (node) =>
      node.flowNodeType === FlowNodeTypeEnum.comment ||
      !!runtime?.getNodeView(node.nodeId)?.isFolded
  );

  const onAddComment = useCallback(() => {
    const newNode = nodeTemplate2FlowNode({
      template: CommentNode,
      position: screenToFlowPosition({
        x: (menu?.left ?? 0) + 12,
        y: (menu?.top ?? 0) - 6
      }),
      t
    });

    clearCanvasSelection();
    actions.addNode(canvasNodeToStoreNode(newNode));
  }, [actions, clearCanvasSelection, menu, screenToFlowPosition, t]);

  const onFold = useCallback(() => {
    canvas.commitGeometry(
      (workflow?.nodes ?? [])
        .filter((node) => node.flowNodeType !== FlowNodeTypeEnum.comment)
        .map((node) => ({ nodeId: node.nodeId, isFolded: !allNodeFolded }))
    );
  }, [allNodeFolded, canvas, workflow]);

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
        />
        <ContextMenuItem
          mb={1}
          icon="comment"
          label={t('workflow:context_menu.add_comment')}
          onClick={onAddComment}
        />
        <ContextMenuItem
          icon="common/select"
          label={allNodeFolded ? t('workflow:unFoldAll') : t('workflow:foldAll')}
          onClick={onFold}
        />
      </Box>
    </Box>
  );
};

export default React.memo(ContextMenu);
