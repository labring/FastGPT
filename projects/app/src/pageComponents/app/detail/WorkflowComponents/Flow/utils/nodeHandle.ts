import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { getFoldedSourceHandleIds } from '../nodes/render/Handle/utils';

type NodeShellHandleInput = {
  key: string;
  value?: FlowNodeInputItemType['value'];
  renderTypeList?: ReadonlyArray<FlowNodeInputItemType['renderTypeList'][number]>;
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

/** 根据测量到的输出柄横坐标，计算把视觉位置推到卡片右边缘所需的偏移。 */
export const getNodeShellHandleOffset = ({
  cardWidth,
  centerX
}: {
  cardWidth: number;
  centerX?: number;
}) => (centerX === undefined ? 0 : cardWidth - centerX);

/** 根据折叠与测量状态选择唯一的 handle 宿主，避免拓扑缺失或重复挂载。 */
export const getNodeHandleRenderMode = ({
  isFolded,
  renderFull,
  hasMeasuredDynamicHandles,
  isMeasurement
}: {
  isFolded: boolean;
  renderFull: boolean;
  hasMeasuredDynamicHandles: boolean;
  isMeasurement: boolean;
}) => ({
  // 折叠卡片不渲染业务内容里的分支柄，shell 必须始终保留完整拓扑。
  renderShellHandles: isFolded || !renderFull || (hasMeasuredDynamicHandles && !isMeasurement),
  renderFullHandles: !isFolded && (isMeasurement || !hasMeasuredDynamicHandles)
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

  const foldedNode = {
    ...node,
    id: node.nodeId,
    nodeId: node.nodeId,
    name: '',
    showSourceHandle: node.showSourceHandle === true,
    inputs: node.inputs.map((input) => ({
      ...input,
      label: '',
      renderTypeList: [...(input.renderTypeList ?? [])]
    })),
    outputs: node.outputs.map((output) => ({
      ...output,
      id: output.key,
      label: output.label ?? ''
    }))
  };

  return {
    sourceHandles: getFoldedSourceHandleIds(foldedNode).map((handleId) => ({
      handleId,
      translate: [9, 0]
    })),
    replacesDefaultSource
  };
};
