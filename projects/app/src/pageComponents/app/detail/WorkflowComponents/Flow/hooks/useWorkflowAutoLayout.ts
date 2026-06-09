import { useCallback } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useReactFlow, type Node } from 'reactflow';
import dagre from '@dagrejs/dagre';
import { cloneDeep } from 'lodash';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { WorkflowLayoutContext } from '../../context/workflowComputeContext';
import { getHandleIndex } from '../utils/edge';

export function useWorkflowAutoLayout() {
  const { setNodes, setEdges } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const getParentNodeSizeAndPosition = useContextSelector(
    WorkflowLayoutContext,
    (v) => v.getParentNodeSizeAndPosition
  );
  const { fitView, getNodes } = useReactFlow();

  const autoLayout = useCallback(() => {
    const updateChildNodesPosition = ({
      startNode,
      nodes,
      edges
    }: {
      startNode: Node<FlowNodeItemType>;
      nodes: Node<FlowNodeItemType>[];
      edges: any[];
    }) => {
      const startPosition = { x: startNode.position.x, y: startNode.position.y };

      const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200 });

      nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: node.width!, height: node.height! });
      });

      const connectedNodeIds = new Set<string>();
      edges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);
      const layoutedStartNode = dagreGraph.node(startNode.data.nodeId);
      const offsetX = startPosition.x - (layoutedStartNode.x - startNode.width! / 2);
      const offsetY = startPosition.y - (layoutedStartNode.y - startNode.height! / 2);

      const nodesByRank: Map<
        number,
        Array<{ node: Node<FlowNodeItemType>; dagreNode: any }>
      > = new Map();

      nodes.forEach((node) => {
        if (!connectedNodeIds.has(node.id)) return;
        const nodeWithPosition = dagreGraph.node(node.id);
        const rank = Math.round(nodeWithPosition.x);
        if (!nodesByRank.has(rank)) nodesByRank.set(rank, []);
        nodesByRank.get(rank)!.push({ node, dagreNode: nodeWithPosition });
      });

      const nodesMap = new Map(nodes.map((n) => [n.id, n]));
      nodesByRank.forEach((nodesInRank) => {
        let minLeft = Infinity;
        nodesInRank.forEach(({ node, dagreNode }) => {
          const left = dagreNode.x - node.width! / 2;
          minLeft = Math.min(minLeft, left);
        });

        nodesInRank.sort((a, b) => {
          const edgeA = edges.find((e) => e.target === a.node.id);
          const edgeB = edges.find((e) => e.target === b.node.id);
          const sourceA = nodesMap.get(edgeA?.source);
          const sourceB = nodesMap.get(edgeB?.source);

          const specialNodeTypes = [
            FlowNodeTypeEnum.ifElseNode,
            FlowNodeTypeEnum.userSelect,
            FlowNodeTypeEnum.classifyQuestion
          ];
          const isSourceASpecial = sourceA && specialNodeTypes.includes(sourceA.data.flowNodeType);
          const isSourceBSpecial = sourceB && specialNodeTypes.includes(sourceB.data.flowNodeType);

          if (
            edgeA?.source === edgeB?.source &&
            (isSourceASpecial || isSourceBSpecial || !sourceA || !sourceB)
          ) {
            return getHandleIndex(edgeA, sourceA) - getHandleIndex(edgeB, sourceB);
          }
          return a.dagreNode.y - b.dagreNode.y;
        });

        let currentY =
          Math.min(...nodesInRank.map(({ dagreNode, node }) => dagreNode.y - node.height! / 2)) +
          offsetY;
        nodesInRank.forEach(({ node }) => {
          node.position = { x: minLeft + offsetX, y: currentY };
          currentY += node.height! + 80;
        });
      });
    };

    const updateParentNodesPosition = ({
      startNode,
      nodes,
      edges
    }: {
      startNode: Node<FlowNodeItemType>;
      nodes: Node<FlowNodeItemType>[];
      edges: any[];
    }) => {
      const startPosition = { x: startNode.position.x, y: startNode.position.y };

      const childNodeIdsSet = new Set(
        nodes.filter((node) => !!node.data.parentNodeId).map((node) => node.data.nodeId)
      );

      const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200 });

      nodes.forEach((node) => {
        if (childNodeIdsSet.has(node.data.nodeId)) return;
        dagreGraph.setNode(node.id, { width: node.width!, height: node.height! });
      });

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
      const offsetX = startPosition.x - (layoutedStartNode.x - startNode.width! / 2);
      const offsetY = startPosition.y - (layoutedStartNode.y - startNode.height! / 2);

      const nodesByRank: Map<
        number,
        Array<{ node: Node<FlowNodeItemType>; dagreNode: any }>
      > = new Map();

      nodes.forEach((node) => {
        if (!connectedNodeIds.has(node.id) || childNodeIdsSet.has(node.data.nodeId)) return;
        const nodeWithPosition = dagreGraph.node(node.id);
        const rank = Math.round(nodeWithPosition.x);
        if (!nodesByRank.has(rank)) nodesByRank.set(rank, []);
        nodesByRank.get(rank)!.push({ node, dagreNode: nodeWithPosition });
      });

      const nodesMap = new Map(nodes.map((n) => [n.id, n]));
      nodesByRank.forEach((nodesInRank) => {
        let minLeft = Infinity;
        nodesInRank.forEach(({ node, dagreNode }) => {
          const left = dagreNode.x - node.width! / 2;
          minLeft = Math.min(minLeft, left);
        });

        nodesInRank.sort((a, b) => {
          const edgeA = filteredEdges.find((e) => e.target === a.node.id);
          const edgeB = filteredEdges.find((e) => e.target === b.node.id);
          const sourceA = nodesMap.get(edgeA?.source);
          const sourceB = nodesMap.get(edgeB?.source);

          const specialNodeTypes = [
            FlowNodeTypeEnum.ifElseNode,
            FlowNodeTypeEnum.userSelect,
            FlowNodeTypeEnum.classifyQuestion
          ];
          const isSourceASpecial = sourceA && specialNodeTypes.includes(sourceA.data.flowNodeType);
          const isSourceBSpecial = sourceB && specialNodeTypes.includes(sourceB.data.flowNodeType);

          if (
            edgeA?.source === edgeB?.source &&
            (isSourceASpecial || isSourceBSpecial || !sourceA || !sourceB)
          ) {
            return getHandleIndex(edgeA, sourceA) - getHandleIndex(edgeB, sourceB);
          }
          return a.dagreNode.y - b.dagreNode.y;
        });

        let currentY =
          Math.min(...nodesInRank.map(({ dagreNode, node }) => dagreNode.y - node.height! / 2)) +
          offsetY;
        nodesInRank.forEach(({ node }) => {
          const targetX = minLeft + offsetX;
          const diffX = targetX - node.position.x;
          const diffY = currentY - node.position.y;

          node.position = { x: targetX, y: currentY };
          currentY += node.height! + 80;

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

    setNodes((nodes) => {
      let newNodes = cloneDeep(nodes);

      setEdges((edges) => {
        const childNodesIdSet = new Set();
        const childNodesMap: Record<string, Node<FlowNodeItemType>[]> = {};
        newNodes.forEach((node) => {
          const parentId = node.data.parentNodeId;
          if (parentId) {
            if (!node.width || !node.height) return;
            childNodesIdSet.add(parentId);
            if (!childNodesMap[parentId]) childNodesMap[parentId] = [];
            childNodesMap[parentId].push(node);
          }
        });
        const childNodesArr = Object.values(childNodesMap);
        if (childNodesArr.length > 0) {
          childNodesArr.forEach((childNodes) => {
            updateChildNodesPosition({ startNode: childNodes[0], nodes: childNodes, edges });
          });
        }

        const parentNodes = newNodes.filter((node) => childNodesIdSet.has(node.data.nodeId));
        parentNodes.forEach((node) => {
          const res = getParentNodeSizeAndPosition({ nodes: newNodes, parentId: node.data.nodeId });
          if (!res) return;
          const { parentX, parentY, nodeWidth, nodeHeight, childHeight, childWidth } = res;
          node.position = { x: parentX, y: parentY };
          node.width = nodeWidth;
          node.height = nodeHeight;
          node.data.inputs.forEach((input) => {
            if (input.key === NodeInputKeyEnum.nodeHeight) input.value = childHeight;
            else if (input.key === NodeInputKeyEnum.nodeWidth) input.value = childWidth;
          });
        });

        updateParentNodesPosition({
          startNode:
            newNodes.find((node) =>
              [
                FlowNodeTypeEnum.systemConfig,
                FlowNodeTypeEnum.pluginConfig,
                FlowNodeTypeEnum.workflowStart,
                FlowNodeTypeEnum.pluginInput
              ].includes(node.data.flowNodeType)
            ) || newNodes[0],
          nodes: newNodes,
          edges
        });
        return edges;
      });

      return newNodes;
    });

    setTimeout(() => {
      const validNodes = getNodes().filter((node) => node.width && node.height);
      fitView({ nodes: validNodes, padding: 0.3 });
    });
  }, [fitView, getNodes, getParentNodeSizeAndPosition, setEdges, setNodes]);

  return autoLayout;
}
