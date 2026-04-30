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
import {
  EDGE_TYPE,
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
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
  限定容量的最大堆,根为当前最大距离。用于 Top-K 最近邻筛选,
  避免 O(n log n) 全排序,改为 O(n log k)。
*/
export const createBoundedMaxHeap = <T,>(capacity: number) => {
  const data: Array<{ value: T; key: number }> = [];

  const siftUp = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (data[p].key >= data[i].key) break;
      const tmp = data[p];
      data[p] = data[i];
      data[i] = tmp;
      i = p;
    }
  };

  const siftDown = (i: number) => {
    const n = data.length;
    while (true) {
      const l = i * 2 + 1;
      const r = l + 1;
      let largest = i;
      if (l < n && data[l].key > data[largest].key) largest = l;
      if (r < n && data[r].key > data[largest].key) largest = r;
      if (largest === i) break;
      const tmp = data[i];
      data[i] = data[largest];
      data[largest] = tmp;
      i = largest;
    }
  };

  return {
    tryAdd(value: T, key: number) {
      if (data.length < capacity) {
        data.push({ value, key });
        siftUp(data.length - 1);
      } else if (capacity > 0 && key < data[0].key) {
        data[0] = { value, key };
        siftDown(0);
      }
    },
    values(): T[] {
      return data.map((item) => item.value);
    }
  };
};

/*
  从 rawNodes 中筛出距 dragPos 曼哈顿距离最近的前 k 个,
  同时排除在任一轴上超过 limit 的节点。
*/
export const collectNearestNodes = (
  rawNodes: Node[],
  dragPos: XYPosition,
  limit: number,
  k: number
): Node[] => {
  const heap = createBoundedMaxHeap<Node>(k);
  for (const n of rawNodes) {
    const dx = Math.abs(n.position.x - dragPos.x);
    const dy = Math.abs(n.position.y - dragPos.y);
    if (dx > limit || dy > limit) continue;
    heap.tryAdd(n, dx + dy);
  }
  return heap.values();
};

