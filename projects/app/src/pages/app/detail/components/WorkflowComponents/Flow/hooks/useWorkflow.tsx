import React, { useCallback, useState } from 'react';
import {
  Connection,
  NodeChange,
  OnConnectStartParams,
  addEdge,
  EdgeChange,
  Edge,
  Node,
  NodePositionChange,
  XYPosition,
  useReactFlow,
  getNodesBounds,
  Rect,
  NodeRemoveChange,
  NodeSelectionChange,
  EdgeRemoveChange
} from 'reactflow';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import 'reactflow/dist/style.css';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useKeyboard } from './useKeyboard';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { THelperLine } from '@fastgpt/global/core/workflow/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useDebounceEffect, useMemoizedFn } from 'ahooks';
import {
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '@fastgpt/global/core/workflow/template/input';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { WorkflowNodeEdgeContext, WorkflowInitContext } from '../../context/workflowInitContext';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppContext } from '../../../context';
import { WorkflowEventContext } from '../../context/workflowEventContext';

/* 
  Compute helper lines for snapping nodes to each other
  Refer: https://reactflow.dev/examples/interaction/helper-lines
*/
type GetHelperLinesResult = {
  horizontal?: THelperLine;
  vertical?: THelperLine;
  snapPosition: Partial<XYPosition>;
};
const computeHelperLines = (
  change: NodePositionChange,
  nodes: Node[],
  distance = 8 // distance to snap
): GetHelperLinesResult => {
  const nodeA = nodes.find((node) => node.id === change.id);

  if (!nodeA || !change.position) {
    return {
      horizontal: undefined,
      vertical: undefined,
      snapPosition: { x: undefined, y: undefined }
    };
  }

  const nodeABounds = {
    left: change.position.x,
    right: change.position.x + (nodeA.width ?? 0),
    top: change.position.y,
    bottom: change.position.y + (nodeA.height ?? 0),
    width: nodeA.width ?? 0,
    height: nodeA.height ?? 0,
    centerX: change.position.x + (nodeA.width ?? 0) / 2,
    centerY: change.position.y + (nodeA.height ?? 0) / 2
  };

  let horizontalDistance = distance;
  let verticalDistance = distance;

  return nodes
    .filter((node) => node.id !== nodeA.id)
    .reduce<GetHelperLinesResult>(
      (result, nodeB) => {
        if (!result.vertical) {
          result.vertical = {
            position: nodeABounds.centerX,
            nodes: []
          };
        }

        if (!result.horizontal) {
          result.horizontal = {
            position: nodeABounds.centerY,
            nodes: []
          };
        }

        const nodeBBounds = {
          left: nodeB.position.x,
          right: nodeB.position.x + (nodeB.width ?? 0),
          top: nodeB.position.y,
          bottom: nodeB.position.y + (nodeB.height ?? 0),
          width: nodeB.width ?? 0,
          height: nodeB.height ?? 0,
          centerX: nodeB.position.x + (nodeB.width ?? 0) / 2,
          centerY: nodeB.position.y + (nodeB.height ?? 0) / 2
        };

        const distanceLeftLeft = Math.abs(nodeABounds.left - nodeBBounds.left);
        const distanceRightRight = Math.abs(nodeABounds.right - nodeBBounds.right);
        const distanceLeftRight = Math.abs(nodeABounds.left - nodeBBounds.right);
        const distanceRightLeft = Math.abs(nodeABounds.right - nodeBBounds.left);
        const distanceTopTop = Math.abs(nodeABounds.top - nodeBBounds.top);
        const distanceBottomTop = Math.abs(nodeABounds.bottom - nodeBBounds.top);
        const distanceBottomBottom = Math.abs(nodeABounds.bottom - nodeBBounds.bottom);
        const distanceTopBottom = Math.abs(nodeABounds.top - nodeBBounds.bottom);
        const distanceCenterXCenterX = Math.abs(nodeABounds.centerX - nodeBBounds.centerX);
        const distanceCenterYCenterY = Math.abs(nodeABounds.centerY - nodeBBounds.centerY);

        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     A     |
        //  |___________|
        //  |
        //  |
        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     B     |
        //  |___________|
        if (distanceLeftLeft < verticalDistance) {
          result.snapPosition.x = nodeBBounds.left;
          result.vertical.position = nodeBBounds.left;
          result.vertical.nodes = [nodeABounds, nodeBBounds];
          verticalDistance = distanceLeftLeft;
        } else if (distanceLeftLeft === verticalDistance) {
          result.vertical.nodes.push(nodeBBounds);
        }

        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     A     |
        //  |___________|
        //              |
        //              |
        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     B     |
        //  |___________|
        if (distanceRightRight < verticalDistance) {
          result.snapPosition.x = nodeBBounds.right - nodeABounds.width;
          result.vertical.position = nodeBBounds.right;
          result.vertical.nodes = [nodeABounds, nodeBBounds];
          verticalDistance = distanceRightRight;
        } else if (distanceRightRight === verticalDistance) {
          result.vertical.nodes.push(nodeBBounds);
        }

        //              |‾‾‾‾‾‾‾‾‾‾‾|
        //              |     A     |
        //              |___________|
        //              |
        //              |
        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     B     |
        //  |___________|
        if (distanceLeftRight < verticalDistance) {
          result.snapPosition.x = nodeBBounds.right;
          result.vertical.position = nodeBBounds.right;
          result.vertical.nodes = [nodeABounds, nodeBBounds];
          verticalDistance = distanceLeftRight;
        } else if (distanceLeftRight === verticalDistance) {
          result.vertical.nodes.push(nodeBBounds);
        }

        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     A     |
        //  |___________|
        //              |
        //              |
        //              |‾‾‾‾‾‾‾‾‾‾‾|
        //              |     B     |
        //              |___________|
        if (distanceRightLeft < verticalDistance) {
          result.snapPosition.x = nodeBBounds.left - nodeABounds.width;
          result.vertical.position = nodeBBounds.left;
          result.vertical.nodes = [nodeABounds, nodeBBounds];
          verticalDistance = distanceRightLeft;
        } else if (distanceRightLeft === verticalDistance) {
          result.vertical.nodes.push(nodeBBounds);
        }

        //  |‾‾‾‾‾‾‾‾‾‾‾|‾‾‾‾‾|‾‾‾‾‾‾‾‾‾‾‾|
        //  |     A     |     |     B     |
        //  |___________|     |___________|
        if (distanceTopTop < horizontalDistance) {
          result.snapPosition.y = nodeBBounds.top;
          result.horizontal.position = nodeBBounds.top;
          result.horizontal.nodes = [nodeABounds, nodeBBounds];
          horizontalDistance = distanceTopTop;
        } else if (distanceTopTop === horizontalDistance) {
          result.horizontal.nodes.push(nodeBBounds);
        }

        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     A     |
        //  |___________|_________________
        //                    |           |
        //                    |     B     |
        //                    |___________|
        if (distanceBottomTop < horizontalDistance) {
          result.snapPosition.y = nodeBBounds.top - nodeABounds.height;
          result.horizontal.position = nodeBBounds.top;
          result.horizontal.nodes = [nodeABounds, nodeBBounds];
          horizontalDistance = distanceBottomTop;
        } else if (distanceBottomTop === horizontalDistance) {
          result.horizontal.nodes.push(nodeBBounds);
        }

        //  |‾‾‾‾‾‾‾‾‾‾‾|     |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     A     |     |     B     |
        //  |___________|_____|___________|
        if (distanceBottomBottom < horizontalDistance) {
          result.snapPosition.y = nodeBBounds.bottom - nodeABounds.height;
          result.horizontal.position = nodeBBounds.bottom;
          result.horizontal.nodes = [nodeABounds, nodeBBounds];
          horizontalDistance = distanceBottomBottom;
        } else if (distanceBottomBottom === horizontalDistance) {
          result.horizontal.nodes.push(nodeBBounds);
        }

        //                    |‾‾‾‾‾‾‾‾‾‾‾|
        //                    |     B     |
        //                    |           |
        //  |‾‾‾‾‾‾‾‾‾‾‾|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
        //  |     A     |
        //  |___________|
        if (distanceTopBottom < horizontalDistance) {
          result.snapPosition.y = nodeBBounds.bottom;
          result.horizontal.position = nodeBBounds.bottom;
          result.horizontal.nodes = [nodeABounds, nodeBBounds];
          horizontalDistance = distanceTopBottom;
        } else if (distanceTopBottom === horizontalDistance) {
          result.horizontal.nodes.push(nodeBBounds);
        }

        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     A     |
        //  |___________|
        //        |
        //        |
        //  |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     B     |
        //  |___________|
        if (distanceCenterXCenterX < verticalDistance) {
          result.snapPosition.x = nodeBBounds.centerX - nodeABounds.width / 2;
          result.vertical.position = nodeBBounds.centerX;
          result.vertical.nodes = [nodeABounds, nodeBBounds];
          verticalDistance = distanceCenterXCenterX;
        } else if (distanceCenterXCenterX === verticalDistance) {
          result.vertical.nodes.push(nodeBBounds);
        }

        //  |‾‾‾‾‾‾‾‾‾‾‾|    |‾‾‾‾‾‾‾‾‾‾‾|
        //  |     A     |----|     B     |
        //  |___________|    |___________|
        if (distanceCenterYCenterY < horizontalDistance) {
          result.snapPosition.y = nodeBBounds.centerY - nodeABounds.height / 2;
          result.horizontal.position = nodeBBounds.centerY;
          result.horizontal.nodes = [nodeABounds, nodeBBounds];
          horizontalDistance = distanceCenterYCenterY;
        } else if (distanceCenterYCenterY === horizontalDistance) {
          result.horizontal.nodes.push(nodeBBounds);
        }

        return result;
      },
      { snapPosition: { x: undefined, y: undefined } } as GetHelperLinesResult
    );
};

