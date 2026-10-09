import React, { useCallback, useRef, useEffect, type MutableRefObject } from 'react';
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
  type EdgeRemoveChange,
  type OnNodeDrag
} from '@xyflow/react';
import {
  EDGE_TYPE,
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useKeyboard } from './useKeyboard';
import { useContextSelector } from 'use-context-selector';
import { type THelperLine } from '@/web/core/workflow/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { collectWorkflowStartInputAutoFillPatches } from '@/web/core/workflow/workflowStartAutoFill';
import { useDebounceEffect, useMemoizedFn } from 'ahooks';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  WorkflowBufferDataContext,
  WorkflowNodeDataContext
} from '../../context/workflowInitContext';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppContext } from '../../../context';
import type { FastGPTWorkflowNode } from '../../context/type';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { WorkflowModalContext } from '../../context/workflowModalContext';
import { WorkflowLayoutContext } from '../../context/workflowComputeContext';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { type HelperLinesController } from '../components/HelperLines';
import {
  buildNodeTemplateContext,
  getNodeContainerCheckError,
  isNodeConnectionAllowed,
  translateNodeContainerCheckError
} from '@fastgpt/global/core/workflow/template/context';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';

/*
  限定容量的最大堆,根为当前最大距离。保留为通用最近邻筛选工具,
  辅助线拖动热路径不再依赖该结构。
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

/** 筛选限定范围内曼哈顿距离最近的前 k 个节点。 */
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
export type GetHelperLinesResult = {
  horizontal?: THelperLine;
  vertical?: THelperLine;
  snapPosition: Partial<XYPosition>;
};

type CreateHelperLineScannerParams = {
  change: NodePositionChange;
  node?: Node;
  distance?: number;
};