/*
  Compute helper lines for snapping nodes to each other
  Refer: https://reactflow.dev/examples/interaction/helper-lines
*/
type GetHelperLinesResult = {
  horizontal?: THelperLine;
  vertical?: THelperLine;
  snapPosition: Partial<XYPosition>;
};
export const computeHelperLines = (
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

export const useRAF = () => {
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
            // Top-K 堆替代全量排序,O(n log k) 替代 O(n log n)
            const filterNodes = collectNearestNodes(nodes, positionChange.position, 3000, 15);

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

export const useWorkflow = () => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const appDetail = useContextSelector(AppContext, (e) => e.appDetail);

  const { nodes, getRawNodeById } = useContextSelector(WorkflowInitContext, (state) => state);
  const {
    onNodesChange,
    setNodes,
    workflowStartNode,
    getNodeById,
    edges,
    setEdges,
    onEdgesChange
  } = useContextSelector(WorkflowBufferDataContext, (state) => state);
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

  // 同步计算并应用辅助线吸附。父节点拖动场景下,子节点的 delta 依赖 change.position,
  // 必须在 delta 计算前完成吸附,不能走 RAF 异步突变。
  // 调用方需传入已按距离筛选过的 Top-K 节点,避免与其他遍历重复扫全量节点。
  const applyHelperLineSnapSync = useMemoizedFn(
    (change: NodePositionChange, nearestNodes: Node[]) => {
      if (!change.dragging || !change.position) return;

      const helperLines = computeHelperLines(change, nearestNodes);
      change.position.x = helperLines.snapPosition.x ?? change.position.x;
      change.position.y = helperLines.snapPosition.y ?? change.position.y;
      setHelperLineHorizontal(helperLines.horizontal);
      setHelperLineVertical(helperLines.vertical);
    }
  );

  // Check if a node is placed on top of a nested parent node (loop / parallelRun / loopRun)
  const checkNodeOverLoopNode = useMemoizedFn((node: Node) => {
    const unSupportedInLoop = [
      FlowNodeTypeEnum.workflowStart,
      FlowNodeTypeEnum.loop,
      FlowNodeTypeEnum.loopRun,
      FlowNodeTypeEnum.parallelRun,
      FlowNodeTypeEnum.pluginInput,
      FlowNodeTypeEnum.pluginOutput,
      FlowNodeTypeEnum.systemConfig
    ];
    // Interactive nodes are silently ignored in parallel (not added to parent)
    const unSupportedInParallel = [
      ...unSupportedInLoop,
      FlowNodeTypeEnum.userSelect,
      FlowNodeTypeEnum.formInput
    ];

    if (!node || node.data.parentNodeId) return;

    // 获取所有与当前节点相交的节点中，类型为嵌套父容器且未折叠的节点
    const intersections = getIntersectingNodes(node);
    const parentNode = intersections.find(
      (item) => !item.data.isFolded && isNestedParentNodeType(item.type ?? '')
    );

    if (parentNode) {
      if (
        node.type === FlowNodeTypeEnum.loopRunBreak &&
        parentNode.type !== FlowNodeTypeEnum.loopRun
      ) {
        return toast({
          status: 'warning',
          title: t('workflow:loop_run_break_must_inside_loop_run')
        });
      }

      const isParallel = parentNode.type === FlowNodeTypeEnum.parallelRun;
      const unSupportedTypes = isParallel ? unSupportedInParallel : unSupportedInLoop;
      if (unSupportedTypes.includes(node.type as FlowNodeTypeEnum)) {
        return toast({
          status: 'warning',
          title: t(isParallel ? 'workflow:can_not_parallel' : 'workflow:can_not_loop')
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

    // 父子互斥(后操作优先): 选父则取消其已选 children;选子则取消已选父。
    if (!change.selected) return;
    const node = getRawNodeById(change.id);
    if (!node) return;

    if (isNestedParentNodeType(node.data.flowNodeType)) {
      setNodes((curr) =>
        curr.map((n) =>
          n.data.parentNodeId === node.id && n.selected ? { ...n, selected: false } : n
        )
      );
    } else if (node.data.parentNodeId) {
      const parent = getRawNodeById(node.data.parentNodeId);
      if (parent?.selected) {
        setNodes((curr) => curr.map((n) => (n.id === parent.id ? { ...n, selected: false } : n)));
      }
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
      if (isNestedParentNodeType(node.data.flowNodeType)) {
        const parentId = node.id;
        const dragPos = change.position;
        const shouldSnap = !!change.dragging && !!dragPos;

        // 一次遍历同时完成三件事:
        //   1) 收集子节点 (后续应用 delta)
        //   2) 过滤 3000px 范围内的顶层节点
        //   3) Top-K 堆维护最近 15 个候选,免掉全量排序
        const childNodes: Node[] = [];
        const topKHeap = createBoundedMaxHeap<Node>(15);
        for (const n of nodes) {
          if (n.data.parentNodeId === parentId) {
            childNodes.push(n);
          } else if (!n.data.parentNodeId && shouldSnap && dragPos) {
            const dx = Math.abs(n.position.x - dragPos.x);
            const dy = Math.abs(n.position.y - dragPos.y);
            if (dx <= 3000 && dy <= 3000) {
              topKHeap.tryAdd(n, dx + dy);
            }
          }
        }

        // 同步吸附辅助线:父拖动场景下,子节点 delta 依赖 change.position,
        // 若走 RAF 异步会与父节点吸附结果错位,子节点每次吸附都会偏移并最终跳出父节点
        applyHelperLineSnapSync(change, topKHeap.values());

        // 计算子节点的位置变化 (此处 change.position 已是吸附后值)
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
    const removedIds = new Set(
      changes.filter((c): c is NodeRemoveChange => c.type === 'remove').map((c) => c.id)
    );

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
        // Conditional loopRun must retain at least one loopRunBreak child.
        if (
          node.data.flowNodeType === FlowNodeTypeEnum.loopRunBreak &&
          node.data.parentNodeId &&
          !parentNodeDeleted
        ) {
          const parent = getRawNodeById(node.data.parentNodeId);
          const parentMode = parent?.data.inputs.find((i) => i.key === NodeInputKeyEnum.loopRunMode)
            ?.value as LoopRunModeEnum | undefined;
          if (
            parent?.data.flowNodeType === FlowNodeTypeEnum.loopRun &&
            parentMode === LoopRunModeEnum.conditional
          ) {
            const remainingBreak = nodes.some(
              (n) =>
                n.data.parentNodeId === parent.id &&
                n.data.flowNodeType === FlowNodeTypeEnum.loopRunBreak &&
                !removedIds.has(n.id)
            );
            if (!remainingBreak) {
              toast({
                status: 'warning',
                title: t('workflow:loop_run_conditional_requires_break')
              });
              removedIds.delete(change.id);
              continue;
            }
          }
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
      setHelperLineHorizontal(undefined);
      setHelperLineVertical(undefined);
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
        node.flowNodeType === FlowNodeTypeEnum.toolCall ||
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

      // Context menu dimensions
      const contextMenuWidth = 120;
      const contextMenuHeight = 120;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 10;

      let top = e.clientY + 6;
      let left = e.clientX - 12;

      // Check right boundary
      if (left + contextMenuWidth + margin > viewportWidth) {
        left = Math.max(margin, e.clientX - contextMenuWidth);
      }

      // Check bottom boundary
      if (top + contextMenuHeight + margin > viewportHeight) {
        top = Math.max(margin, viewportHeight - contextMenuHeight - margin);
      }
      setMenu({ top, left });
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
