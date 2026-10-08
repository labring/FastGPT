import { useCallback, useRef, type MutableRefObject } from 'react';
import {
  type Connection,
  type NodeChange,
  type OnConnectStartParams,
  type EdgeChange,
  type Edge,
  type Node,
  type NodePositionChange,
  type XYPosition,
  useReactFlow,
  type NodeRemoveChange,
  type NodeSelectionChange
} from 'reactflow';
import {
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import 'reactflow/dist/style.css';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useKeyboard } from '../hooks/useKeyboard';
import { type THelperLine } from '@/web/core/workflow/type';
import {
  useWorkflowIssueFocusAction,
  useWorkflowIssueFocusRef,
  useWorkflowRuntime
} from '@/web/core/workflow/editor/session/workflowSession';
import { useCanvas } from '@/web/core/workflow/editor/react/useWorkflowQueries';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useMemoizedFn } from 'ahooks';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useWorkflowCanvasValue } from './workflowCanvasContext';
import { useWorkflowUIValue } from './canvasState';
import { useWorkflowModalValue } from '../panels/workflowPanelState';
import { type HelperLinesController } from '../components/HelperLines';
import { translateNodeContainerCheckError } from '@fastgpt/global/core/workflow/template/context';
import { areNodeRectsIntersecting, getNodeRect, type DimensionReader } from './nodeDimensions';

/** 只为真实发生位置变化的节点创建 geometry command；节点查找一次完成。 */
export const collectGeometryUpdates = ({
  nodeIds,
  currentNodes,
  getPreviousPosition
}: {
  nodeIds: Iterable<string>;
  currentNodes: readonly Pick<Node, 'id' | 'position'>[];
  getPreviousPosition: (nodeId: string) => XYPosition | undefined;
}) => {
  const currentNodesById = new Map(currentNodes.map((node) => [node.id, node]));
  return [...nodeIds].flatMap((nodeId) => {
    const node = currentNodesById.get(nodeId);
    if (!node) return [];
    const previousPosition = getPreviousPosition(nodeId);
    if (
      previousPosition &&
      previousPosition.x === node.position.x &&
      previousPosition.y === node.position.y
    ) {
      return [];
    }
    return [{ nodeId, position: node.position }];
  });
};

/** 只把拖拽结束的 position change 交给 Runtime；拖拽帧留在画布本地。 */
export const collectCommittedGeometryNodeIds = (changes: readonly NodeChange[]) =>
  new Set(
    changes
      .filter(
        (change): change is NodePositionChange => change.type === 'position' && !change.dragging
      )
      .map((change) => change.id)
  );

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
  getNodeDimension: DimensionReader;
};

/** 创建单次扫描器，调用方可在遍历节点的同时完成其他拖动计算。 */
export const createHelperLineScanner = ({
  change,
  node: nodeA,
  distance = 8,
  getNodeDimension
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

  const nodeABounds = getNodeRect(
    { ...nodeA, position: change.position },
    getNodeDimension(nodeA.id)
  );
  if (!nodeABounds) {
    return {
      scanNode: (_node: Node) => {},
      getResult: () => result
    };
  }

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

    const nodeBBounds = getNodeRect(nodeB, getNodeDimension(nodeB.id));
    if (!nodeBBounds) return;

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
  distance,
  getNodeDimension
}: ComputeHelperLinesParams): GetHelperLinesResult => {
  const scanner = createHelperLineScanner({ change, node, distance, getNodeDimension });
  for (const candidate of nodes) {
    if (!isCandidate || isCandidate(candidate)) scanner.scanNode(candidate);
  }
  return scanner.getResult();
};

export const popoverWidth = 400;
export const popoverHeight = 600;

type UseWorkflowParams = {
  helperLinesRef: MutableRefObject<HelperLinesController | null>;
};

/** 断连命令的画布边入参：投影边 id 是投影内部细节，不进 adapter。 */
export type EdgeDisconnectValue = {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
};

/**
 * 丢弃端点落在待删节点上的断连命令。
 * reactflow 的 deleteElements 先派生连线 remove 变更、再派生节点 remove 变更，而 runtime 的
 * removeNodes 已经级联删除相连边；被拒删除的节点（forbidDelete、条件循环最后一个 loopRunBreak）
 * 也必须保住自己的连线。所以同一批次里这些断连要么多余、要么有害。
 */
