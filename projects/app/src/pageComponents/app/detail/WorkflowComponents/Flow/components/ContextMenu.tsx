import { Box, HStack, StackProps } from '@chakra-ui/react';
import React, { useCallback, useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { useContextSelector } from 'use-context-selector';
import { Node, useReactFlow } from 'reactflow';
import { WorkflowNodeEdgeContext } from '../../context/workflowInitContext';
import { WorkflowEventContext } from '../../context/workflowEventContext';
import { WorkflowContext } from '../../context';
import dagre from '@dagrejs/dagre';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
const getLayoutedElements = (nodes: Node<FlowNodeItemType>[], edges: any[]) => {
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 80, // Horizontal space
    ranksep: 120 // Vertical space
  });

  // Find connected nodes
  const connectedNodeIds = new Set<string>();
  edges.forEach((edge) => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: node.width!, height: node.height! });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map<Node<FlowNodeItemType>>((node) => {
    if (!connectedNodeIds.has(node.id)) {
      return node;
    }

    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = {
      ...node,
      position: {
        x: nodeWithPosition.x - node.width! / 2,
        y: nodeWithPosition.y - node.height! / 2
      }
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};

const ContextMenu = () => {
  const { t } = useTranslation();
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);
  const menu = useContextSelector(WorkflowEventContext, (v) => v.menu!);
  const setMenu = useContextSelector(WorkflowEventContext, (ctx) => ctx.setMenu);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const setEdges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setEdges);

  const { fitView, screenToFlowPosition } = useReactFlow();

  const allUnFolded = useMemo(() => {
    return !!menu ? nodeList.some((node) => node.isFolded) : false;
  }, [nodeList, menu]);

  const onLayout = useCallback(() => {
    setNodes((nodes) => {
      let newNodes: Node<FlowNodeItemType>[] = [];
      setEdges((edges) => {
        const { nodes: newLayoutNodes, edges: newEdges } = getLayoutedElements(nodes, edges);
        newNodes = newLayoutNodes;
        return newEdges;
      });

      return newNodes;
    });
    fitView();
  }, []);

  const onAddComment = useCallback(() => {
    const newNode = nodeTemplate2FlowNode({
      template: CommentNode,
      position: screenToFlowPosition({ x: menu?.left ?? 0, y: (menu?.top ?? 0) + 100 }),
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
  }, [menu]);

  const onFold = useCallback(() => {
    setNodes((state) => {
      return state.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isFolded: !allUnFolded
        }
      }));
    });
  }, [allUnFolded]);

  const ContextMenuItem = useCallback(
    ({
      icon,
      label,
      onClick,
      ...props
    }: {
      icon: string;
      label: string;
      onClick: () => any;
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
    },
    [setMenu]
  );

  return (
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
        <ContextMenuItem
          mb={1}
          icon="alignLeft"
          label={t('workflow:auto_align')}
          onClick={onLayout}
        />
        <ContextMenuItem
          mb={1}
          icon="comment"
          label={t('workflow:context_menu.add_comment')}
          onClick={onAddComment}
        />
        <ContextMenuItem
          icon="common/select"
          label={allUnFolded ? t('workflow:unFoldAll') : t('workflow:foldAll')}
          onClick={onFold}
        />
      </Box>
    </Box>
  );
};

export default React.memo(ContextMenu);
