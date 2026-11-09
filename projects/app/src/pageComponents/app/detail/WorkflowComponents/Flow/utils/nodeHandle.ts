import type { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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
  replacesDefaultSource: boolean;
};

/** shell 端口固定在卡片右边缘；离屏时仅复用测量出的纵坐标。 */
export const getNodeShellHandleAnchor = ({
  isFolded,
  cardWidth,
  center
}: {
  isFolded: boolean;
  cardWidth: number;
  center?: { x: number; y: number };
}) => {
  if (isFolded || !center) return;
  return { left: cardWidth, top: center.y };
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
  const replacesDefaultSource =
    node.flowNodeType === FlowNodeTypeEnum.ifElseNode ||
    node.flowNodeType === FlowNodeTypeEnum.userSelect ||
    node.flowNodeType === FlowNodeTypeEnum.classifyQuestion;

  return {
    sourceHandles: getFoldedSourceHandleIds({
      ...node,
      showSourceHandle: node.showSourceHandle === true
    }).map((handleId) => ({
      handleId,
      translate: [9, 0]
    })),
    replacesDefaultSource
  };
};
