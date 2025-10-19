import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  type Connection,
  type NodeChange,
  type OnConnectStartParams,
  addEdge,
  type EdgeChange,
  type Edge,
  type Node,
  type NodePositionChange,
  type XYPosition,
  useReactFlow,
  type NodeRemoveChange,
  type NodeSelectionChange,
  type EdgeRemoveChange
} from 'reactflow';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import 'reactflow/dist/style.css';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useKeyboard } from './useKeyboard';
import { useContextSelector } from 'use-context-selector';
import { type THelperLine } from '@/web/core/workflow/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useDebounceEffect, useMemoizedFn } from 'ahooks';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  WorkflowBufferDataContext,
  WorkflowInitContext,
  WorkflowNodeDataContext
} from '../../context/workflowInitContext';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppContext } from '../../../context';
import { WorkflowSnapshotContext } from '../../context/workflowSnapshotContext';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { WorkflowUIContext } from '../../context/workflowUIContext';
import { WorkflowModalContext } from '../../context/workflowModalContext';
import { WorkflowLayoutContext } from '../../context/workflowComputeContext';

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

const useRAF = () => {
  const { resetParentNodeSizeAndPosition } = useContextSelector(WorkflowLayoutContext, (v) => v);

  // Loop child drag RAF 节流相关
  const childRafIdRef = useRef<number>();
  const pendingUpdateRef = useRef<{ parentId: string } | null>(null);
  const scheduleParentSizeUpdate = useCallback(
    (parentId: string) => {
      // 记录待更新的 parentId
      pendingUpdateRef.current = { parentId };

      // 如果已有待执行的 RAF，不重复请求
      if (childRafIdRef.current) return;

      // 请求下一帧执行更新
      childRafIdRef.current = requestAnimationFrame(() => {
        childRafIdRef.current = undefined;

        if (pendingUpdateRef.current) {
          const { parentId } = pendingUpdateRef.current;
          pendingUpdateRef.current = null;

          // 执行实际的尺寸更新（使用批量版本）
          resetParentNodeSizeAndPosition(parentId);
        }
      });
    },
    [resetParentNodeSizeAndPosition]
  );

  // Helper line RAF 节流相关
  const helperLineRafIdRef = useRef<number>();
  const pendingHelperLineRef = useRef<{
    change: NodeChange;
    nodes: Node[];
    setHorizontal: (line?: THelperLine) => void;
    setVertical: (line?: THelperLine) => void;
  } | null>(null);

  const scheduleHelperLineUpdate = useCallback(
    (
      change: NodeChange,
      nodes: Node[],
      setHorizontal: (line?: THelperLine) => void,
      setVertical: (line?: THelperLine) => void
    ) => {
      // 记录待更新的辅助线信息
      pendingHelperLineRef.current = { change, nodes, setHorizontal, setVertical };

      // 如果已有待执行的 RAF,不重复请求
      if (helperLineRafIdRef.current) return;

      // 请求下一帧执行更新
      helperLineRafIdRef.current = requestAnimationFrame(() => {
        helperLineRafIdRef.current = undefined;

        if (pendingHelperLineRef.current) {
          const { change, nodes, setHorizontal, setVertical } = pendingHelperLineRef.current;
          pendingHelperLineRef.current = null;

          // 执行实际的辅助线计算
          const positionChange = change.type === 'position' && change.dragging ? change : undefined;

          if (positionChange?.position) {
            const dragPos = positionChange.position;

            // 一次遍历: 过滤 3000px 范围内的节点 + 计算距离
            const candidateNodes: Array<{ node: Node; distance: number }> = [];

            for (const node of nodes) {
              const dx = Math.abs(node.position.x - dragPos.x);
              const dy = Math.abs(node.position.y - dragPos.y);

              if (dx <= 3000 && dy <= 3000) {
                const distance = dx + dy;
                candidateNodes.push({ node, distance });
              }
            }

            // 部分排序: 按距离从近到远排序,只取前 15 个
            candidateNodes.sort((a, b) => a.distance - b.distance);
            const filterNodes = candidateNodes.slice(0, 15).map((item) => item.node);

            const helperLines = computeHelperLines(positionChange, filterNodes);

            positionChange.position.x = helperLines.snapPosition.x ?? positionChange.position.x;
            positionChange.position.y = helperLines.snapPosition.y ?? positionChange.position.y;

            setHorizontal(helperLines.horizontal);
            setVertical(helperLines.vertical);
          } else {
            setHorizontal(undefined);
            setVertical(undefined);
          }
        }
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      if (childRafIdRef.current) {
        cancelAnimationFrame(childRafIdRef.current);
      }
      if (helperLineRafIdRef.current) {
        cancelAnimationFrame(helperLineRafIdRef.current);
      }
    };
  }, []);

  return {
    scheduleParentSizeUpdate,
    scheduleHelperLineUpdate
  };
};

export const popoverWidth = 400;
export const popoverHeight = 600;
// Loop 类型的父节点类型集合
const PARENT_NODE_TYPES = new Set([FlowNodeTypeEnum.loop]);

export const useWorkflow = () => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const appDetail = useContextSelector(AppContext, (e) => e.appDetail);

  const { nodes, getRawNodeById } = useContextSelector(WorkflowInitContext, (state) => state);
  const { onNodesChange, workflowStartNode, getNodeById, edges, setEdges, onEdgesChange } =
    useContextSelector(WorkflowBufferDataContext, (state) => state);
  const selectedNodesMap = useContextSelector(WorkflowNodeDataContext, (v) => v.selectedNodesMap);

  const { setConnectingEdge, onChangeNode } = useContextSelector(WorkflowActionsContext, (v) => v);
  const pushPastSnapshot = useContextSelector(WorkflowSnapshotContext, (v) => v.pushPastSnapshot);

  const { setHoverEdgeId, setMenu } = useContextSelector(WorkflowUIContext, (v) => v);
  const setHandleParams = useContextSelector(WorkflowModalContext, (v) => v.setHandleParams);

  const { getIntersectingNodes, flowToScreenPosition, getZoom } = useReactFlow();
  const { isDowningCtrl } = useKeyboard();

  const { scheduleParentSizeUpdate, scheduleHelperLineUpdate } = useRAF();

  /* helper line */
  const [helperLineHorizontal, setHelperLineHorizontal] = useState<THelperLine>();
  const [helperLineVertical, setHelperLineVertical] = useState<THelperLine>();

  const checkNodeHelpLine = useCallback(
    (change: NodeChange, nodes: Node[]) => {
      scheduleHelperLineUpdate(change, nodes, setHelperLineHorizontal, setHelperLineVertical);
    },
    [scheduleHelperLineUpdate]
  );

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

  const getTemplatesListPopoverPosition = useMemoizedFn(({ nodeId }: { nodeId: string | null }) => {
    const node = getRawNodeById(nodeId);
    if (!node) return { x: 0, y: 0 };

    const position = flowToScreenPosition({
      x: node.position.x,
      y: node.position.y
    });

    const zoom = getZoom();

    let x = position.x + (node.width || 0) * zoom;
    let y = position.y;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const margin = 20;

    // Check right boundary
    if (x + popoverWidth + margin > viewportWidth) {
      x = Math.max(margin, position.x + (node.width || 0) * zoom - popoverWidth - 30);
    }

    // Check bottom boundary
    if (y + popoverHeight + margin > viewportHeight) {
      y = Math.max(margin, viewportHeight - popoverHeight - margin);
    }

    // Check top boundary
    if (y < margin) {
      y = margin;
    }

    return { x, y };
  });
  const getAddNodePosition = useMemoizedFn(
    ({ nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
      const node = getRawNodeById(nodeId);
      if (!node) return { x: 0, y: 0 };

      if (handleId === 'selectedTools') {
        return {
          x: node.position.x,
          y: node.position.y + (node.height || 0) + 80
        };
      }

      return {
        x: node.position.x + (node.width || 0) + 120,
        y: node.position.y
      };
    }
  );

  /* node */
  // Remove change node and its child nodes and edges
  const handleRemoveNode = useCallback(
    (change: NodeRemoveChange, nodeId: string) => {
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
    },
    [edges, nodes, onNodesChange, onEdgesChange]
  );
  const handleSelectNode = useMemoizedFn((change: NodeSelectionChange) => {
    // If the node is not selected and the Ctrl key is pressed, select the node
    if (change.selected === false && isDowningCtrl) {
      change.selected = true;
    }
  });
  const handlePositionNode = useMemoizedFn(
    (change: NodePositionChange, node: Node<FlowNodeItemType>) => {
      // 场景1: 子节点拖拽 - 在父节点内移动
      if (node.data.parentNodeId) {
        const parentId = node.data.parentNodeId;
        const childNodes = nodes.filter((n) => n.data.parentNodeId === parentId);
        checkNodeHelpLine(change, childNodes);

        // 使用 RAF 节流的更新
        scheduleParentSizeUpdate(parentId);
        return [];
      }

      // 场景2: Loop 父节点拖拽 - 联动子节点
      if (PARENT_NODE_TYPES.has(node.data.flowNodeType)) {
        const parentId = node.id;

        // 一次 reduce 同时获取 topLevelNodes 和 childNodes
        const { topLevelNodes, childNodes } = nodes.reduce(
          (acc, n) => {
            if (n.data.parentNodeId === parentId) {
              acc.childNodes.push(n);
            } else if (!n.data.parentNodeId) {
              acc.topLevelNodes.push(n);
            }
            return acc;
          },
          { topLevelNodes: [] as Node[], childNodes: [] as Node[] }
        );

        // 计算对齐辅助线 (仅针对顶层节点)
        checkNodeHelpLine(change, topLevelNodes);

        // 计算子节点的位置变化
        if (childNodes.length > 0) {
          const initPosition = node.position;
          const deltaX = change.position?.x ? change.position.x - initPosition.x : 0;
          const deltaY = change.position?.y ? change.position.y - initPosition.y : 0;

          const childNodesChange: NodePositionChange[] = childNodes.map((childNode) => {
            if (change.dragging) {
              const position = {
                x: childNode.position.x + deltaX,
                y: childNode.position.y + deltaY
              };
              return {
                ...change,
                id: childNode.id,
                position,
                positionAbsolute: position
              };
            }
            return {
              ...change,
              id: childNode.id
            };
          });

          return childNodesChange;
        }
        return [];
      }

      // 场景3: 普通节点拖拽 - 显示对齐辅助线
      checkNodeHelpLine(
        change,
        nodes.filter((node) => !node.data.parentNodeId)
      );

      return [];
    }
  );
  const handleNodesChange = useMemoizedFn((changes: NodeChange[]) => {
    const childChanges: NodeChange[] = [];

    for (const change of changes) {
      if (change.type === 'remove') {
        const node = getRawNodeById(change.id);
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
        const node = getRawNodeById(change.id);
        if (node) {
          childChanges.push(...handlePositionNode(change, node));
        }
      }
    }

    // Remove separately
    onNodesChange(changes.filter((c) => c.type !== 'remove').concat(childChanges as any));
  });

  const handleEdgeChange = useCallback(
    (changes: EdgeChange[]) => {
      // If any node is selected, don't remove edges
      const hasSelectedNode = Object.keys(selectedNodesMap).length > 0;
      const changesFiltered = changes.filter(
        (change) => !(change.type === 'remove' && hasSelectedNode)
      );

      onEdgesChange(changesFiltered);
    },
    [selectedNodesMap, onEdgesChange]
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
      const { nodeId, handleId } = params;
      if (!nodeId) return;

      // If node is folded, unfold it when connecting
      const sourceNode = getNodeById(nodeId);
      if (sourceNode?.isFolded) {
        onChangeNode({
          nodeId,
          type: 'attr',
          key: 'isFolded',
          value: false
        });
      }
      setConnectingEdge(params);

      // Check connect or click(If the mouse position remains basically unchanged, it indicates a click)
      if (params.handleId) {
        const initialX = event.clientX;
        const initialY = event.clientY;
        const startTime = Date.now();

        const handleMouseUp = (moveEvent: MouseEvent) => {
          document.removeEventListener('mouseup', handleMouseUp);

          const currentX = moveEvent.clientX;
          const currentY = moveEvent.clientY;
          const endTime = Date.now();
          const pressDuration = endTime - startTime;

          if (
            Math.abs(currentX - initialX) <= 5 &&
            Math.abs(currentY - initialY) <= 5 &&
            pressDuration < 500
          ) {
            const popoverPosition = getTemplatesListPopoverPosition({ nodeId });
            const addNodePosition = getAddNodePosition({ nodeId, handleId });
            setHandleParams({
              ...params,
              popoverPosition,
              addNodePosition
            });
          }
        };

        document.addEventListener('mouseup', handleMouseUp);
      }
    },
    [
      getNodeById,
      setConnectingEdge,
      onChangeNode,
      getTemplatesListPopoverPosition,
      getAddNodePosition,
      setHandleParams
    ]
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
      const node = getNodeById(connect.target);
      if (!node) return;

      // 1. Add file input
      if (
        node.flowNodeType === FlowNodeTypeEnum.chatNode ||
        node.flowNodeType === FlowNodeTypeEnum.agent ||
        node.flowNodeType === FlowNodeTypeEnum.appModule
      ) {
        const input = node.inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList);
        if (input && (!input?.value || input.value.length === 0)) {
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
    [setEdges, getNodeById, workflowStartNode, onChangeNode]
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
    [nodes, edges, appDetail.chatConfig],
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
    onPaneClick
  };
};

export default function Dom() {
  return <></>;
}