/** 创建单次扫描器，调用方可在遍历节点的同时完成其他拖动计算。 */
export const createHelperLineScanner = ({
  change,
  node: nodeA,
  distance = 8
}: CreateHelperLineScannerParams) => {
  const result: GetHelperLinesResult = {
    snapPosition: { x: undefined, y: undefined }
  };

  if (!nodeA || !change.position) {
    return {
      scanNode: (_node: Node) => {},
      getResult: () => result
    };
  }

  const nodeAWidth = nodeA.measured?.width ?? 0;
  const nodeAHeight = nodeA.measured?.height ?? 0;

  const nodeABounds = {
    left: change.position.x,
    right: change.position.x + nodeAWidth,
    top: change.position.y,
    bottom: change.position.y + nodeAHeight,
    width: nodeAWidth,
    height: nodeAHeight,
    centerX: change.position.x + nodeAWidth / 2,
    centerY: change.position.y + nodeAHeight / 2
  };

  let horizontalDistance = distance;
  let verticalDistance = distance;

  const scanNode = (nodeB: Node) => {
    if (nodeB.id === nodeA.id) return;

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

    const nodeBWidth = nodeB.measured?.width ?? 0;
    const nodeBHeight = nodeB.measured?.height ?? 0;

    const nodeBBounds = {
      left: nodeB.position.x,
      right: nodeB.position.x + nodeBWidth,
      top: nodeB.position.y,
      bottom: nodeB.position.y + nodeBHeight,
      width: nodeBWidth,
      height: nodeBHeight,
      centerX: nodeB.position.x + nodeBWidth / 2,
      centerY: nodeB.position.y + nodeBHeight / 2
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
  };

  return {
    scanNode,
    getResult: () => result
  };
};

type ComputeHelperLinesParams = CreateHelperLineScannerParams & {
  nodes: Node[];
  isCandidate?: (node: Node) => boolean;
};

/** 单次遍历候选节点并计算吸附位置及辅助线。 */
export const computeHelperLines = ({
  change,
  node,
  nodes,
  isCandidate,
  distance
}: ComputeHelperLinesParams): GetHelperLinesResult => {
  const scanner = createHelperLineScanner({ change, node, distance });
  for (const candidate of nodes) {
    if (!isCandidate || isCandidate(candidate)) scanner.scanNode(candidate);
  }
  return scanner.getResult();
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

  useEffect(() => {
    return () => {
      if (childRafIdRef.current) {
        cancelAnimationFrame(childRafIdRef.current);
      }
    };
  }, []);

  return {
    scheduleParentSizeUpdate
  };
};

export const popoverWidth = 400;
export const popoverHeight = 600;

type UseWorkflowParams = {
  helperLinesRef: MutableRefObject<HelperLinesController | null>;
};

export const useWorkflow = ({ helperLinesRef }: UseWorkflowParams) => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const appDetail = useContextSelector(AppContext, (e) => e.appDetail);

  const nodes = useWorkflowStore((s) => s.nodes);
  const getRawNodeById = useWorkflowStore((s) => s.getRawNodeById);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const edges = useWorkflowStore((s) => s.edges);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const getNodeById = useWorkflowStore((s) => s.getNodeById);
  const workflowStartNode = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v.workflowStartNode
  );
  const selectedNodesMap = useContextSelector(WorkflowNodeDataContext, (v) => v.selectedNodesMap);

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const onUpdateNodeError = useContextSelector(WorkflowActionsContext, (v) => v.onUpdateNodeError);
  const setConnectingEdge = useContextSelector(WorkflowActionsContext, (v) => v.setConnectingEdge);

  const pushPastSnapshot = useWorkflowStore((s) => s.pushPastSnapshot);
  const setHoverEdgeId = useWorkflowStore((s) => s.setHoverEdgeId);
  const setMenu = useWorkflowStore((s) => s.setMenu);
  const setHandleParams = useContextSelector(WorkflowModalContext, (v) => v.setHandleParams);

  const { getIntersectingNodes, flowToScreenPosition, getZoom, getEdges } = useReactFlow();
  const { isDowningCtrl } = useKeyboard();

  const { scheduleParentSizeUpdate } = useRAF();

  // 记录父容器节点拖拽周期中的初始绝对坐标快照，用于子节点等量同步位移
  const dragParentMapRef = useRef<
    Map<
      string,
      {
        parentStartPos: XYPosition;
        childrenStartPos: Map<string, XYPosition>;
      }
    >
  >(new Map());

  /** 同步应用吸附结果，并命令式绘制当前帧辅助线。 */
  const applyHelperLineResult = useMemoizedFn(
    (change: NodePositionChange, helperLines: GetHelperLinesResult) => {
      if (!change.dragging || !change.position) {
        helperLinesRef.current?.clear();
        return;
      }

      change.position.x = helperLines.snapPosition.x ?? change.position.x;
      change.position.y = helperLines.snapPosition.y ?? change.position.y;
      helperLinesRef.current?.draw(helperLines);
    }
  );

  // Check if a node is placed on top of a nested parent node (loop / parallelRun / loopRun)
  const checkNodeOverLoopNode = useMemoizedFn((node: Node<FlowNodeItemType>) => {
    if (!node || node.data.parentNodeId || isNestedParentNodeType(node.data.flowNodeType)) return;

    // 获取所有与当前节点相交的节点中，类型为嵌套父容器且未折叠的节点
    const intersections = getIntersectingNodes(node) as Node<FlowNodeItemType>[];
    const parentNode = intersections.find(
      (item) => !item.data.isFolded && isNestedParentNodeType(item.type ?? '')
    );

    if (parentNode) {
      const containerChildNodes = nodes.filter(
        (item) => item.data.parentNodeId === parentNode.data.nodeId
      );
      const containerContext = buildNodeTemplateContext({
        sourceNode: undefined,
        edges,
        getNodeById,
        isSidebar: true,
        targetParentType: parentNode.data.flowNodeType,
        hasToolNode: containerChildNodes.some(
          (item) => item.data.flowNodeType === FlowNodeTypeEnum.toolCall
        ),
        hasLoopRunNode: containerChildNodes.some(
          (item) => item.data.flowNodeType === FlowNodeTypeEnum.loopRun
        )
      });
      if (containerContext) {
        const checkError = getNodeContainerCheckError({
          node: node.data,
          context: containerContext
        });
        if (checkError) {
          return toast({
            status: 'warning',
            title: translateNodeContainerCheckError(checkError, t)
          });
        }
      }

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) {
            return {
              ...n,
              zIndex: 2001,
              data: {
                ...n.data,
                parentNodeId: parentNode.id
              }
            };
          }
          return n;
        })
      );
      // 删除当前节点与其他节点的连接
      setEdges((state) =>
        state.filter((edge) => edge.source !== node.id && edge.target !== node.id)
      );
      scheduleParentSizeUpdate(parentNode.id);
    }
  });

  /** 获取节点在画布坐标系中的绝对坐标 */
  const getNodeCanvasPosition = useMemoizedFn((nodeId: string | null) => {
    const node = getRawNodeById(nodeId);
    return node?.position ?? { x: 0, y: 0 };
  });

  const getTemplatesListPopoverPosition = useMemoizedFn(({ nodeId }: { nodeId: string | null }) => {
    const node = getRawNodeById(nodeId);
    if (!node) return { x: 0, y: 0 };

    const canvasPos = getNodeCanvasPosition(nodeId);

    const position = flowToScreenPosition({
      x: canvasPos.x,
      y: canvasPos.y
    });

    const zoom = getZoom();

    const nodeWidth = node.measured?.width ?? node.width ?? node.initialWidth ?? 350;

    let x = position.x + nodeWidth * zoom;
    let y = position.y;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const margin = 20;

    // Check right boundary
    if (x + popoverWidth + margin > viewportWidth) {
      x = Math.max(margin, position.x + nodeWidth * zoom - popoverWidth - 30);
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

      const canvasPos = getNodeCanvasPosition(nodeId);
      const nodeWidth = node.measured?.width ?? node.width ?? node.initialWidth ?? 350;
      const nodeHeight = node.measured?.height ?? node.height ?? node.initialHeight ?? 100;

      if (handleId === 'selectedTools') {
        return {
          x: canvasPos.x,
          y: canvasPos.y + nodeHeight + 80
        };
      }

      return {
        x: canvasPos.x + nodeWidth + 120,
        y: canvasPos.y
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

    // 错误节点失焦（取消选中）时清除标红，与原版点击节点取消标红行为一致。
    if (!change.selected) {
      const node = getRawNodeById(change.id);
      if (node?.data.isError) {
        onUpdateNodeError(node.data.nodeId, false);
      }
      return;
    }

    // 父子互斥(后操作优先): 选父则取消其已选 children;选子则取消已选父。
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
        if (change.dragging && change.position) {
          const helperLines = computeHelperLines({
            change,
            node,
            nodes,
            isCandidate: (candidate) => candidate.data.parentNodeId === parentId
          });
          applyHelperLineResult(change, helperLines);
        } else {
          helperLinesRef.current?.clear();
        }

        // 使用 RAF 节流的更新
        scheduleParentSizeUpdate(parentId);
        return [];
      }

      // 场景2: Loop/嵌套父节点拖拽 - 联动子节点
      if (isNestedParentNodeType(node.data.flowNodeType)) {
        const parentId = node.id;
        const helperLineScanner =
          change.dragging && change.position
            ? createHelperLineScanner({ change, node })
            : undefined;

        if (helperLineScanner) {
          const currentNodes = useWorkflowStore.getState().nodes;
          for (const n of currentNodes) {
            if (!n.data.parentNodeId && n.id !== parentId) {
              helperLineScanner.scanNode(n);
            }
          }
          applyHelperLineResult(change, helperLineScanner.getResult());
        } else {
          helperLinesRef.current?.clear();
        }

        // 维护本次拖拽周期的初始绝对坐标快照，避免逐帧相对累加导致的浮点误差与时序漂移
        let dragState = dragParentMapRef.current.get(parentId);
        if (!dragState) {
          const currentNodes = useWorkflowStore.getState().nodes;
          const parentNodeInStore = currentNodes.find((n) => n.id === parentId);
          const parentStartPos = parentNodeInStore
            ? { ...parentNodeInStore.position }
            : change.position
              ? { ...change.position }
              : { x: 0, y: 0 };

          const childrenStartPos = new Map<string, XYPosition>();
          const collectDescendants = (pid: string): void => {
            for (const n of currentNodes) {
              if (n.data.parentNodeId === pid) {
                childrenStartPos.set(n.id, { ...n.position });
                if (isNestedParentNodeType(n.data.flowNodeType)) {
                  collectDescendants(n.id);
                }
              }
            }
          };
          collectDescendants(parentId);

          dragState = { parentStartPos, childrenStartPos };
          dragParentMapRef.current.set(parentId, dragState);
        }

        const currentParentX = change.position?.x ?? dragState.parentStartPos.x;
        const currentParentY = change.position?.y ?? dragState.parentStartPos.y;
        const totalDeltaX = currentParentX - dragState.parentStartPos.x;
        const totalDeltaY = currentParentY - dragState.parentStartPos.y;

        const childNodesChange: NodePositionChange[] = [];
        for (const [childId, startPos] of dragState.childrenStartPos.entries()) {
          const targetPos: XYPosition = {
            x: startPos.x + totalDeltaX,
            y: startPos.y + totalDeltaY
          };

          childNodesChange.push({
            id: childId,
            type: 'position',
            position: targetPos,
            positionAbsolute: targetPos,
            dragging: false
          });
        }

        // 拖拽生命周期结束，清理缓存
        if (!change.dragging) {
          dragParentMapRef.current.delete(parentId);
        }

        return childNodesChange;
      }

      // 场景3: 普通节点拖拽 - 显示对齐辅助线
      if (change.dragging && change.position) {
        const helperLines = computeHelperLines({
          change,
          node,
          nodes,
          isCandidate: (candidate) => !candidate.data.parentNodeId
        });
        applyHelperLineResult(change, helperLines);
      } else {
        helperLinesRef.current?.clear();
      }

      return [];
    }
  );
  const handleNodesChange = useMemoizedFn((changes: NodeChange<FastGPTWorkflowNode>[]) => {
    const childChanges: NodePositionChange[] = [];
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
      } else if (change.type === 'dimensions') {
        const node = getRawNodeById(change.id);
        const parentId = node?.data?.parentNodeId;
        if (parentId) {
          scheduleParentSizeUpdate(parentId);
        }
      }
    }

    // Remove separately
    const nonRemoveChanges = changes.filter((c) => c.type !== 'remove');
    onNodesChange([...nonRemoveChanges, ...childChanges]);
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

  const onNodeDragStop: OnNodeDrag<FastGPTWorkflowNode> = useCallback(
    (_, node) => {
      helperLinesRef.current?.clear();
      dragParentMapRef.current.clear();
      checkNodeOverLoopNode(node);
    },
    [checkNodeOverLoopNode, helperLinesRef]
  );

  /* connect */
  const onConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      const { nodeId, handleId } = params;
      if (!nodeId || params.handleType === 'target') return;

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
        const initialX = 'clientX' in event ? event.clientX : (event.touches[0]?.clientX ?? 0);
        const initialY = 'clientY' in event ? event.clientY : (event.touches[0]?.clientY ?? 0);
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
      const nextEdges = addEdge(
        {
          ...connect,
          type: EDGE_TYPE
        },
        edges
      );

      setEdges((state) =>
        addEdge(
          {
            ...connect,
            type: EDGE_TYPE
          },
          state
        )
      );

      if (!workflowStartNode) return;

      const patches = collectWorkflowStartInputAutoFillPatches({
        nodes,
        edges: nextEdges,
        workflowStartNode
      });

      if (patches.length > 0) {
        onChangeNode(patches.map((patch) => ({ ...patch, type: 'updateInput' as const })));
      }
    },
    [edges, nodes, onChangeNode, setEdges, workflowStartNode]
  );
  /** 校验连线合法性，供 xyflow 原生拖拽高亮与最终提交共用 */
  const isValidConnection = useCallback(
    (connect: Connection | Edge) => {
      if (!connect.source || !connect.target) return false;
      if (connect.source === connect.target) return false;
      if (!connect.sourceHandle || !connect.targetHandle) return false;

      const sourceNode = getNodeById(connect.source);
      const targetNode = getNodeById(connect.target);
      if (!sourceNode || !targetNode) return false;

      // 容器边界校验: 必须在同一层级 (相同 parentNodeId)
      if ((sourceNode.parentNodeId || '') !== (targetNode.parentNodeId || '')) return false;

      const currentEdges = getEdges();

      // 同一源句柄不能重复连接到同一目标节点的同一目标句柄
      const isDuplicate = currentEdges.some(
        (edge) =>
          edge.source === connect.source &&
          edge.target === connect.target &&
          edge.sourceHandle === connect.sourceHandle &&
          edge.targetHandle === connect.targetHandle
      );
      if (isDuplicate) return false;

      // 如果目标节点已有 selectedTools 连入，禁止其他普通句柄连入；反之亦然
      for (const edge of currentEdges) {
        if (edge.target === connect.target) {
          if (
            edge.targetHandle === NodeInputKeyEnum.selectedTools &&
            connect.targetHandle !== NodeInputKeyEnum.selectedTools
          ) {
            return false;
          }
          if (
            edge.targetHandle !== NodeInputKeyEnum.selectedTools &&
            connect.targetHandle === NodeInputKeyEnum.selectedTools
          ) {
            return false;
          }
        }
      }

      const targetTemplate = moduleTemplatesFlat.find(
        (item) => item.id === targetNode.flowNodeType
      );
      return isNodeConnectionAllowed({
        targetTemplate,
        targetNode,
        sourceNode,
        edges: currentEdges,
        handleId: connect.sourceHandle,
        getNodeById
      });
    },
    [getEdges, getNodeById]
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

      if (!isValidConnection(connect)) {
        return;
      }

      onConnect({
        connect
      });
    },
    [isValidConnection, onConnect, t, toast]
  );

  const edgeHoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  /* edge */
  const onEdgeMouseEnter = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      if (edgeHoverTimerRef.current) {
        clearTimeout(edgeHoverTimerRef.current);
        edgeHoverTimerRef.current = null;
      }
      setHoverEdgeId(edge.id);
    },
    [setHoverEdgeId]
  );
  const onEdgeMouseLeave = useCallback(() => {
    if (edgeHoverTimerRef.current) {
      clearTimeout(edgeHoverTimerRef.current);
    }
    edgeHoverTimerRef.current = setTimeout(() => {
      setHoverEdgeId(undefined);
      edgeHoverTimerRef.current = null;
    }, 150);
  }, [setHoverEdgeId]);

  useEffect(() => {
    return () => {
      if (edgeHoverTimerRef.current) {
        clearTimeout(edgeHoverTimerRef.current);
      }
    };
  }, []);

  // context menu
  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
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
    isValidConnection,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onNodeDragStop,
    onPaneContextMenu,
    onPaneClick
  };
};

export default function Dom() {
  return <></>;
}
