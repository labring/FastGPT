import { Box, HStack, type StackProps } from '@chakra-ui/react';
import React, { useCallback } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { type Node, useReactFlow } from 'reactflow';
import dagre from '@dagrejs/dagre';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { cloneDeep } from 'lodash-es';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useWorkflowUIValue } from '../canvas/canvasState';
import { useWorkflowCanvasValue } from '../canvas/workflowCanvasContext';
import { getHandleIndex } from '../utils/edge';
import { getParentNodeSizeAndPosition } from '../utils/layout';
import { useCanvas } from '@/web/core/workflow/editor/react/useWorkflowQueries';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { canvasNodeToStoreNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import {
  useWorkflowRuntime,
  useWorkflowSnapshot
} from '@/web/core/workflow/editor/session/workflowSession';
import { useClearCanvasSelection } from '../canvas/useCanvasController';
import { type DimensionReader, type NodeCardDimension } from '../canvas/nodeDimensions';

/** 右键菜单单项：执行动作后关闭菜单。不依赖父组件状态，放模块级避免每次渲染重建组件。 */
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
  const closeContextMenu = useWorkflowUIValue((ctx) => ctx.closeContextMenu);

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
  const menu = useWorkflowUIValue((v) => v.menu!);
  const actions = useWorkflowActions();
  const canvas = useCanvas();
  const clearCanvasSelection = useClearCanvasSelection();

  // 自动对齐只读 renderer 交互状态（位置、测量尺寸）；写入走画布本地数组，
  // 受控模式下 useReactFlow().setNodes 会被转成整份 reset 变更。
  const { screenToFlowPosition } = useReactFlow();
  const getNodes = useWorkflowCanvasValue((v) => v.getNodes);
  const fitNodes = useWorkflowCanvasValue((v) => v.fitNodes);
  const edges = useWorkflowCanvasValue((v) => v.edges);
  const getNodeDimension = useWorkflowCanvasValue((v) => v.getNodeDimension);
  const replaceNodes = useWorkflowCanvasValue((v) => v.replaceNodes);
  const runtime = useWorkflowRuntime();
  // 语义通道：快照只在语义版本变化时换身份，节点增删会带动下面的折叠判定重算。
  const workflow = useWorkflowSnapshot();

  /**
   * 是否全部节点已折叠：折叠存在 Node View 上，语义快照不含，只能问 runtime。
   * host 的 viewTick 只覆盖 overlay 与标红焦点，折叠提交（commitGeometry）不再 bump 任何计数器，
   * 所以这里不做 memo，每次渲染按当前值算：菜单是 {!!menu && <ContextMenu />}，每次打开都重新挂载，
   * 用户看到标签时读到的一定是当前值；唯一过期窗口是「菜单常驻期间从节点卡片改折叠」。
   * comment 节点不参与判定，空文档视为已全部折叠，与旧派生索引一致。
   */
  const allNodeFolded = (workflow?.nodes ?? []).every(
    (node) =>
      node.flowNodeType === FlowNodeTypeEnum.comment ||
      !!runtime?.getNodeView(node.nodeId)?.isFolded
  );

  const onLayout = useCallback(() => {
    const updateChildNodesPosition = ({
      startNode,
      nodes,
      edges,
      getDimension
    }: {
      startNode: Node<FlowNodeItemType>;
      nodes: Node<FlowNodeItemType>[];
      edges: any[];
      getDimension: DimensionReader;
    }) => {
      const startPosition = { x: startNode.position.x, y: startNode.position.y };
      const startDimension = getDimension(startNode.id);
      if (!startDimension) return;

      const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({
        rankdir: 'LR',
        nodesep: 80,
        ranksep: 200
      });

      nodes.forEach((node) => {
        const dimension = getDimension(node.id);
        if (dimension) dagreGraph.setNode(node.id, dimension);
      });

      // Find connected nodes
      const connectedNodeIds = new Set<string>();
      edges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);

        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);
      const layoutedStartNode = dagreGraph.node(startNode.data.nodeId);
      const offsetX = startPosition.x - (layoutedStartNode.x - startDimension.width / 2);
      const offsetY = startPosition.y - (layoutedStartNode.y - startDimension.height / 2);

      // Group nodes by rank (horizontal position in LR layout)
      const nodesByRank: Map<
        number,
        Array<{ node: Node<FlowNodeItemType>; dagreNode: any }>
      > = new Map();

      nodes.forEach((node) => {
        if (!connectedNodeIds.has(node.id)) {
          return;
        }

        const nodeWithPosition = dagreGraph.node(node.id);
        const rank = Math.round(nodeWithPosition.x); // Group by x coordinate (same column)

        if (!nodesByRank.has(rank)) {
          nodesByRank.set(rank, []);
        }
        nodesByRank.get(rank)!.push({ node, dagreNode: nodeWithPosition });
      });

      // Apply left-aligned positioning for nodes in same column (vertical stacking)
      const nodesMap = new Map(nodes.map((n) => [n.id, n]));
      nodesByRank.forEach((nodesInRank) => {
        // Find the minimum left position (for left alignment)
        let minLeft = Infinity;
        nodesInRank.forEach(({ node, dagreNode }) => {
          const dimension = getDimension(node.id);
          if (!dimension) return;
          const left = dagreNode.x - dimension.width / 2;
          minLeft = Math.min(minLeft, left);
        });

        // Sort nodes: use handle index for special nodes, otherwise maintain original Y position
        nodesInRank.sort((a, b) => {
          const edgeA = edges.find((e) => e.target === a.node.id);
          const edgeB = edges.find((e) => e.target === b.node.id);
          const sourceA = nodesMap.get(edgeA?.source);
          const sourceB = nodesMap.get(edgeB?.source);

          // Check if sources are special nodes (ifElse, userSelect, classifyQuestion)
          const specialNodeTypes = [
            FlowNodeTypeEnum.ifElseNode,
            FlowNodeTypeEnum.userSelect,
            FlowNodeTypeEnum.classifyQuestion
          ];
          const isSourceASpecial = sourceA && specialNodeTypes.includes(sourceA.data.flowNodeType);
          const isSourceBSpecial = sourceB && specialNodeTypes.includes(sourceB.data.flowNodeType);

          // If both from special nodes or both from regular nodes with same source, use handle index
          if (
            edgeA?.source === edgeB?.source &&
            (isSourceASpecial || isSourceBSpecial || !sourceA || !sourceB)
          ) {
            return getHandleIndex(edgeA, sourceA) - getHandleIndex(edgeB, sourceB);
          }

          // Otherwise, maintain original Y position order
          return a.dagreNode.y - b.dagreNode.y;
        });

        // Assign Y positions in sorted order
        let currentY =
          Math.min(
            ...nodesInRank.map(({ dagreNode, node }) => {
              const dimension = getDimension(node.id);
              return dagreNode.y - (dimension?.height ?? 0) / 2;
            })
          ) + offsetY;
        nodesInRank.forEach(({ node }) => {
          const dimension = getDimension(node.id);
          if (!dimension) return;
          node.position = { x: minLeft + offsetX, y: currentY };
          currentY += dimension.height + 80;
        });
      });
    };
    const updateParentNodesPosition = ({
      startNode,
      nodes,
      edges,
      getDimension
    }: {
      startNode: Node<FlowNodeItemType>;
      nodes: Node<FlowNodeItemType>[];
      edges: any[];
      getDimension: DimensionReader;
    }) => {
      const startPosition = { x: startNode.position.x, y: startNode.position.y };
      const startDimension = getDimension(startNode.id);
      if (!startDimension) return;

      const childNodeIdsSet = new Set(
        nodes.filter((node) => !!node.data.parentNodeId).map((node) => node.data.nodeId)
      );

      const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({
        rankdir: 'LR',
        nodesep: 80,
        ranksep: 200
      });

      nodes.forEach((node) => {
        if (childNodeIdsSet.has(node.data.nodeId)) return;
        const dimension = getDimension(node.id);
        if (dimension) dagreGraph.setNode(node.id, dimension);
      });

      // Find connected nodes
      const filteredEdges = edges.filter(
        (edge) => !childNodeIdsSet.has(edge.source) && !childNodeIdsSet.has(edge.target)
      );
      const connectedNodeIds = new Set<string>();
      filteredEdges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);
      const layoutedStartNode = dagreGraph.node(startNode.data.nodeId);
      const offsetX = startPosition.x - (layoutedStartNode.x - startDimension.width / 2);
      const offsetY = startPosition.y - (layoutedStartNode.y - startDimension.height / 2);

      // Group nodes by rank (horizontal position in LR layout)
      const nodesByRank: Map<
        number,
        Array<{ node: Node<FlowNodeItemType>; dagreNode: any }>
      > = new Map();

      nodes.forEach((node) => {
        if (!connectedNodeIds.has(node.id) || childNodeIdsSet.has(node.data.nodeId)) {
          return;
        }

        const nodeWithPosition = dagreGraph.node(node.id);
        const rank = Math.round(nodeWithPosition.x); // Group by x coordinate (same column)

        if (!nodesByRank.has(rank)) {
          nodesByRank.set(rank, []);
        }
        nodesByRank.get(rank)!.push({ node, dagreNode: nodeWithPosition });
      });

      // Apply left-aligned positioning for nodes in same column (vertical stacking)
      const nodesMap = new Map(nodes.map((n) => [n.id, n]));
      nodesByRank.forEach((nodesInRank) => {
        // Find the minimum left position (for left alignment)
        let minLeft = Infinity;
        nodesInRank.forEach(({ node, dagreNode }) => {
          const dimension = getDimension(node.id);
          if (!dimension) return;
          const left = dagreNode.x - dimension.width / 2;
          minLeft = Math.min(minLeft, left);
        });

        // Sort nodes: use handle index for special nodes, otherwise maintain original Y position
        nodesInRank.sort((a, b) => {
          const edgeA = filteredEdges.find((e) => e.target === a.node.id);
          const edgeB = filteredEdges.find((e) => e.target === b.node.id);
          const sourceA = nodesMap.get(edgeA?.source);
          const sourceB = nodesMap.get(edgeB?.source);

          // Check if sources are special nodes (ifElse, userSelect, classifyQuestion)
          const specialNodeTypes = [
            FlowNodeTypeEnum.ifElseNode,
            FlowNodeTypeEnum.userSelect,
            FlowNodeTypeEnum.classifyQuestion
          ];
          const isSourceASpecial = sourceA && specialNodeTypes.includes(sourceA.data.flowNodeType);
          const isSourceBSpecial = sourceB && specialNodeTypes.includes(sourceB.data.flowNodeType);

          // If both from special nodes or both from regular nodes with same source, use handle index
          if (
            edgeA?.source === edgeB?.source &&
            (isSourceASpecial || isSourceBSpecial || !sourceA || !sourceB)
          ) {
            return getHandleIndex(edgeA, sourceA) - getHandleIndex(edgeB, sourceB);
          }

          // Otherwise, maintain original Y position order
          return a.dagreNode.y - b.dagreNode.y;
        });

        // Assign Y positions in sorted order
        let currentY =
          Math.min(
            ...nodesInRank.map(({ dagreNode, node }) => {
              const dimension = getDimension(node.id);
              return dagreNode.y - (dimension?.height ?? 0) / 2;
            })
          ) + offsetY;
        nodesInRank.forEach(({ node }) => {
          const dimension = getDimension(node.id);
          if (!dimension) return;
          const targetX = minLeft + offsetX;
          const diffX = targetX - node.position.x;
          const diffY = currentY - node.position.y;

          node.position = { x: targetX, y: currentY };
          currentY += dimension.height + 80;

          // Sync child nodes position
          nodes.forEach((childNode) => {
            if (childNode.data.parentNodeId === node.data.nodeId) {
              childNode.position = {
                x: childNode.position.x + diffX,
                y: childNode.position.y + diffY
              };
            }
          });
        });
      });
    };

    const sourceNodes = getNodes();
    const layoutDimensions = new Map<string, NodeCardDimension>();
    sourceNodes.forEach((node) => {
      const dimension = getNodeDimension(node.id);
      if (dimension) layoutDimensions.set(node.id, dimension);
    });
    if (layoutDimensions.size !== sourceNodes.length) return;

    const getLayoutDimension: DimensionReader = (nodeId) => layoutDimensions.get(nodeId);
    const newNodes = cloneDeep(sourceNodes) as Node<FlowNodeItemType>[];
    const previousPositions = new Map(
      newNodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
    );
    const childNodesIdSet = new Set<string>();

    // 1. Layout child nodes
    const childNodesMap: Record<string, Node<FlowNodeItemType>[]> = {};
    newNodes.forEach((node) => {
      const parentId = node.data.parentNodeId;
      if (parentId) {
        childNodesIdSet.add(parentId);
        (childNodesMap[parentId] ??= []).push(node);
      }
    });
    Object.values(childNodesMap).forEach((childNodes) => {
      updateChildNodesPosition({
        startNode: childNodes[0],
        nodes: childNodes,
        edges,
        getDimension: getLayoutDimension
      });
    });

    // 2. Reset parent node size and position. Dimensions remain renderer-local;
    // container size persistence is intentionally outside this ticket.
    const parentNodes = newNodes.filter((node) => childNodesIdSet.has(node.data.nodeId));
    parentNodes.forEach((node) => {
      const res = getParentNodeSizeAndPosition({
        nodes: newNodes,
        parentId: node.data.nodeId,
        getNodeDimension: getLayoutDimension
      });
      if (!res) return;
      node.position = { x: res.parentX, y: res.parentY };
      layoutDimensions.set(node.id, { width: res.nodeWidth, height: res.nodeHeight });
    });

    // 3. Layout parent node
    const startNode = newNodes.find((node) =>
      [FlowNodeTypeEnum.workflowStart, FlowNodeTypeEnum.pluginInput].includes(
        node.data.flowNodeType
      )
    );
    if (startNode || newNodes[0]) {
      updateParentNodesPosition({
        startNode: startNode || newNodes[0],
        nodes: newNodes,
        edges,
        getDimension: getLayoutDimension
      });
    }

    const renderNodes = newNodes.map((node) => {
      const dimension = getLayoutDimension(node.id);
      return dimension ? { ...node, ...dimension } : node;
    });
    replaceNodes(renderNodes);
    canvas.commitGeometry(
      renderNodes.flatMap((node) => {
        const previous = previousPositions.get(node.id);
        return previous && (previous.x !== node.position.x || previous.y !== node.position.y)
          ? [{ nodeId: node.data.nodeId, position: node.position }]
          : [];
      })
    );

    setTimeout(() => {
      fitNodes(undefined, { padding: 0.3 });
    });
  }, [canvas, edges, fitNodes, getNodeDimension, getNodes, replaceNodes]);

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
          label={allNodeFolded ? t('workflow:unFoldAll') : t('workflow:foldAll')}
          onClick={onFold}
        />
      </Box>
    </Box>
  );
};

export default React.memo(ContextMenu);
