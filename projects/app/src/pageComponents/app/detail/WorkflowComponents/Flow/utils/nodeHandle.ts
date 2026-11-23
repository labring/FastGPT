import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import type {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { getFoldedSourceHandleIds } from '../nodes/render/Handle/utils';

type NodeShellHandleInput = {
  key: string;
  value?: FlowNodeInputItemType['value'];
  renderTypeList?: readonly FlowNodeInputItemType['renderTypeList'][number][];
  selectedType?: FlowNodeInputItemType['selectedType'];
};

export type NodeShellHandleData = {
  nodeId: string;
  flowNodeType: FlowNodeTypeEnum;
  inputs: ReadonlyArray<NodeShellHandleInput>;
  showSourceHandle?: boolean;
  outputs: ReadonlyArray<{
    key: string;
    type: FlowNodeOutputTypeEnum;
    label?: string;
    invalid?: boolean;
  }>;
  catchError?: boolean;
};

export type NodeShellSourceHandle = {
  handleId: string;
  translate: [number, number];
};

export type NodeShellHandleModel = {
  sourceHandles: NodeShellSourceHandle[];
  showDefaultSource: boolean;
};

/** 展开 shell 复用实测中心；折叠时所有端口共享卡片右边缘。 */
export const getNodeShellHandleAnchor = ({
  isFolded,
  center
}: {
  isFolded: boolean;
  center?: { x: number; y: number };
}) => {
  if (isFolded || !center) return;
  return { left: center.x, top: center.y };
};

/** Portal 端口与卡片同属 React Flow 节点；以卡片左上角换算到未缩放的坐标。 */
export const getNodeSourceHandleCenters = (card: HTMLElement, handleIds: readonly string[]) => {
  const centers = new Map<string, { x: number; y: number }>();
  if (handleIds.length === 0) return centers;

  const node = card.closest('.react-flow__node') ?? card;
  const expectedIds = new Set(handleIds);
  const cardRect = card.getBoundingClientRect();
  const scaleX = card.offsetWidth > 0 ? cardRect.width / card.offsetWidth : 1;
  const scaleY = card.offsetHeight > 0 ? cardRect.height / card.offsetHeight : 1;
  if (scaleX <= 0 || scaleY <= 0) return centers;

  node.querySelectorAll<HTMLElement>('[data-workflow-source-handle-id]').forEach((handle) => {
    const handleId = handle.dataset.workflowSourceHandleId;
    if (!handleId || !expectedIds.has(handleId)) return;

    const rect = handle.getBoundingClientRect();
    centers.set(handleId, {
      x: (rect.left + rect.width / 2 - cardRect.left) / scaleX,
      y: (rect.top + rect.height / 2 - cardRect.top) / scaleY
    });
  });
  return centers;
};

/** 根据折叠与完整渲染状态选择唯一的 handle 宿主，避免拓扑缺失或重复挂载。 */
export const getNodeHandleRenderMode = ({
  isFolded,
  renderFull
}: {
  isFolded: boolean;
  renderFull: boolean;
}) => ({
  // 展开态的独立端口由业务内容提供；只有折叠或离屏 shell 才由 shell 合并端口位置。
  renderShellHandles: isFolded || !renderFull,
  renderFullHandles: !isFolded && renderFull
});

/**
 * 从节点数据恢复 shell 必须保留的 source handle 拓扑。
 * handleId 与完整节点共用同一生成规则；shell 只提供稳定占位，不写回节点或边状态。
 */
export const getNodeShellHandleModel = (node: NodeShellHandleData): NodeShellHandleModel => {
  const showDefaultSource = node.showSourceHandle === true;
  const defaultSourceId = getHandleId(node.nodeId, 'source', 'right');

  return {
    sourceHandles: getFoldedSourceHandleIds({
      ...node,
      showSourceHandle: false
    })
      .filter((handleId) => !showDefaultSource || handleId !== defaultSourceId)
      .map((handleId) => ({ handleId, translate: [9, 0] })),
    showDefaultSource
  };
};