export const dropEdgeDisconnectsOfRemovedNodes = (
  edges: readonly EdgeDisconnectValue[],
  removedNodeIds: ReadonlySet<string>
): EdgeDisconnectValue[] =>
  edges.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target));

/**
 * 收集需要取消选中的节点 id：只留当前真的选中、且不是标红焦点的节点。
 *
 * 返回空数组意味着调用方一个变更都不该发：空变更也会换掉画布数组身份，带动全部节点卡片重渲染。
 * 标红焦点节点由投影层强制 `selected: true`（不经过任何变更事件），跳过它才不会在保存 gate
 * 定位之后把该节点的选中态清掉。
 */
export const collectClearSelectionIds = (nodes: readonly Node[], skipNodeId?: string): string[] =>
  nodes.filter((node) => node.selected && node.id !== skipNodeId).map((node) => node.id);

/**
 * 收集与本次选中互斥的节点 id（后操作优先）：选中容器就取消其已选中的子节点，
 * 选中子节点就取消其已选中的父容器；其余情况返回空数组，调用方一个变更都不发。
 *
 * `nodes` 是画布数组（`getNodes()` 读 ref，不订阅），只在点击选中时扫一遍，不在热路径上。
 */
export const collectSelectionConflictIds = ({
  nodes,
  node
}: {
  nodes: readonly Node[];
  node: Node;
}): string[] => {
  if (isNestedParentNodeType(node.data.flowNodeType)) {
    return collectClearSelectionIds(nodes.filter((item) => item.data.parentNodeId === node.id));
  }
  const parentId: string | undefined = node.data.parentNodeId;
  if (!parentId) return [];
  return collectClearSelectionIds(nodes.filter((item) => item.id === parentId));
};

/** 取消选中变更：只给命中的节点发 `select`，未命中节点保持对象身份。 */
const deselectChanges = (nodeIds: readonly string[]): NodeSelectionChange[] =>
  nodeIds.map((id) => ({ type: 'select' as const, id, selected: false }));

/**
 * 清空画布选中态：只对当前真的选中的节点发 `select` 变更，未选中节点保持对象身份。
 *
 * 为什么不用 `useReactFlow().setNodes`：受控模式下它把整个数组转成 N 个 `reset` 变更，
 * `applyNodeChanges` 一见 reset 就丢弃原数组整份重建（N 次对象展开 + 全部节点卡片重渲染）。
 *
 * ponytail: applyNodeChanges 对每个节点扫一遍变更（O(N*C)），1000 节点全选后清选中实测约 6ms；
 * 常规清选中 C 是个位数，0.1ms 以内。再快只能自己按 id 建 Map 重建数组，那会绕开唯一的变更漏斗。
 */
export const useClearCanvasSelection = () => {
  const applyNodeChanges = useWorkflowCanvasValue((v) => v.applyNodeChanges);
  const getNodes = useWorkflowCanvasValue((v) => v.getNodes);
  const issueFocusRef = useWorkflowIssueFocusRef();

  return useMemoizedFn(() => {
    const nodeIds = collectClearSelectionIds(getNodes(), issueFocusRef.current);
    if (nodeIds.length === 0) return;
    applyNodeChanges(deselectChanges(nodeIds));
  });
};