export const useWorkflow = () => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const appDetail = useContextSelector(AppContext, (e) => e.appDetail);

  const nodes = useContextSelector(WorkflowInitContext, (state) => state.nodes);
  const onNodesChange = useContextSelector(WorkflowNodeEdgeContext, (state) => state.onNodesChange);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (state) => state.edges);
  const setEdges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setEdges);
  const onEdgesChange = useContextSelector(WorkflowNodeEdgeContext, (v) => v.onEdgesChange);
  const { setConnectingEdge, nodeList, onChangeNode, pushPastSnapshot } = useContextSelector(
    WorkflowContext,
    (v) => v
  );
  const setHoverEdgeId = useContextSelector(WorkflowEventContext, (v) => v.setHoverEdgeId);
  const setMenu = useContextSelector(WorkflowEventContext, (v) => v.setMenu);

  const { getIntersectingNodes } = useReactFlow();
  const { isDowningCtrl } = useKeyboard();

  // Loop node size and position
  const resetParentNodeSizeAndPosition = useMemoizedFn((parentId: string) => {
    const { childNodes, loopNode } = nodes.reduce(
      (acc, node) => {
        if (node.data.parentNodeId === parentId) {
          acc.childNodes.push(node);
        }
        if (node.id === parentId) {
          acc.loopNode = node;
        }
        return acc;
      },
      { childNodes: [] as Node[], loopNode: undefined as Node<FlowNodeItemType> | undefined }
    );

    if (!loopNode) return;

    const rect = getNodesBounds(childNodes);
    // Calculate parent node size with minimum width/height constraints
    const width = Math.max(rect.width + 80, 840);
    const height = Math.max(rect.height + 80, 600);

    const offsetHeight =
      loopNode.data.inputs.find((input) => input.key === NodeInputKeyEnum.loopNodeInputHeight)
        ?.value ?? 83;

    // Update parentNode size and position
    onChangeNode({
      nodeId: parentId,
      type: 'updateInput',
      key: NodeInputKeyEnum.nodeWidth,
      value: {
        ...Input_Template_Node_Width,
        value: width
      }
    });
    onChangeNode({
      nodeId: parentId,
      type: 'updateInput',
      key: NodeInputKeyEnum.nodeHeight,
      value: {
        ...Input_Template_Node_Height,
        value: height
      }
    });
    // Update parentNode position
    onNodesChange([
      {
        id: parentId,
        type: 'position',
        position: {
          x: rect.x - 70,
          y: rect.y - offsetHeight - 240
        }
      }
    ]);
  });

  /* helper line */
  const [helperLineHorizontal, setHelperLineHorizontal] = useState<THelperLine>();
  const [helperLineVertical, setHelperLineVertical] = useState<THelperLine>();

  const checkNodeHelpLine = useMemoizedFn((change: NodeChange, nodes: Node[]) => {
    const positionChange = change.type === 'position' && change.dragging ? change : undefined;

    if (positionChange?.position) {
      // 只判断，3000px 内的 nodes，并按从近到远的顺序排序
      const filterNodes = nodes
        .filter((node) => {
          if (!positionChange.position) return false;

          return (
            Math.abs(node.position.x - positionChange.position.x) <= 3000 &&
            Math.abs(node.position.y - positionChange.position.y) <= 3000
          );
        })
        .sort((a, b) => {
          if (!positionChange.position) return 0;
          return (
            Math.abs(a.position.x - positionChange.position.x) +
            Math.abs(a.position.y - positionChange.position.y) -
            Math.abs(b.position.x - positionChange.position.x) -
            Math.abs(b.position.y - positionChange.position.y)
          );
        })
        .slice(0, 15);

      const helperLines = computeHelperLines(positionChange, filterNodes);

      positionChange.position.x = helperLines.snapPosition.x ?? positionChange.position.x;
      positionChange.position.y = helperLines.snapPosition.y ?? positionChange.position.y;

      setHelperLineHorizontal(helperLines.horizontal);
      setHelperLineVertical(helperLines.vertical);
    } else {
      setHelperLineHorizontal(undefined);
      setHelperLineVertical(undefined);
    }
  });

  // Check if a node is placed on top of a loop node
  const checkNodeOverLoopNode = useMemoizedFn((node: Node) => {
    const unSupportedTypes = [
      FlowNodeTypeEnum.workflowStart,
      FlowNodeTypeEnum.loop,
      FlowNodeTypeEnum.pluginInput,
      FlowNodeTypeEnum.pluginOutput,
      FlowNodeTypeEnum.systemConfig
    ];

    if (!node || node.data.parentNodeId) return;

    // 获取所有与当前节点相交的节点
    const intersections = getIntersectingNodes(node);
    // 获取所有与当前节点相交的节点中，类型为 loop 的节点且它不能是折叠状态
    const parentNode = intersections.find(
      (item) => !item.data.isFolded && item.type === FlowNodeTypeEnum.loop
    );

    if (parentNode) {
      if (unSupportedTypes.includes(node.type as FlowNodeTypeEnum)) {
        return toast({
          status: 'warning',
          title: t('workflow:can_not_loop')
        });
      }

      onChangeNode({
        nodeId: node.id,
        type: 'attr',
        key: 'parentNodeId',
        value: parentNode.id
      });
      // 删除当前节点与其他节点的连接
      setEdges((state) =>
        state.filter((edge) => edge.source !== node.id && edge.target !== node.id)
      );
    }
  });

  /* node */
  // Remove change node and its child nodes and edges
  const handleRemoveNode = useMemoizedFn((change: NodeRemoveChange, nodeId: string) => {
    // If the node has child nodes, remove the child nodes
    const deletedNodeIdList = [nodeId];
    const deletedEdgeIdList = edges
      .filter((edge) => edge.source === nodeId || edge.target === nodeId)
      .map((edge) => edge.id);

    const childNodes = nodes.filter((n) => n.data.parentNodeId === nodeId);
    if (childNodes.length > 0) {
      const childNodeIds = childNodes.map((node) => node.id);
      deletedNodeIdList.push(...childNodeIds);

      const childEdges = edges.filter(
        (edge) => childNodeIds.includes(edge.source) || childNodeIds.includes(edge.target)
      );
      deletedEdgeIdList.push(...childEdges.map((edge) => edge.id));
    }

    onNodesChange(
      deletedNodeIdList.map<NodeRemoveChange>((id) => ({
        type: 'remove',
        id
      }))
    );
    onEdgesChange(
      deletedEdgeIdList.map<EdgeRemoveChange>((id) => ({
        type: 'remove',
        id
      }))
    );
  });
  const handleSelectNode = useMemoizedFn((change: NodeSelectionChange) => {
    // If the node is not selected and the Ctrl key is pressed, select the node
    if (change.selected === false && isDowningCtrl) {
      change.selected = true;
    }
  });
  const handlePositionNode = useMemoizedFn(
    (change: NodePositionChange, node: Node<FlowNodeItemType>) => {
      const parentNode: Record<string, 1> = {
        [FlowNodeTypeEnum.loop]: 1
      };

      // If node is a child node, move child node and reset parent node
      if (node.data.parentNodeId) {
        const parentId = node.data.parentNodeId;
        const childNodes = nodes.filter((n) => n.data.parentNodeId === parentId);
        checkNodeHelpLine(change, childNodes);

        resetParentNodeSizeAndPosition(parentId);
      }
      // If node is parent node, move parent node and child nodes
      else if (parentNode[node.data.flowNodeType]) {
        // It will update the change value.
        checkNodeHelpLine(
          change,
          nodes.filter((node) => !node.data.parentNodeId)
        );

        // Compute the child nodes' position
        const parentId = node.id;
        const childNodes = nodes.filter((n) => n.data.parentNodeId === parentId);
        const initPosition = node.position;
        const deltaX = change.position?.x ? change.position.x - initPosition.x : 0;
        const deltaY = change.position?.y ? change.position.y - initPosition.y : 0;
        const childNodesChange: NodePositionChange[] = childNodes.map((node) => {
          if (change.dragging) {
            const position = {
              x: node.position.x + deltaX,
              y: node.position.y + deltaY
            };
            return {
              ...change,
              id: node.id,
              position,
              positionAbsolute: position
            };
          } else {
            return {
              ...change,
              id: node.id
            };
          }
        });

        onNodesChange(childNodesChange);
      } else {
        checkNodeHelpLine(
          change,
          nodes.filter((node) => !node.data.parentNodeId)
        );
      }
    }
  );
  const handleNodesChange = useMemoizedFn((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        const node = nodes.find((n) => n.id === change.id);
        if (!node) continue;

        const parentNodeDeleted = changes.find(
          (c) => c.type === 'remove' && c.id === node?.data.parentNodeId
        );
        // Forbidden delete && Parents are not deleted together
        if (node.data.forbidDelete && !parentNodeDeleted) {
          toast({
            status: 'warning',
            title: t('common:core.workflow.Can not delete node')
          });
          continue;
        }
        handleRemoveNode(change, node.id);
      } else if (change.type === 'select') {
        handleSelectNode(change);
      } else if (change.type === 'position') {
        const node = nodes.find((n) => n.id === change.id);
        if (node) {
          handlePositionNode(change, node);
        }
      }
    }

    // Remove separately
    onNodesChange(changes.filter((c) => c.type !== 'remove'));
  });

  const handleEdgeChange = useCallback(
    (changes: EdgeChange[]) => {
      // If any node is selected, don't remove edges
      const changesFiltered = changes.filter(
        (change) => !(change.type === 'remove' && nodes.some((node) => node.selected))
      );

      onEdgesChange(changesFiltered);
    },
    [nodes, onEdgesChange]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      checkNodeOverLoopNode(node);
    },
    [checkNodeOverLoopNode]
  );

  /* connect */
  const onConnectStart = useCallback(
    (event: any, params: OnConnectStartParams) => {
      if (!params.nodeId) return;

      // If node is folded, unfold it when connecting
      const sourceNode = nodeList.find((node) => node.nodeId === params.nodeId);
      if (sourceNode?.isFolded) {
        return onChangeNode({
          nodeId: params.nodeId,
          type: 'attr',
          key: 'isFolded',
          value: false
        });
      }
      setConnectingEdge(params);
    },
    [nodeList, setConnectingEdge, onChangeNode]
  );
  const onConnectEnd = useCallback(() => {
    setConnectingEdge(undefined);
  }, [setConnectingEdge]);
  const onConnect = useCallback(
    ({ connect }: { connect: Connection }) => {
      setEdges((state) =>
        addEdge(
          {
            ...connect,
            type: EDGE_TYPE
          },
          state
        )
      );

      // Add default input
      const node = nodeList.find((n) => n.nodeId === connect.target);
      if (!node) return;

      // 1. Add file input
      if (
        node.flowNodeType === FlowNodeTypeEnum.chatNode ||
        node.flowNodeType === FlowNodeTypeEnum.tools ||
        node.flowNodeType === FlowNodeTypeEnum.appModule
      ) {
        const input = node.inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList);
        if (input && (!input?.value || input.value.length === 0)) {
          const workflowStartNode = nodeList.find(
            (n) => n.flowNodeType === FlowNodeTypeEnum.workflowStart
          );
          if (!workflowStartNode) return;
          onChangeNode({
            nodeId: node.nodeId,
            type: 'updateInput',
            key: NodeInputKeyEnum.fileUrlList,
            value: {
              ...input,
              value: [[workflowStartNode.nodeId, NodeOutputKeyEnum.userFiles]]
            }
          });
        }
      }
    },
    [nodeList, onChangeNode, setEdges]
  );
  const customOnConnect = useCallback(
    (connect: Connection) => {
      if (!connect.sourceHandle || !connect.targetHandle) {
        return;
      }
      if (connect.source === connect.target) {
        return toast({
          status: 'warning',
          title: t('common:core.module.Can not connect self')
        });
      }

      onConnect({
        connect
      });
    },
    [onConnect, t, toast]
  );

  /* edge */
  const onEdgeMouseEnter = useCallback(
    (e: any, edge: Edge) => {
      setHoverEdgeId(edge.id);
    },
    [setHoverEdgeId]
  );
  const onEdgeMouseLeave = useCallback(() => {
    setHoverEdgeId(undefined);
  }, [setHoverEdgeId]);

  // context menu
  const onPaneContextMenu = useCallback(
    (e: any) => {
      // Prevent native context menu from showing
      e.preventDefault();

      setMenu({
        top: e.clientY - 64,
        left: e.clientX - 12
      });
    },
    [setMenu]
  );

  const onPaneClick = useCallback(() => {
    setMenu(null);
  }, [setMenu]);

  // Watch
  // Auto save snapshot
  useDebounceEffect(
    () => {
      if (nodes.length === 0 || !appDetail.chatConfig) return;

      pushPastSnapshot({
        pastNodes: nodes,
        pastEdges: edges,
        customTitle: formatTime2YMDHMS(new Date()),
        chatConfig: appDetail.chatConfig
      });
    },
    [nodes, edges, appDetail.chatConfig, pushPastSnapshot],
    { wait: 500 }
  );

  return {
    handleNodesChange,
    handleEdgeChange,
    onConnectStart,
    onConnectEnd,
    onConnect,
    customOnConnect,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    helperLineHorizontal,
    helperLineVertical,
    onNodeDragStop,
    onPaneContextMenu,
    onPaneClick,
    resetParentNodeSizeAndPosition
  };
};

export default function Dom() {
  return <></>;
}