export const useCanvasController = ({ helperLinesRef }: UseWorkflowParams) => {
  const { toast } = useToast();
  const { t } = useTranslation();

  // 画布本地交互数组（拖拽帧、选中、测量尺寸）仍读 renderer 数组：handleNodesChange 要在
  // 应用变更后同步读回最终位置提交几何，reactflow store 得等下一次 commit 才刷新。
  // 这四个都是 useMemoizedFn，身份恒定；整体订阅会让每次投影（含拖拽帧）都刷新本 hook 的消费方。
  const applyNodeChanges = useWorkflowCanvasValue((v) => v.applyNodeChanges);
  const applyEdgeChanges = useWorkflowCanvasValue((v) => v.applyEdgeChanges);
  const getNodes = useWorkflowCanvasValue((v) => v.getNodes);
  // 只用写能力与事件期读取：稳定 action 句柄订阅数为零，画布组件不再随结构变化重渲染。
  const actions = useWorkflowActions();
  const canvas = useCanvas();

  /** 标红焦点归 host：取消选中标红节点时清除焦点，画布不再自己维护错误标记。 */
  const focusIssueNode = useWorkflowIssueFocusAction();
  const issueFocusRef = useWorkflowIssueFocusRef();
  const runtime = useWorkflowRuntime();
  // 三个都是 setState dispatcher，身份恒定；整体订阅会让 hover 带动本 hook 的消费方刷新。
  const setHoverEdgeId = useWorkflowUIValue((v) => v.setHoverEdgeId);
  const openContextMenu = useWorkflowUIValue((v) => v.openContextMenu);
  const closeContextMenu = useWorkflowUIValue((v) => v.closeContextMenu);
  const setConnectingEdge = useWorkflowUIValue((v) => v.setConnectingEdge);
  const openNodeTemplates = useWorkflowModalValue((v) => v.openNodeTemplates);

  const { flowToScreenPosition, getZoom, getNode, getEdge } = useReactFlow();
  const { isDowningCtrl } = useKeyboard();
  const getNodeDimension = useWorkflowCanvasValue((v) => v.getNodeDimension);

  /*
    删除批次里 onEdgesChange 早于 onNodesChange，此时还不知道节点会不会真被删掉。
    断连命令先攒进 ref，等同一批次的节点变更处理完再由微任务一次性提交：
    节点删除派生的连线会在那里被丢弃，剩下的才真正断连。
    不这么做的话，"删一个带两条连线的节点"会写出三条历史（两次断连 + 一次删节点）。
  */
  const pendingEdgeDisconnects = useRef<EdgeDisconnectValue[]>([]);
  const edgeDisconnectScheduled = useRef(false);

  const flushEdgeDisconnects = useMemoizedFn(() => {
    edgeDisconnectScheduled.current = false;
    const edges = pendingEdgeDisconnects.current;
    pendingEdgeDisconnects.current = [];
    if (edges.length > 0) actions.disconnectEdges(edges.map((edge) => ({ edge })));
  });

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
  const checkNodeOverLoopNode = useMemoizedFn((node: Node) => {
    if (!node || node.data.parentNodeId) return;

    const nodeRect = getNodeRect(node, getNodeDimension(node.id));
    if (!nodeRect) return;

    // ReactFlow bounds 只作为兼容字段；容器归属判定统一使用 Dimension Index。
    const parentNode = getNodes().find((item) => {
      if (item.id === node.id || item.data.isFolded || !isNestedParentNodeType(item.type ?? '')) {
        return false;
      }
      const parentRect = getNodeRect(item, getNodeDimension(item.id));
      return !!parentRect && areNodeRectsIntersecting(nodeRect, parentRect);
    });

    if (parentNode) {
      // 断连用的边集合在 attach 之前取：与改造前的渲染期快照同一时点，
      // 且不需要为了这一次事件期读取订阅整份结构。
      const currentEdges = actions.getEdges();
      const result = actions.attachToContainer(node.id, parentNode.id);
      if (!result.ok) {
        // 容器校验只在 runtime 跑一遍；拒绝原因随 dispatch 结果回来，app 只翻译。
        // 非容器拒绝（节点已在容器里、目标不是容器、自嵌套）没有用户文案，保持静默。
        if (result.error?.reason) {
          toast({
            status: 'warning',
            title: translateNodeContainerCheckError(result.error.reason, t)
          });
        }
        return;
      }
      // 旧行为是落入容器后删除该节点全部连线，按值断连避免投影 id 重排失效。
      currentEdges
        .filter((edge) => edge.source === node.id || edge.target === node.id)
        .forEach((edge) =>
          actions.disconnectEdge({
            edge: {
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle || '',
              targetHandle: edge.targetHandle || ''
            }
          })
        );
    }
  });

  const getTemplatesListPopoverPosition = useMemoizedFn(({ nodeId }: { nodeId: string | null }) => {
    const node = nodeId ? getNode(nodeId) : undefined;
    if (!node) return { x: 0, y: 0 };

    const position = flowToScreenPosition({
      x: node.position.x,
      y: node.position.y
    });

    const zoom = getZoom();

    const nodeWidth = getNodeDimension(node.id)?.width ?? 0;
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
      const node = nodeId ? getNode(nodeId) : undefined;
      if (!node) return { x: 0, y: 0 };

      if (handleId === 'selectedTools') {
        const nodeHeight = getNodeDimension(node.id)?.height ?? 0;
        return {
          x: node.position.x,
          y: node.position.y + nodeHeight + 80
        };
      }

      const nodeWidth = getNodeDimension(node.id)?.width ?? 0;
      return {
        x: node.position.x + nodeWidth + 120,
        y: node.position.y
      };
    }
  );

  /* node */
  const handleSelectNode = useMemoizedFn((change: NodeSelectionChange) => {
    // If the node is not selected and the Ctrl key is pressed, select the node
    if (change.selected === false && isDowningCtrl) {
      change.selected = true;
    }

    // 错误节点失焦（取消选中）时清除标红，与原版点击节点取消标红行为一致。
    // 标红焦点的权威在 host，直接比焦点 id，不再从投影塞进 data 的 isError 反推。
    if (!change.selected) {
      if (issueFocusRef.current === change.id) focusIssueNode(undefined);
      return;
    }

    // 父子互斥(后操作优先): 选父则取消其已选 children;选子则取消已选父。
    const node = getNode(change.id);
    if (!node) return;

    /** 只对确实选中的节点发 select 变更；全量 map 会换掉整份画布数组身份，带动所有节点卡片重渲染。 */
    const deselect = (nodeIds: string[]) => {
      if (nodeIds.length === 0) return;
      applyNodeChanges(deselectChanges(nodeIds));
    };

    deselect(collectSelectionConflictIds({ nodes: getNodes(), node }));
  });
  const handlePositionNode = useMemoizedFn(
    (change: NodePositionChange, node: Node<FlowNodeItemType>) => {
      // 拖拽热路径按帧读画布数组：吸附候选与容器子节点都属于 renderer 交互状态。
      const nodes = getNodes();

      // 场景1: 子节点拖拽 - 在父节点内移动
      if (node.data.parentNodeId) {
        const parentId = node.data.parentNodeId;
        if (change.dragging && change.position) {
          const helperLines = computeHelperLines({
            change,
            node,
            nodes,
            isCandidate: (candidate) => candidate.data.parentNodeId === parentId,
            getNodeDimension
          });
          applyHelperLineResult(change, helperLines);
        } else {
          helperLinesRef.current?.clear();
        }

        return [];
      }

      // 场景2: Loop 父节点拖拽 - 联动子节点
      if (isNestedParentNodeType(node.data.flowNodeType)) {
        const parentId = node.id;
        const helperLineScanner =
          change.dragging && change.position
            ? createHelperLineScanner({ change, node, getNodeDimension })
            : undefined;

        // 一次遍历同时收集子节点并扫描顶层吸附候选。
        const childNodes: Node[] = [];
        for (const n of nodes) {
          if (n.data.parentNodeId === parentId) {
            childNodes.push(n);
          } else if (!n.data.parentNodeId) {
            helperLineScanner?.scanNode(n);
          }
        }

        if (helperLineScanner) {
          applyHelperLineResult(change, helperLineScanner.getResult());
        } else {
          helperLinesRef.current?.clear();
        }

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
      if (change.dragging && change.position) {
        const helperLines = computeHelperLines({
          change,
          node,
          nodes,
          isCandidate: (candidate) => !candidate.data.parentNodeId,
          getNodeDimension
        });
        applyHelperLineResult(change, helperLines);
      } else {
        helperLinesRef.current?.clear();
      }

      return [];
    }
  );
  const handleNodesChange = useMemoizedFn((changes: NodeChange[]) => {
    const childChanges: NodeChange[] = [];
    const removableNodeIds: string[] = [];
    const removedIds = new Set(
      changes.filter((c): c is NodeRemoveChange => c.type === 'remove').map((c) => c.id)
    );
    // removedIds 会在校验中被剔除（forbidDelete、条件循环最后一个 break），
    // 这里另存完整的本批次试图删除集合，用来判定哪些断连是节点删除派生出来的。
    const attemptedNodeIds = new Set(removedIds);

    for (const change of changes) {
      if (change.type === 'remove') {
        const node = getNode(change.id);
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
          // store 返回的画布节点 data 是 any，显式收窄以便读取父容器的 loopRunMode 输入。
          const parent = getNode(node.data.parentNodeId) as Node<FlowNodeItemType> | undefined;
          const parentMode = parent?.data.inputs.find((i) => i.key === NodeInputKeyEnum.loopRunMode)
            ?.value as LoopRunModeEnum | undefined;
          if (
            parent?.data.flowNodeType === FlowNodeTypeEnum.loopRun &&
            parentMode === LoopRunModeEnum.conditional
          ) {
            const remainingBreak = getNodes().some(
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
        removableNodeIds.push(node.id);
      } else if (change.type === 'select') {
        handleSelectNode(change);
      } else if (change.type === 'position') {
        const node = getNode(change.id);
        if (node) {
          childChanges.push(...handlePositionNode(change, node));
        }
      }
    }

    const localChanges: NodeChange[] = [
      ...changes.filter((c) => c.type !== 'remove'),
      ...childChanges
    ];
    applyNodeChanges(localChanges);

    if (attemptedNodeIds.size > 0) {
      pendingEdgeDisconnects.current = dropEdgeDisconnectsOfRemovedNodes(
        pendingEdgeDisconnects.current,
        attemptedNodeIds
      );
    }

    if (removableNodeIds.length > 0) actions.removeNodes(removableNodeIds);

    const geometryNodeIds = collectCommittedGeometryNodeIds([...changes, ...childChanges]);
    if (geometryNodeIds.size > 0) {
      const currentNodes = getNodes();
      const geometryUpdates = collectGeometryUpdates({
        nodeIds: geometryNodeIds,
        currentNodes,
        getPreviousPosition: (nodeId) => runtime?.getNodeView(nodeId)?.position
      });
      if (geometryUpdates.length > 0) canvas.commitGeometry(geometryUpdates);
    }
  });

  const handleEdgeChange = useMemoizedFn((changes: EdgeChange[]) => {
    // 先从 store 解析被删的画布边，再按端点值断连：投影边 id 是投影内部细节，不进 adapter。
    const removedEdges = changes
      .filter((change) => change.type === 'remove')
      .map((change) => getEdge(change.id))
      .filter((edge): edge is Edge => !!edge)
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || '',
        targetHandle: edge.targetHandle || ''
      }));

    // 结构删除统一交给 runtime 重投影：这里不乐观移除画布边，
    // 否则节点删除被拒时画布先掉边、文档还留着，视图和数据会对不上。
    applyEdgeChanges(changes.filter((change) => change.type !== 'remove'));

    if (removedEdges.length === 0) return;
    pendingEdgeDisconnects.current.push(...removedEdges);
    if (edgeDisconnectScheduled.current) return;
    edgeDisconnectScheduled.current = true;
    queueMicrotask(flushEdgeDisconnects);
  });

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      helperLinesRef.current?.clear();
      checkNodeOverLoopNode(node);
    },
    [checkNodeOverLoopNode, helperLinesRef]
  );

  /* connect */
  const onConnectStart = useCallback(
    (event: any, params: OnConnectStartParams) => {
      const { nodeId, handleId } = params;
      if (!nodeId || params.handleType === 'target') return;

      // If node is folded, unfold it when connecting
      // 折叠存在 Node View 上，直接问 host runtime，不必经投影或文档 reader。
      if (runtime?.getNodeView(nodeId)?.isFolded) {
        canvas.commitGeometry([{ nodeId, isFolded: false }]);
      }
      // 拖拽开始时算一次 placement context 挂到连线状态：目标柄只按 target 应用纯规则，
      // 不再每个柄各自从画布数组重建 nodes/edges map。
      setConnectingEdge({
        ...params,
        context: runtime?.getPlacementContext({ node: { nodeId, handleId } }) ?? null
      });

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
            openNodeTemplates({
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
      runtime,
      setConnectingEdge,
      getTemplatesListPopoverPosition,
      getAddNodePosition,
      openNodeTemplates,
      canvas
    ]
  );
  const onConnectEnd = useCallback(() => {
    setConnectingEdge(undefined);
  }, [setConnectingEdge]);
  const onConnect = useCallback(
    ({ connect }: { connect: Connection }) => {
      if (!connect.source || !connect.target) return;
      actions.connectEdge({
        source: connect.source,
        target: connect.target,
        sourceHandle: connect.sourceHandle || '',
        targetHandle: connect.targetHandle || ''
      });
    },
    [actions]
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

      // 容器与模板上下文判定归 runtime 的 connectEdge：被拒时静默返回，与既有连线失败行为一致。
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
      openContextMenu({ top, left });
    },
    [openContextMenu]
  );
  const onPaneClick = useCallback(() => {
    closeContextMenu();
  }, [closeContextMenu]);

  // 旧的防抖全量快照推送已删除：历史由 Runtime 在每笔事务内维护。

  return {
    handleNodesChange,
    handleEdgeChange,
    onConnectStart,
    onConnectEnd,
    onConnect,
    customOnConnect,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onNodeDragStop,
    onPaneContextMenu,
    onPaneClick
  };
};
